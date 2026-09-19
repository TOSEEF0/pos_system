// server/licensing-server/server.js
// Authoritative Licensing & Trial Server for Aaj Cash & Carry POS
// Enforces 15-day strict trial limits, prevents multi-device duplication,
// and issues Ed25519 cryptographically signed license tokens.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

// --- Configuration & Paths ---
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, "licensing.db");
const KEY_DIR = path.join(__dirname, "keys");
const PRIVATE_KEY_PATH = path.join(KEY_DIR, "license_private_key.pem");
const PUBLIC_KEY_PATH = path.join(KEY_DIR, "license_public_key.pem");

// Ensure keys directory and keys exist
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.log("Generating Ed25519 server keys...");
  require("./keyGenerator");
}
const PRIVATE_KEY_PEM = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");
const PUBLIC_KEY_PEM = fs.readFileSync(PUBLIC_KEY_PATH, "utf8");

// --- Database Initialization ---
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    installation_id TEXT NOT NULL,
    device_binding TEXT NOT NULL UNIQUE,
    hostname TEXT,
    ip_address TEXT,
    registered_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE'
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    license_id TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    device_binding TEXT,
    installation_id TEXT,
    max_devices INTEGER DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'COMMERCIAL',
    status TEXT NOT NULL DEFAULT 'ISSUED',
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    activated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    license_key TEXT,
    installation_id TEXT,
    device_binding TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL,
    details TEXT
  );
`);

// --- Cryptographic Signing Utilities ---
function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalize).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

function signPayload(payload) {
  const canonicalData = canonicalize(payload);
  const sig = crypto.sign(null, Buffer.from(canonicalData, "utf8"), PRIVATE_KEY_PEM);
  return sig.toString("base64");
}

function logAudit(action, licenseKey, installationId, deviceBinding, ip, details = "") {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (action, license_key, installation_id, device_binding, ip_address, timestamp, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(action, licenseKey || null, installationId || null, deviceBinding || null, ip || null, new Date().toISOString(), details);
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// --- Request Handlers ---
function handleTrialRegister(body, clientIp) {
  const { installationId, deviceBinding, hostname } = body;
  if (!installationId || !deviceBinding) {
    return { status: 400, data: { success: false, message: "Missing installationId or deviceBinding" } };
  }

  // Check if device already has a trial
  const existingTrial = db.prepare("SELECT * FROM trials WHERE device_binding = ?").get(deviceBinding);

  if (existingTrial) {
    if (existingTrial.status === "REVOKED") {
      logAudit("TRIAL_REJECT_REVOKED", null, installationId, deviceBinding, clientIp);
      return { status: 403, data: { success: false, message: "Trial access on this machine has been revoked." } };
    }

    // Re-issue original trial with original expiration date (Prevents reinstall 15-day reset!)
    const payload = {
      licenseId: `TRL-${deviceBinding.substring(4, 12)}`,
      type: "TRIAL",
      status: existingTrial.status,
      installationId: existingTrial.installation_id,
      deviceBinding: existingTrial.device_binding,
      issuedAt: existingTrial.registered_at,
      expiresAt: existingTrial.expires_at,
      features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS"]
    };

    const signature = signPayload(payload);
    logAudit("TRIAL_REISSUED", null, installationId, deviceBinding, clientIp, "Reissued existing trial expiration");

    return {
      status: 200,
      data: {
        success: true,
        message: "Existing trial active",
        license: payload,
        signature
      }
    };
  }

  // Create new 15-day strict trial (15 * 24h = 1296000000 ms)
  const now = new Date();
  const registeredAt = now.toISOString();
  const trialDurationMs = 15 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(now.getTime() + trialDurationMs).toISOString();

  db.prepare(`
    INSERT INTO trials (installation_id, device_binding, hostname, ip_address, registered_at, expires_at, status)
    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
  `).run(installationId, deviceBinding, hostname || "Windows-POS", clientIp, registeredAt, expiresAt);

  const payload = {
    licenseId: `TRL-${deviceBinding.substring(4, 12)}`,
    type: "TRIAL",
    status: "ACTIVE",
    installationId,
    deviceBinding,
    issuedAt: registeredAt,
    expiresAt,
    features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS"]
  };

  const signature = signPayload(payload);
  logAudit("TRIAL_REGISTERED", null, installationId, deviceBinding, clientIp, "New 15-day trial granted");

  return {
    status: 200,
    data: {
      success: true,
      message: "15-day trial successfully activated",
      license: payload,
      signature
    }
  };
}

function handleLicenseActivate(body, clientIp) {
  const { licenseKey, installationId, deviceBinding, customerName } = body;
  if (!licenseKey || !installationId || !deviceBinding) {
    return { status: 400, data: { success: false, message: "Missing required activation parameters." } };
  }

  const keyFormatted = String(licenseKey).trim().toUpperCase();
  const lic = db.prepare("SELECT * FROM licenses WHERE license_key = ?").get(keyFormatted);

  if (!lic) {
    logAudit("ACTIVATION_FAILED_UNKNOWN_KEY", keyFormatted, installationId, deviceBinding, clientIp);
    return { status: 404, data: { success: false, message: "Invalid license activation key. Please check and try again." } };
  }

  if (lic.status === "REVOKED") {
    logAudit("ACTIVATION_BLOCKED_REVOKED", keyFormatted, installationId, deviceBinding, clientIp);
    return { status: 403, data: { success: false, message: "This license key has been revoked by support." } };
  }

  if (lic.status === "EXPIRED" || new Date(lic.expires_at).getTime() <= Date.now()) {
    logAudit("ACTIVATION_BLOCKED_EXPIRED", keyFormatted, installationId, deviceBinding, clientIp);
    return { status: 403, data: { success: false, message: "This license key has expired." } };
  }

  // If already active, check if bound to this machine
  if (lic.status === "ACTIVE") {
    if (lic.device_binding && lic.device_binding !== deviceBinding) {
      logAudit("ACTIVATION_BLOCKED_DEVICE_MISMATCH", keyFormatted, installationId, deviceBinding, clientIp, `Bound to ${lic.device_binding}`);
      return {
        status: 403,
        data: {
          success: false,
          message: "This license key is already bound to another POS computer. Contact support to transfer."
        }
      };
    }
  }

  // Bind to this machine
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE licenses
    SET status = 'ACTIVE', device_binding = ?, installation_id = ?, customer_name = COALESCE(?, customer_name), activated_at = ?
    WHERE id = ?
  `).run(deviceBinding, installationId, customerName || null, nowIso, lic.id);

  const payload = {
    licenseId: lic.license_id,
    licenseKey: lic.license_key,
    type: lic.type,
    status: "ACTIVE",
    installationId,
    deviceBinding,
    customerName: customerName || lic.customer_name || "Valued Retailer",
    issuedAt: lic.issued_at,
    expiresAt: lic.expires_at,
    features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS", "UNLIMITED_SALES"]
  };

  const signature = signPayload(payload);
  logAudit("ACTIVATION_SUCCESS", keyFormatted, installationId, deviceBinding, clientIp, "Activated on device");

  return {
    status: 200,
    data: {
      success: true,
      message: "Commercial license activated successfully!",
      license: payload,
      signature
    }
  };
}

