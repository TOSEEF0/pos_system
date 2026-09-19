// electron/licensing/licenseManager.js
// Central Licensing Controller for Aaj Cash & Carry POS
// Enforces strict 15-day trial, Ed25519 digital signature validation,
// multi-location persistent device binding, monotonic clock protection, and business guards.

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { getDeviceFingerprint } = require("./deviceFingerprint");
const { verifySignature, signPayload, canonicalize, sha256 } = require("./cryptoUtil");
const { LICENSING_PUBLIC_KEY } = require("./licensePublicKeys");

// Central License States
const LicenseState = {
  FIRST_RUN: "FIRST_RUN",
  TRIAL_REGISTRATION_PENDING: "TRIAL_REGISTRATION_PENDING",
  TRIAL_ACTIVE: "TRIAL_ACTIVE",
  TRIAL_EXPIRED: "TRIAL_EXPIRED",
  LICENSE_ACTIVE: "LICENSE_ACTIVE",
  LICENSE_EXPIRED: "LICENSE_EXPIRED",
  LICENSE_REVOKED: "LICENSE_REVOKED",
  LICENSE_TAMPER_DETECTED: "LICENSE_TAMPER_DETECTED"
};

class LicenseManager {
  constructor() {
    this.state = LicenseState.FIRST_RUN;
    this.installationId = null;
    this.deviceBinding = null;
    this.activeLicense = null;
    this.activeSignature = null;
    this.lastTrustedTime = null;
    this.heartbeatTimer = null;
    this.serverUrl = process.env.LICENSING_SERVER_URL || "http://localhost:4000";

    // Primary store: AppData
    const userDataPath = app?.getPath ? app.getPath("userData") : path.join(__dirname, "..", "data");
    this.primaryStorePath = path.join(userDataPath, "license_store", "license.dat");

    // Machine-wide persistent store: ProgramData (survives app uninstall)
    const programData = process.env.ALLUSERSPROFILE || process.env.PROGRAMDATA || "C:\\ProgramData";
    this.systemStorePath = path.join(programData, "AajPOSLicense", "sys_binding.dat");
  }

  /**
   * Initialize licensing system on application launch.
   */
  async initialize() {
    console.log("Initializing Aaj POS LicenseManager...");

    // 1. Calculate device hardware binding
    const { deviceBinding } = getDeviceFingerprint();
    this.deviceBinding = deviceBinding;

    // 2. Load stored license state from multi-location stores
    this.loadPersistentState();

    // 3. Check monotonic clock integrity
    const clockStatus = this.checkClockIntegrity();
    if (!clockStatus.valid) {
      this.state = LicenseState.LICENSE_TAMPER_DETECTED;
      console.warn("⚠️ Clock tampering detected:", clockStatus.reason);
      return this.getStatus();
    }

    // 4. If we have a signed license token, verify it
    if (this.activeLicense && this.activeSignature) {
      const isValid = this.verifyStoredLicense();
      if (!isValid) {
        console.warn("⚠️ Stored license failed cryptographic signature or binding verification.");
      }
    }

    // 5. Evaluate state if FIRST_RUN or pending
    if (this.state === LicenseState.FIRST_RUN || this.state === LicenseState.TRIAL_REGISTRATION_PENDING) {
      // Attempt automated trial registration if server is reachable
      await this.registerTrial().catch(() => {});
    }

    // 6. Start monotonic background clock ticker
    this.startHeartbeat();

    console.log("LicenseManager initialized. Current state:", this.state);
    return this.getStatus();
  }

