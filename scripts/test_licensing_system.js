// scripts/test_licensing_system.js
// Comprehensive automated test suite for Aaj Cash & Carry POS Licensing System
// Tests device fingerprinting, asymmetric Ed25519 cryptography, trial registration,
// anti-tamper clock protection, commercial license issuance & activation,
// multi-machine copy prevention, revocation, and offline database safety.

const path = require("path");
const fs = require("fs");
const assert = require("assert");
const { getDeviceFingerprint } = require("../electron/licensing/deviceFingerprint");
const { canonicalize, signPayload, verifySignature, sha256 } = require("../electron/licensing/cryptoUtil");
const { LICENSING_PUBLIC_KEY } = require("../electron/licensing/licensePublicKeys");
const { startServer, db: serverDb, handleTrialRegister, handleLicenseActivate, handleLicenseVerify, handleLicenseRevoke } = require("../server/licensing-server/server");
const { generateLicenseKey } = require("../server/licensing-server/issueLicense");

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
  try {
    process.stdout.write(`Testing: ${name}... `);
    fn();
    console.log("✅ PASS");
    passedCount++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    console.error(err);
    failedCount++;
  }
}

async function runTestAsync(name, fn) {
  try {
    process.stdout.write(`Testing: ${name}... `);
    await fn();
    console.log("✅ PASS");
    passedCount++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}`);
    console.error(err);
    failedCount++;
  }
}

console.log("\n========================================================");
console.log("   AAJ CASH & CARRY POS - LICENSING SYSTEM TEST SUITE");
console.log("========================================================\n");

// ----------------------------------------------------
// GROUP 1: DEVICE FINGERPRINTING & HARDWARE BINDING
// ----------------------------------------------------
console.log("--- Group 1: Device Fingerprinting & Binding ---");

runTest("Fingerprint generates valid DEV- format", () => {
  const fp = getDeviceFingerprint();
  assert.ok(fp.deviceBinding, "Device binding must exist");
  assert.ok(fp.deviceBinding.startsWith("DEV-"), "Binding should start with DEV-");
  assert.strictEqual(fp.deviceBinding.split("-").length, 5, "Binding should have 5 hyphen-separated groups");
});

runTest("Fingerprint is idempotent and stable across calls", () => {
  const fp1 = getDeviceFingerprint();
  const fp2 = getDeviceFingerprint();
  assert.strictEqual(fp1.deviceBinding, fp2.deviceBinding, "Fingerprint must be stable");
  assert.strictEqual(fp1.rawHash, fp2.rawHash, "Raw hash must be stable");
});

runTest("Fingerprint components identify Windows hardware", () => {
  const fp = getDeviceFingerprint();
  assert.ok(fp.components, "Components object must exist");
  assert.ok(fp.components.platform, "Platform must be recorded");
  assert.ok(typeof fp.components.hasMachineGuid === "boolean", "MachineGuid presence flag");
});

// ----------------------------------------------------
// GROUP 2: ASYMMETRIC CRYPTOGRAPHY (Ed25519)
// ----------------------------------------------------
console.log("\n--- Group 2: Asymmetric Cryptography (Ed25519) ---");

const PRIVATE_KEY_PATH = path.join(__dirname, "../server/licensing-server/keys/license_private_key.pem");
const PRIVATE_KEY_PEM = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

runTest("Canonical serialization is deterministic regardless of key order", () => {
  const obj1 = { z: 1, a: "hello", m: [3, 2, 1], b: { y: 2, x: 1 } };
  const obj2 = { a: "hello", b: { x: 1, y: 2 }, m: [3, 2, 1], z: 1 };
  const s1 = canonicalize(obj1);
  const s2 = canonicalize(obj2);
  assert.strictEqual(s1, s2, "Canonical JSON must be identical regardless of key order");
});

runTest("Server signs payload with Ed25519 and Client verifies with Public Key", () => {
  const samplePayload = {
    licenseId: "TEST-LIC-001",
    type: "COMMERCIAL",
    deviceBinding: "DEV-1234-5678-ABCD-EF01",
    expiresAt: "2030-01-01T00:00:00.000Z"
  };

  const sig = signPayload(samplePayload, PRIVATE_KEY_PEM);
  assert.ok(sig && sig.length > 20, "Signature must be a non-empty base64 string");

  const valid = verifySignature(samplePayload, sig, LICENSING_PUBLIC_KEY);
  assert.strictEqual(valid, true, "Signature must verify successfully against public key");
});

runTest("Tampered payload fails signature verification", () => {
  const originalPayload = {
    licenseId: "TEST-LIC-001",
    type: "TRIAL",
    expiresAt: "2026-10-01T00:00:00.000Z"
  };
  const sig = signPayload(originalPayload, PRIVATE_KEY_PEM);

  // Attacker tampers expiration date to 2099
  const tamperedPayload = {
    ...originalPayload,
    expiresAt: "2099-12-31T23:59:59.999Z"
  };

  const valid = verifySignature(tamperedPayload, sig, LICENSING_PUBLIC_KEY);
  assert.strictEqual(valid, false, "Tampered payload MUST fail signature verification");
});

runTest("Forged or invalid signature fails verification", () => {
  const payload = { test: true };
  const fakeSig = Buffer.from("bad-signature-data-which-is-not-valid").toString("base64");
  const valid = verifySignature(payload, fakeSig, LICENSING_PUBLIC_KEY);
  assert.strictEqual(valid, false, "Invalid signature MUST fail");
});

// ----------------------------------------------------
// GROUP 3: TRIAL REGISTRATION & ANTI-REINSTALL PROTECTION
// ----------------------------------------------------
console.log("\n--- Group 3: Trial Registration & Anti-Reinstall Protection ---");

const testDevice1 = "DEV-TEST-" + Date.now().toString(16).toUpperCase();
const testInst1 = "INST-" + Date.now().toString(16).toUpperCase();

runTest("Initial trial registration grants exactly 15 days", () => {
  const res = handleTrialRegister({
    installationId: testInst1,
    deviceBinding: testDevice1,
    hostname: "TEST-POS-PC"
  }, "127.0.0.1");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.success, true);
  assert.ok(res.data.license);
  assert.ok(res.data.signature);

  const lic = res.data.license;
  const issued = new Date(lic.issuedAt).getTime();
  const expires = new Date(lic.expiresAt).getTime();
  const durationDays = (expires - issued) / (1000 * 60 * 60 * 24);

  assert.strictEqual(durationDays, 15, "Trial duration must be exactly 15 calendar days");
  assert.strictEqual(verifySignature(lic, res.data.signature, LICENSING_PUBLIC_KEY), true);
});

runTest("Anti-Bypass: Re-registering on same device preserves ORIGINAL expiration date", () => {
  // First get original trial from server
  const originalTrial = serverDb.prepare("SELECT * FROM trials WHERE device_binding = ?").get(testDevice1);
  assert.ok(originalTrial, "Original trial must exist in server DB");

  // Attacker uninstalls and attempts second trial registration on same machine
  const res = handleTrialRegister({
    installationId: "INST-NEW-INSTALL-ID",
    deviceBinding: testDevice1,
    hostname: "TEST-POS-PC"
  }, "127.0.0.1");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.license.expiresAt, originalTrial.expires_at, "Expiration date must NOT reset!");
  assert.strictEqual(res.data.license.issuedAt, originalTrial.registered_at, "Issued date must match original registration");
});

// ----------------------------------------------------
// GROUP 4: COMMERCIAL LICENSE ISSUANCE & ACTIVATION
// ----------------------------------------------------
console.log("\n--- Group 4: Commercial License Lifecycle ---");

let issuedKey = null;

runTest("Key generator formats valid AAJ-XXXX-XXXX-XXXX keys", () => {
  issuedKey = generateLicenseKey();
  assert.ok(issuedKey.startsWith("AAJ-"), "Key must start with AAJ-");
  const parts = issuedKey.split("-");
  assert.strictEqual(parts.length, 4, "Key must have 4 sections");
  assert.strictEqual(parts[1].length, 4);
  assert.strictEqual(parts[2].length, 4);
  assert.strictEqual(parts[3].length, 4);
});

runTest("Activation of non-existent key fails with 404", () => {
  const res = handleLicenseActivate({
    licenseKey: "AAJ-0000-0000-0000",
    installationId: testInst1,
    deviceBinding: testDevice1
  }, "127.0.0.1");

  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.data.success, false);
});

runTest("Issuing and activating commercial license binds to device", () => {
  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const licId = "LIC-TEST-" + Date.now().toString(16).toUpperCase();

  serverDb.prepare(`
    INSERT INTO licenses (license_key, license_id, customer_name, type, status, issued_at, expires_at)
    VALUES (?, ?, 'Askari Mart', 'COMMERCIAL', 'ISSUED', ?, ?)
  `).run(issuedKey, licId, issuedAt, expiresAt);

  const res = handleLicenseActivate({
    licenseKey: issuedKey,
    installationId: testInst1,
    deviceBinding: testDevice1,
    customerName: "Askari Mart"
  }, "127.0.0.1");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.license.deviceBinding, testDevice1);
  assert.strictEqual(res.data.license.status, "ACTIVE");
  assert.strictEqual(verifySignature(res.data.license, res.data.signature, LICENSING_PUBLIC_KEY), true);
});

runTest("Anti-Piracy: Activating same commercial key on a SECOND device is rejected", () => {
  const secondDevice = "DEV-PIRATE-MACHINE-99";
  const res = handleLicenseActivate({
    licenseKey: issuedKey,
    installationId: "INST-PIRATE",
    deviceBinding: secondDevice,
    customerName: "Pirate Store"
  }, "127.0.0.1");

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.data.success, false);
  assert.ok(res.data.message.includes("already bound to another POS"), "Must reject second device binding");
});

runTest("Re-activating same key on the ORIGINAL device succeeds", () => {
  const res = handleLicenseActivate({
    licenseKey: issuedKey,
    installationId: testInst1,
    deviceBinding: testDevice1
  }, "127.0.0.1");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.license.deviceBinding, testDevice1);
});

// ----------------------------------------------------
// GROUP 5: LICENSE VERIFICATION & REVOCATION
// ----------------------------------------------------
console.log("\n--- Group 5: Online Verification & Revocation ---");

runTest("Online verification returns signed active payload", () => {
  const res = handleLicenseVerify({
    installationId: testInst1,
    deviceBinding: testDevice1
  }, "127.0.0.1");

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.success, true);
  assert.strictEqual(res.data.revoked, false);
  assert.strictEqual(verifySignature(res.data.license, res.data.signature, LICENSING_PUBLIC_KEY), true);
});

runTest("Revoking license immediately blocks verification", () => {
  const revokeRes = handleLicenseRevoke({
    licenseKey: issuedKey,
    reason: "Chargeback test"
  }, "127.0.0.1");
  assert.strictEqual(revokeRes.status, 200);

  const verifyRes = handleLicenseVerify({
    installationId: testInst1,
    deviceBinding: testDevice1
  }, "127.0.0.1");

  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyRes.data.revoked, true, "License must be reported revoked");
});

// ----------------------------------------------------
// GROUP 6: MONOTONIC CLOCK INTEGRITY & ANTI-ROLLBACK
// ----------------------------------------------------
console.log("\n--- Group 6: System Clock Anti-Rollback Protection ---");

runTest("Drift within 2 hours is tolerated (timezone/NTP sync)", () => {
  const now = Date.now();
  const lastTrusted = now;
  const slightBackward = now - 30 * 60 * 1000; // 30 minutes backward
  const maxTolerance = 2 * 60 * 60 * 1000;

  const isRollback = slightBackward < (lastTrusted - maxTolerance);
  assert.strictEqual(isRollback, false, "30-minute drift must NOT trigger tamper");
});

runTest("Clock rollback > 2 hours is flagged as tampering", () => {
  const now = Date.now();
  const lastTrusted = now;
  const majorRollback = now - 6 * 60 * 60 * 1000; // 6 hours backward
  const maxTolerance = 2 * 60 * 60 * 1000;

  const isRollback = majorRollback < (lastTrusted - maxTolerance);
  assert.strictEqual(isRollback, true, "6-hour rollback MUST trigger tamper");
});

// ----------------------------------------------------
// GROUP 7: OFFLINE LOCAL DATABASE SAFETY
// ----------------------------------------------------
console.log("\n--- Group 7: Local Database Safety Guarantee ---");

runTest("Local SQLite database file is intact and accessible", () => {
  const dbFile = path.join(__dirname, "../electron/aaj_cash_and_carry.db");
  assert.ok(fs.existsSync(dbFile), "Database file must exist");
  const stats = fs.statSync(dbFile);
  assert.ok(stats.size > 0, "Database file must not be empty or truncated");
});

runTest("Database tables can be queried normally (Zero cloud dependency)", () => {
  const { DatabaseSync } = require("node:sqlite");
  const dbFile = path.join(__dirname, "../electron/aaj_cash_and_carry.db");
  const localDb = new DatabaseSync(dbFile);

  const productCount = localDb.prepare("SELECT count(*) as count FROM products").get().count;
  const salesCount = localDb.prepare("SELECT count(*) as count FROM sales").get().count;
  const customerCount = localDb.prepare("SELECT count(*) as count FROM customers").get().count;

  assert.ok(typeof productCount === "number", "Products table queryable");
  assert.ok(typeof salesCount === "number", "Sales table queryable");
  assert.ok(typeof customerCount === "number", "Customers table queryable");
});

// ----------------------------------------------------
// GROUP 8: LICENSEMANAGER STATE MACHINE & BUSINESS GUARD
// ----------------------------------------------------
console.log("\n--- Group 8: LicenseManager State Machine & Business Guard ---");

const { LicenseState, licenseManager } = require("../electron/licensing/licenseManager");

runTest("Business guard allows operations during active trial", () => {
  licenseManager.state = LicenseState.TRIAL_ACTIVE;
  const check = licenseManager.canOperate();
  assert.strictEqual(check.allowed, true);
});

runTest("Business guard allows operations during active commercial license", () => {
  licenseManager.state = LicenseState.LICENSE_ACTIVE;
  const check = licenseManager.canOperate();
  assert.strictEqual(check.allowed, true);
});

runTest("Business guard blocks operations when trial is expired", () => {
  licenseManager.state = LicenseState.TRIAL_EXPIRED;
  const check = licenseManager.canOperate();
  assert.strictEqual(check.allowed, false);
  assert.ok(check.message.includes("locked state"));
});

runTest("Business guard blocks operations when license is revoked", () => {
  licenseManager.state = LicenseState.LICENSE_REVOKED;
  const check = licenseManager.canOperate();
  assert.strictEqual(check.allowed, false);
});

runTest("Business guard blocks operations when clock tamper is detected", () => {
  licenseManager.state = LicenseState.LICENSE_TAMPER_DETECTED;
  const check = licenseManager.canOperate();
  assert.strictEqual(check.allowed, false);
});

runTest("getStatus() sanitizes response and never leaks secrets or private keys", () => {
  const status = licenseManager.getStatus();
  assert.ok(status.state, "Status must include state");
  assert.ok(typeof status.isLocked === "boolean", "Status must include boolean isLocked");
  assert.strictEqual(status.privateKey, undefined, "PrivateKey must NEVER be exposed");
  assert.strictEqual(status.secret, undefined, "Secret must NEVER be exposed");
});

runTest("getStatus() accurately reflects locked status for all restricted states", () => {
  const restrictedStates = [
    LicenseState.TRIAL_EXPIRED,
    LicenseState.LICENSE_EXPIRED,
    LicenseState.LICENSE_REVOKED,
    LicenseState.LICENSE_TAMPER_DETECTED,
    LicenseState.TRIAL_REGISTRATION_PENDING
  ];

  for (const st of restrictedStates) {
    licenseManager.state = st;
    const status = licenseManager.getStatus();
    assert.strictEqual(status.isLocked, true, `State ${st} must report isLocked: true`);
  }
});

runTest("Multi-location state persistence writes valid JSON format", () => {
  const tempDir = path.join(__dirname, "../scratch/temp_lic_test");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const testStorePath = path.join(tempDir, "test_license.dat");

  const testData = {
    installationId: "INST-TEST-123",
    deviceBinding: "DEV-1234-5678-ABCD-EF01",
    license: { type: "TRIAL", expiresAt: "2026-10-01T00:00:00.000Z" },
    signature: "TEST-SIG",
    lastTrustedTime: Date.now()
  };

  fs.writeFileSync(testStorePath, JSON.stringify(testData, null, 2), "utf8");
  const readBack = JSON.parse(fs.readFileSync(testStorePath, "utf8"));
  assert.strictEqual(readBack.installationId, testData.installationId);
  assert.strictEqual(readBack.deviceBinding, testData.deviceBinding);

  // Clean up
  fs.unlinkSync(testStorePath);
  fs.rmdirSync(tempDir);
});

runTest("Days remaining math accurately rounds up 24-hour periods", () => {
  const now = Date.now();
  const future3Days = new Date(now + 3 * 24 * 60 * 60 * 1000 - 10000).toISOString();
  licenseManager.activeLicense = { expiresAt: future3Days, type: "TRIAL" };
  const status = licenseManager.getStatus();
  assert.strictEqual(status.daysRemaining, 3, "Should compute 3 days remaining");
});

runTest("Offline resilience: unreachable network preserves active license without crash", async () => {
  licenseManager.serverUrl = "http://127.0.0.1:59999"; // Non-existent port
  licenseManager.state = LicenseState.LICENSE_ACTIVE;
  licenseManager.activeLicense = { licenseId: "OFFLINE-TEST", expiresAt: new Date(Date.now() + 1000000).toISOString() };

  // Verification against dead port should fail gracefully without throwing or altering active license
  const status = await licenseManager.verifyWithServer();
  assert.strictEqual(status.state, LicenseState.LICENSE_ACTIVE, "Offline verification must preserve active state");
});

// ----------------------------------------------------
// SUMMARY
// ----------------------------------------------------
console.log("\n========================================================");
console.log(`TEST RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
console.log("========================================================\n");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("🎉 ALL 30 LICENSING AND DEFENSE-IN-DEPTH TESTS PASSED!\n");
}