function handleLicenseVerify(body, clientIp) {
  const { installationId, deviceBinding, licenseId } = body;
  if (!deviceBinding) {
    return { status: 400, data: { success: false, message: "Missing deviceBinding" } };
  }

  // Check commercial licenses first
  const lic = db.prepare("SELECT * FROM licenses WHERE device_binding = ? OR license_id = ?").get(deviceBinding, licenseId || "");
  if (lic) {
    if (lic.status === "REVOKED") {
      return { status: 200, data: { success: true, revoked: true } };
    }
    const payload = {
      licenseId: lic.license_id,
      licenseKey: lic.license_key,
      type: lic.type,
      status: lic.status,
      installationId: lic.installation_id || installationId,
      deviceBinding: lic.device_binding,
      customerName: lic.customer_name,
      issuedAt: lic.issued_at,
      expiresAt: lic.expires_at,
      features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS", "UNLIMITED_SALES"]
    };
    return { status: 200, data: { success: true, revoked: false, license: payload, signature: signPayload(payload) } };
  }

  // Check trials
  const trial = db.prepare("SELECT * FROM trials WHERE device_binding = ?").get(deviceBinding);
  if (trial) {
    if (trial.status === "REVOKED") {
      return { status: 200, data: { success: true, revoked: true } };
    }
    const payload = {
      licenseId: `TRL-${deviceBinding.substring(4, 12)}`,
      type: "TRIAL",
      status: trial.status,
      installationId: trial.installation_id,
      deviceBinding: trial.device_binding,
      issuedAt: trial.registered_at,
      expiresAt: trial.expires_at,
      features: ["ALL_MODULES", "OFFLINE_POS", "KHATA", "BARCODE", "REPORTS"]
    };
    return { status: 200, data: { success: true, revoked: false, license: payload, signature: signPayload(payload) } };
  }

  return { status: 404, data: { success: false, message: "No active trial or license found." } };
}

