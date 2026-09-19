// scripts/emergency-reset-admin.js
// Emergency Admin Credentials Reset Utility for Aaj Cash & Carry POS
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

console.log("=================================================");
console.log("   AAJ CASH & CARRY POS - EMERGENCY ADMIN RESET  ");
console.log("=================================================");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

try {
  const isDev = !app || !app.isPackaged;
  const appDataPath = isDev
    ? path.join(__dirname, "..", "electron")
    : path.join(app.getPath("userData"), "app_data");

  const dbPath = path.join(appDataPath, "aaj_cash_and_carry.db");
  console.log("Locating database at:", dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error("❌ Database file not found at:", dbPath);
    process.exit(1);
  }

  const Database = require(path.join(__dirname, "..", "electron", "node_modules", "better-sqlite3"));
  const db = new Database(dbPath);

  const defaultPassword = "1234";
  const defaultUsername = "admin";
  const hashed = hashPassword(defaultPassword);

  const admin = db.prepare("SELECT id, username FROM admin WHERE username=?").get(defaultUsername);
  if (admin) {
    db.prepare("UPDATE admin SET password=?, recovery_pin=NULL WHERE id=?").run(hashed, admin.id);
    console.log("✅ Successfully reset admin credentials.");
  } else {
    db.prepare("INSERT INTO admin (username, password) VALUES (?, ?)").run(defaultUsername, hashed);
    console.log("✅ Created default admin account.");
  }

  // Record audit log
  try {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO audit_logs (user, action, details, created_at) VALUES (?, ?, ?, ?)").run(
      "system",
      "EMERGENCY_RESET",
      "Admin password reset to default via desktop emergency tool",
      now
    );
  } catch (_) {}

  console.log("");
  console.log("=================================================");
  console.log("✅ RESET SUCCESSFUL!");
  console.log("   Username: admin");
  console.log("   Password: 1234");
  console.log("=================================================");
  console.log("You can now launch the POS app and log in.");
} catch (err) {
  console.error("❌ Error performing emergency reset:", err);
} finally {
  if (app && app.quit) app.quit();
  process.exit(0);
}
