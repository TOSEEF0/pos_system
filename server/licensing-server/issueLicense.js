// server/licensing-server/issueLicense.js
// CLI utility to generate, issue, and inspect commercial license keys for Aaj Cash & Carry POS.
//
// Usage examples:
//   node issueLicense.js --name "Askari 11 General Store" --type "LIFETIME"
//   node issueLicense.js --name "Bismillah Mart" --type "ANNUAL" --days 365
//   node issueLicense.js --list

const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "licensing.db");
const db = new DatabaseSync(DB_PATH);

// Ensure tables exist
db.exec(`
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
`);

function generateLicenseKey() {
  // Format: AAJ-XXXX-XXXX-XXXX (16 chars, base32 alphanumeric, uppercase)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes 0, O, 1, I to prevent confusion
  let result = "AAJ";
  for (let group = 0; group < 3; group++) {
    result += "-";
    for (let i = 0; i < 4; i++) {
      const idx = crypto.randomInt(0, chars.length);
      result += chars[idx];
    }
  }
  return result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].substring(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        params[key] = next;
        i++;
      } else {
        params[key] = true;
      }
    }
  }
  return params;
}

function main() {
  const params = parseArgs();

  if (params.list) {
    const rows = db.prepare("SELECT * FROM licenses ORDER BY id DESC LIMIT 20").all();
    console.log("\n--- RECENT ISSUED LICENSES ---");
    console.table(rows);
    return;
  }

  const customerName = params.name || "Valued Retail Customer";
  const type = (params.type || "LIFETIME").toUpperCase();
  const days = params.days ? parseInt(params.days, 10) : (type === "LIFETIME" ? 36500 : 365);

  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const licenseKey = generateLicenseKey();
  const licenseId = "LIC-" + crypto.randomUUID().substring(0, 8).toUpperCase();

  db.prepare(`
    INSERT INTO licenses (license_key, license_id, customer_name, type, status, issued_at, expires_at)
    VALUES (?, ?, ?, ?, 'ISSUED', ?, ?)
  `).run(licenseKey, licenseId, customerName, type, issuedAt, expiresAt);

  console.log("\n========================================================");
  console.log("   AAJ CASH & CARRY POS - NEW LICENSE ISSUED");
  console.log("========================================================");
  console.log(`License Key:   ${licenseKey}`);
  console.log(`License ID:    ${licenseId}`);
  console.log(`Customer:      ${customerName}`);
  console.log(`License Type:  ${type}`);
  console.log(`Issued Date:   ${issuedAt}`);
  console.log(`Valid Until:   ${expiresAt}`);
  console.log(`Status:        ISSUED (Ready for customer activation)`);
  console.log("========================================================\n");
}

if (require.main === module) {
  main();
}

module.exports = {
  generateLicenseKey
};