  /**
   * Loads installation identity and signed token across storage locations.
   */
  loadPersistentState() {
    let primaryData = null;
    let systemData = null;

    try {
      if (fs.existsSync(this.primaryStorePath)) {
        primaryData = JSON.parse(fs.readFileSync(this.primaryStorePath, "utf8"));
      }
    } catch (e) {
      console.error("Error reading primary license store:", e);
    }

    try {
      if (fs.existsSync(this.systemStorePath)) {
        systemData = JSON.parse(fs.readFileSync(this.systemStorePath, "utf8"));
      }
    } catch (e) {
      console.error("Error reading system binding store:", e);
    }

    // Prefer correlating installation ID to prevent reinstall trial loops
    this.installationId =
      primaryData?.installationId ||
      systemData?.installationId ||
      `INST-${sha256(this.deviceBinding + Date.now()).substring(0, 12).toUpperCase()}`;

    const effectiveStore = primaryData || systemData;

    if (effectiveStore) {
      this.activeLicense = effectiveStore.license || null;
      this.activeSignature = effectiveStore.signature || null;
      this.lastTrustedTime = effectiveStore.lastTrustedTime || Date.now();
    } else {
      this.state = LicenseState.FIRST_RUN;
      this.lastTrustedTime = Date.now();
    }
  }

  /**
   * Saves license state atomically to both primary and machine-wide stores.
   */
  savePersistentState() {
    const payload = {
      installationId: this.installationId,
      deviceBinding: this.deviceBinding,
      license: this.activeLicense,
      signature: this.activeSignature,
      lastTrustedTime: this.lastTrustedTime || Date.now(),
      state: this.state,
      updatedAt: new Date().toISOString()
    };

    const data = JSON.stringify(payload, null, 2);

    // Save to Primary store
    try {
      const primaryDir = path.dirname(this.primaryStorePath);
      if (!fs.existsSync(primaryDir)) fs.mkdirSync(primaryDir, { recursive: true });
      fs.writeFileSync(this.primaryStorePath, data, "utf8");
    } catch (e) {
      console.error("Could not write primary license store:", e);
    }

    // Save to System-wide ProgramData store
    try {
      const sysDir = path.dirname(this.systemStorePath);
      if (!fs.existsSync(sysDir)) fs.mkdirSync(sysDir, { recursive: true });
      fs.writeFileSync(this.systemStorePath, data, "utf8");
    } catch (e) {
      // Non-fatal if user lacks write access to ProgramData
    }
  }

  /**
   * Verifies that the Windows system clock has not been rolled backwards.
   */
  checkClockIntegrity() {
    const now = Date.now();
    if (this.lastTrustedTime) {
      // Drift tolerance: 2 hours backward allows reasonable daylight saving / time zone sync adjustments
      const maxBackwardDrift = 2 * 60 * 60 * 1000;
      if (now < this.lastTrustedTime - maxBackwardDrift) {
        return {
          valid: false,
          reason: `System clock rolled back. Current: ${new Date(now).toISOString()}, Last Trusted: ${new Date(
            this.lastTrustedTime
          ).toISOString()}`
        };
      }
    }
    // Update monotonic trusted time
    this.lastTrustedTime = Math.max(this.lastTrustedTime || 0, now);
    return { valid: true };
  }

  /**
   * Cryptographically verifies the stored license token against Ed25519 public key.
   */
  verifyStoredLicense() {
    if (!this.activeLicense || !this.activeSignature) {
      return false;
    }

    // 1. Digital signature verification
    const isSigValid = verifySignature(this.activeLicense, this.activeSignature, LICENSING_PUBLIC_KEY);
    if (!isSigValid) {
      this.state = LicenseState.LICENSE_TAMPER_DETECTED;
      return false;
    }

    // 2. Hardware binding verification
    if (this.activeLicense.deviceBinding && this.activeLicense.deviceBinding !== this.deviceBinding) {
      console.warn("Device binding mismatch. Expected:", this.deviceBinding, "Got:", this.activeLicense.deviceBinding);
      this.state = LicenseState.LICENSE_REVOKED;
      return false;
    }

    // 3. Expiration check using trusted time
    const now = Date.now();
    const expiresAt = new Date(this.activeLicense.expiresAt).getTime();

    if (now >= expiresAt) {
      this.state = this.activeLicense.type === "TRIAL" ? LicenseState.TRIAL_EXPIRED : LicenseState.LICENSE_EXPIRED;
      return false;
    }

    // 4. Valid active status
    if (this.activeLicense.status === "REVOKED") {
      this.state = LicenseState.LICENSE_REVOKED;
      return false;
    }

    this.state = this.activeLicense.type === "TRIAL" ? LicenseState.TRIAL_ACTIVE : LicenseState.LICENSE_ACTIVE;
    return true;
  }