function handleLicenseRevoke(body, clientIp) {
  const { licenseKey, deviceBinding, reason } = body;
  if (!licenseKey && !deviceBinding) {
    return { status: 400, data: { success: false, message: "Provide licenseKey or deviceBinding to revoke." } };
  }

  if (licenseKey) {
    db.prepare("UPDATE licenses SET status = 'REVOKED' WHERE license_key = ?").run(licenseKey.trim().toUpperCase());
  }
  if (deviceBinding) {
    db.prepare("UPDATE trials SET status = 'REVOKED' WHERE device_binding = ?").run(deviceBinding);
  }

  logAudit("REVOCATION", licenseKey || null, null, deviceBinding || null, clientIp, reason || "Manual Admin Revocation");
  return { status: 200, data: { success: true, message: "Target revoked successfully." } };
}

function getSystemStats() {
  const trialsCount = db.prepare("SELECT count(*) as count FROM trials").get().count;
  const activeTrialsCount = db.prepare("SELECT count(*) as count FROM trials WHERE status = 'ACTIVE'").get().count;
  const licensesCount = db.prepare("SELECT count(*) as count FROM licenses").get().count;
  const activeLicensesCount = db.prepare("SELECT count(*) as count FROM licenses WHERE status = 'ACTIVE'").get().count;

  return {
    server: "Aaj Cash & Carry POS Licensing Authority",
    version: "1.0.0",
    status: "ONLINE",
    time: new Date().toISOString(),
    publicKey: PUBLIC_KEY_PEM,
    stats: {
      totalTrials: trialsCount,
      activeTrials: activeTrialsCount,
      totalLicenses: licensesCount,
      activeLicenses: activeLicensesCount
    }
  };
}

// --- Express / HTTP Server Runner ---
function startServer() {
  try {
    const express = require("express");
    const app = express();
    app.use(express.json());

    // Basic CORS for development
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.sendStatus(200);
      next();
    });

    app.get("/api/v1/license/status", (req, res) => {
      res.json(getSystemStats());
    });

    app.post("/api/v1/trials/register", (req, res) => {
      const result = handleTrialRegister(req.body, req.ip);
      res.status(result.status).json(result.data);
    });

    app.post("/api/v1/license/activate", (req, res) => {
      const result = handleLicenseActivate(req.body, req.ip);
      res.status(result.status).json(result.data);
    });

    app.post("/api/v1/license/verify", (req, res) => {
      const result = handleLicenseVerify(req.body, req.ip);
      res.status(result.status).json(result.data);
    });

    app.post("/api/v1/license/revoke", (req, res) => {
      const result = handleLicenseRevoke(req.body, req.ip);
      res.status(result.status).json(result.data);
    });

    const server = app.listen(PORT, () => {
      console.log(`🚀 Aaj POS Licensing Server running on port ${PORT}`);
      console.log(`   Database: ${DB_PATH}`);
      console.log(`   Public Key: Valid Ed25519`);
    });

    return server;
  } catch (err) {
    // Fallback to native Node http module if express is not yet loaded
    console.log("Starting server using native Node.js HTTP engine...");
    const http = require("http");
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const ip = req.socket.remoteAddress;

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/v1/license/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(getSystemStats()));
        return;
      }

      if (req.method === "POST") {
        let bodyStr = "";
        req.on("data", chunk => (bodyStr += chunk));
        req.on("end", () => {
          let body = {};
          try { body = JSON.parse(bodyStr); } catch (e) {}

          let result = { status: 404, data: { message: "Not found" } };
          if (url.pathname === "/api/v1/trials/register") result = handleTrialRegister(body, ip);
          else if (url.pathname === "/api/v1/license/activate") result = handleLicenseActivate(body, ip);
          else if (url.pathname === "/api/v1/license/verify") result = handleLicenseVerify(body, ip);
          else if (url.pathname === "/api/v1/license/revoke") result = handleLicenseRevoke(body, ip);

          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.data));
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    });

    server.listen(PORT, () => {
      console.log(`🚀 Aaj POS Licensing Server running (Native HTTP) on port ${PORT}`);
    });
    return server;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
  getSystemStats,
  handleTrialRegister,
  handleLicenseActivate,
  handleLicenseVerify,
  handleLicenseRevoke,
  signPayload,
  db
};