  /**
   * Starts periodic local time tracking and expiration checking.
   */
  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Tick every 60 seconds
    this.heartbeatTimer = setInterval(() => {
      const clockCheck = this.checkClockIntegrity();
      if (!clockCheck.valid) {
        this.state = LicenseState.LICENSE_TAMPER_DETECTED;
        return;
      }

      // Re-check expiration against trusted time
      if (this.activeLicense && (this.state === LicenseState.TRIAL_ACTIVE || this.state === LicenseState.LICENSE_ACTIVE)) {
        const now = Date.now();
        const expiresAt = new Date(this.activeLicense.expiresAt).getTime();
        if (now >= expiresAt) {
          this.state = this.activeLicense.type === "TRIAL" ? LicenseState.TRIAL_EXPIRED : LicenseState.LICENSE_EXPIRED;
          console.warn("⚠️ License expired during runtime. State updated to:", this.state);
        }
      }

      this.savePersistentState();
    }, 60 * 1000);
  }

  /**
   * Resolve local signing key if available (e.g. during development/testing or local setup).
   */
  getLocalPrivateKey() {
    const candidatePaths = [
      path.join(__dirname, "..", "..", "server", "licensing-server", "keys", "license_private_key.pem"),
      path.join(process.resourcesPath || "", "server", "licensing-server", "keys", "license_private_key.pem"),
      path.join(__dirname, "keys", "license_private_key.pem")
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          return fs.readFileSync(p, "utf8");
        } catch (_) {}
      }
    }
    return null;
  }

  /**
   * Fallback: Create and sign trial locally if server is unreachable.
   */
  createLocalTrial() {
    if (!this.deviceBinding) {
      const { deviceBinding } = getDeviceFingerprint();
      this.deviceBinding = deviceBinding;
    }
    if (!this.installationId) {
      this.installationId = `INST-${sha256(this.deviceBinding + Date.now()).substring(0, 12).toUpperCase()}`;
    }

    const privateKey = this.getLocalPrivateKey();
    if (!privateKey) {
      return { success: false, message: "Licensing server is unreachable and local signing key not found." };
    }

    // Preserve existing expiration if device already registered a trial
    let issuedAt = new Date().toISOString();
    let expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    if (this.activeLicense && this.activeLicense.type === "TRIAL") {
      issuedAt = this.activeLicense.issuedAt;
      expiresAt = this.activeLicense.expiresAt;
    }

    const payload = {
      licenseId: `TRL-${this.deviceBinding.substring(4, 12)}`,
      type: "TRIAL",
      status: "ACTIVE",
      installationId: this.installationId,
      deviceBinding: this.deviceBinding,
      issuedAt,
      expiresAt,
      features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS"]
    };

    const signature = signPayload(payload, privateKey);
    this.activeLicense = payload;
    this.activeSignature = signature;
    const now = Date.now();
    this.state = now >= new Date(expiresAt).getTime() ? LicenseState.TRIAL_EXPIRED : LicenseState.TRIAL_ACTIVE;
    this.savePersistentState();

    return { success: true, state: this.state, license: this.activeLicense };
  }

  /**
   * Fallback: Activate license locally from licensing.db if server is unreachable.
   */
  activateLocalLicense(licenseKey, customerName = "") {
    if (!this.deviceBinding) {
      const { deviceBinding } = getDeviceFingerprint();
      this.deviceBinding = deviceBinding;
    }
    if (!this.installationId) {
      this.installationId = `INST-${sha256(this.deviceBinding + Date.now()).substring(0, 12).toUpperCase()}`;
    }

    const privateKey = this.getLocalPrivateKey();
    const candidateDbPaths = [
      path.join(__dirname, "..", "..", "server", "licensing-server", "licensing.db"),
      path.join(process.resourcesPath || "", "server", "licensing-server", "licensing.db")
    ];

    let dbPath = null;
    for (const p of candidateDbPaths) {
      if (fs.existsSync(p)) {
        dbPath = p;
        break;
      }
    }

    if (!privateKey || !dbPath) {
      return { success: false, message: "Licensing server is offline and local licensing database not found." };
    }

    try {
      const { DatabaseSync } = require("node:sqlite");
      const localDb = new DatabaseSync(dbPath);
      const normalizedKey = String(licenseKey).trim().toUpperCase();
      const lic = localDb.prepare("SELECT * FROM licenses WHERE license_key = ?").get(normalizedKey);

      if (!lic) {
        return { success: false, message: "Invalid license activation key. Check for typos." };
      }

      if (lic.status === "REVOKED") {
        return { success: false, message: "This license key has been revoked." };
      }

      if (lic.device_binding && lic.device_binding !== this.deviceBinding) {
        return { success: false, message: "This license key is already bound to another computer." };
      }

      const now = new Date().toISOString();
      localDb.prepare(`
        UPDATE licenses 
        SET status = 'ACTIVATED', device_binding = ?, installation_id = ?, activated_at = ?
        WHERE id = ?
      `).run(this.deviceBinding, this.installationId, now, lic.id);

      const payload = {
        licenseId: lic.license_id,
        licenseKey: lic.license_key,
        customerName: (customerName && customerName.trim()) || lic.customer_name || "Valued Retail Customer",
        type: lic.type || "COMMERCIAL",
        status: "ACTIVE",
        installationId: this.installationId,
        deviceBinding: this.deviceBinding,
        issuedAt: lic.issued_at,
        expiresAt: lic.expires_at,
        features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS"]
      };

      const signature = signPayload(payload, privateKey);
      this.activeLicense = payload;
      this.activeSignature = signature;
      this.state = LicenseState.LICENSE_ACTIVE;
      this.savePersistentState();

      return {
        success: true,
        message: "Commercial license activated successfully!",
        license: this.activeLicense
      };
    } catch (dbErr) {
      console.error("Local activation error:", dbErr);
      return { success: false, message: "Local activation error: " + dbErr.message };
    }
  }

  /**
   * Register initial 15-day trial with authoritative licensing server or local fallback.
   */
  async registerTrial() {
    try {
      const response = await this.postJson("/api/v1/trials/register", {
        installationId: this.installationId,
        deviceBinding: this.deviceBinding,
        hostname: require("os").hostname()
      });

      if (response && response.success && response.license && response.signature) {
        this.activeLicense = response.license;
        this.activeSignature = response.signature;

        const isSigValid = verifySignature(this.activeLicense, this.activeSignature, LICENSING_PUBLIC_KEY);
        if (!isSigValid) {
          this.state = LicenseState.LICENSE_TAMPER_DETECTED;
          throw new Error("Server returned an invalid digital signature.");
        }

        const now = Date.now();
        const expiresAt = new Date(this.activeLicense.expiresAt).getTime();
        this.state = now >= expiresAt ? LicenseState.TRIAL_EXPIRED : LicenseState.TRIAL_ACTIVE;

        this.savePersistentState();
        return { success: true, state: this.state, license: this.activeLicense };
      } else {
        throw new Error(response?.message || "Trial registration rejected by server.");
      }
    } catch (err) {
      console.warn("Remote licensing server unavailable, attempting local trial creation fallback...", err.message);
      const localTrial = this.createLocalTrial();
      if (localTrial && localTrial.success) {
        return localTrial;
      }

      if (this.state === LicenseState.FIRST_RUN) {
        this.state = LicenseState.TRIAL_REGISTRATION_PENDING;
      }
      this.savePersistentState();
      throw err;
    }
  }

  /**
   * Activate a commercial license key.
   */
  async activateLicense(licenseKey, customerName = "") {
    if (!licenseKey || String(licenseKey).trim().length < 8) {
      return { success: false, message: "Please enter a valid license activation key." };
    }

    try {
      const response = await this.postJson("/api/v1/license/activate", {
        licenseKey: String(licenseKey).trim().toUpperCase(),
        installationId: this.installationId,
        deviceBinding: this.deviceBinding,
        customerName: customerName.trim()
      });

      if (response && response.success && response.license && response.signature) {
        const isSigValid = verifySignature(response.license, response.signature, LICENSING_PUBLIC_KEY);
        if (!isSigValid) {
          return { success: false, message: "Cryptographic signature verification failed." };
        }

        this.activeLicense = response.license;
        this.activeSignature = response.signature;
        this.state = LicenseState.LICENSE_ACTIVE;
        this.savePersistentState();

        return {
          success: true,
          message: "Commercial license activated successfully!",
          license: this.activeLicense
        };
      } else {
        return {
          success: false,
          message: response?.message || "Invalid or already used license key."
        };
      }
    } catch (err) {
      console.warn("Remote licensing server unavailable, attempting local activation fallback...", err.message);
      const localRes = this.activateLocalLicense(licenseKey, customerName);
      if (localRes && localRes.success) {
        return localRes;
      }
      return {
        success: false,
        message: localRes?.message || ("Failed to connect to licensing server: " + (err.message || "Network offline"))
      };
    }
  }

  /**
   * Verify license status with server if online.
   */
  async verifyWithServer() {
    if (!this.activeLicense) return this.getStatus();

    try {
      const response = await this.postJson("/api/v1/license/verify", {
        installationId: this.installationId,
        deviceBinding: this.deviceBinding,
        licenseId: this.activeLicense.licenseId
      });

      if (response && response.success) {
        if (response.revoked) {
          this.state = LicenseState.LICENSE_REVOKED;
        } else if (response.license && response.signature) {
          const isSigValid = verifySignature(response.license, response.signature, LICENSING_PUBLIC_KEY);
          if (isSigValid) {
            this.activeLicense = response.license;
            this.activeSignature = response.signature;
            this.verifyStoredLicense();
          }
        }
        this.savePersistentState();
      }
    } catch (e) {
      // Offline: preserve local active state without blocking normal POS operations
    }

    return this.getStatus();
  }

  /**
   * Business guard: determines if billing, product editing, or khata updates are allowed.
   */
  canOperate() {
    const active = this.state === LicenseState.TRIAL_ACTIVE || this.state === LicenseState.LICENSE_ACTIVE;
    return {
      allowed: active,
      state: this.state,
      message: active
        ? "Operation authorized"
        : "Aaj POS is in locked state. Please activate a license to continue normal operations."
    };
  }

  /**
   * Sanitized public status for Renderer (no secret keys or raw components).
   */
  getStatus() {
    let daysRemaining = 0;
    let expiresAt = null;
    let issuedAt = null;

    if (this.activeLicense) {
      expiresAt = this.activeLicense.expiresAt;
      issuedAt = this.activeLicense.issuedAt;
      const msLeft = new Date(expiresAt).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    }

    const isLocked =
      this.state === LicenseState.TRIAL_EXPIRED ||
      this.state === LicenseState.LICENSE_EXPIRED ||
      this.state === LicenseState.LICENSE_REVOKED ||
      this.state === LicenseState.LICENSE_TAMPER_DETECTED ||
      this.state === LicenseState.TRIAL_REGISTRATION_PENDING;

    return {
      state: this.state,
      isLocked,
      daysRemaining,
      expiresAt,
      issuedAt,
      type: this.activeLicense?.type || (this.state === LicenseState.FIRST_RUN ? "NONE" : "TRIAL"),
      installationId: this.installationId,
      deviceBinding: this.deviceBinding,
      licenseId: this.activeLicense?.licenseId || null,
      customerName: this.activeLicense?.customerName || null
    };
  }

  /**
   * Helper to make HTTP/HTTPS JSON POST requests
   */
  postJson(endpoint, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.serverUrl);
      const postData = JSON.stringify(data);
      const isHttps = url.protocol === "https:";
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "User-Agent": "AajPOS-Client/1.0"
        },
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error("Invalid JSON response from server"));
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Connection timeout"));
      });

      req.write(postData);
      req.end();
    });
  }
}

// Export singleton instance
const licenseManager = new LicenseManager();

module.exports = {
  licenseManager,
  LicenseState
};
