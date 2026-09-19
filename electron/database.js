// electron/database.js
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app } = require("electron");

// Detect environment
const isDev = !app || !app.isPackaged;

// Define paths
const appDataPath = isDev
  ? __dirname
  : path.join(app.getPath("userData"), "app_data");

const dbFileName = "aaj_cash_and_carry.db";
const dbPath = path.join(appDataPath, dbFileName);

// Ensure writable location exists
if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}

console.log("Using DB path:", dbPath);

// Open database
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and integrity
try {
  db.pragma("journal_mode = WAL");
} catch (e) {
  console.warn("Could not enable WAL mode:", e);
}

// ---------------------------------------------------------------------------
// PASSWORD HASHING UTILITIES (SECURE & BACKWARD-COMPATIBLE)
// ---------------------------------------------------------------------------
function hashPassword(password) {
  if (!password) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword || !password) return false;
  if (!storedPassword.startsWith("pbkdf2:")) {
    // Legacy plain text match
    return String(password) === String(storedPassword);
  }
  const parts = storedPassword.split(":");
  if (parts.length !== 3) return false;
  const [, salt, originalHash] = parts;
  const hash = crypto.pbkdf2Sync(String(password), salt, 1000, 64, "sha512").toString("hex");
  return hash === originalHash;
}

// ---------------------------------------------------------------------------
// CORE TABLES DEFINITION
// ---------------------------------------------------------------------------

// 1. Shop Settings Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS shop_settings (
    id INTEGER PRIMARY KEY,
    shop_name TEXT,
    logo TEXT,
    address TEXT,
    phone TEXT,
    footer_note TEXT,
    currency TEXT DEFAULT 'Rs.',
    invoice_prefix TEXT DEFAULT 'INV-',
    credit_limit_behavior TEXT DEFAULT 'warning',
    auto_backup INTEGER DEFAULT 0,
    auto_backup_path TEXT,
    backup_retention INTEGER DEFAULT 7
  )
`).run();

// 2. Vendors Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT,
    shop_name TEXT,
    address TEXT,
    opening_balance REAL DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )
`).run();

// 3. Vendor History Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS vendor_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER,
    vendor_name TEXT,
    total_bill REAL,
    amount_paid REAL,
    remaining_amount REAL,
    note TEXT,
    timestamp TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
  )
`).run();

// 4. Purchases Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL,
    purchase_date TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    note TEXT,
    created_at TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
  )
`).run();

// 5. Vendor Payments Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS vendor_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL,
    purchase_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    payment_date TEXT,
    note TEXT,
    created_at TEXT,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (purchase_id) REFERENCES purchases(id)
  )
`).run();

// 6. Migrations Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TEXT
  )
`).run();

// 7. Admin Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`).run();

// 8. Categories Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )
`).run();

// 9. Products Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT UNIQUE,
    name TEXT,
    category_id INTEGER,
    quantity INTEGER DEFAULT 0,
    purchase_price REAL,
    selling_price REAL,
    description TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )
`).run();

// 10. Purchase Items Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    purchase_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`).run();

// 11. Cashiers Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS cashiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`).run();

// 12. Sales Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    total REAL,
    received REAL,
    change REAL,
    customer_name TEXT DEFAULT 'Walk-in Customer',
    discount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    discounted_total REAL DEFAULT 0,
    note TEXT DEFAULT '',
    customer_id INTEGER,
    payment_type TEXT DEFAULT 'cash',
    payment_status TEXT DEFAULT 'paid',
    amount_paid REAL DEFAULT 0,
    amount_due REAL DEFAULT 0,
    cashier_name TEXT DEFAULT 'Admin'
  )
`).run();

// 13. Sale Items Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER,
    price REAL,
    total REAL,
    FOREIGN KEY(sale_id) REFERENCES sales(id)
  )
`).run();

// 14. Customers Table (Digital Khata)
db.prepare(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    alternate_phone TEXT,
    address TEXT,
    notes TEXT,
    credit_limit REAL DEFAULT 0,
    opening_balance REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT,
    updated_at TEXT,
    deleted_at TEXT
  )
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`).run();

// 15. Customer Ledger Table (Immutable Double-Entry Credit Ledger)
db.prepare(`
  CREATE TABLE IF NOT EXISTS customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    reference_id TEXT,
    reference_type TEXT,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    balance_after REAL NOT NULL,
    note TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger(customer_id)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_ledger_created_at ON customer_ledger(created_at)`).run();

// 16. Customer Payments Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number TEXT UNIQUE,
    customer_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    payment_date TEXT NOT NULL,
    note TEXT,
    received_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_id ON customer_payments(customer_id)`).run();

// 17. Audit Logs Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  )
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`).run();

// ---------------------------------------------------------------------------
// SAFE SCHEMA AUTO-MIGRATIONS
// ---------------------------------------------------------------------------
function safeAddColumn(tableName, columnName, columnDef) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name);
    if (!cols.includes(columnName)) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`).run();
      console.log(`✅ Added column '${columnName}' to '${tableName}'`);
    }
  } catch (err) {
    console.error(`Error adding column ${columnName} to ${tableName}:`, err);
  }
}

// Ensure columns on sales table
safeAddColumn("sales", "discount", "REAL DEFAULT 0");
safeAddColumn("sales", "discount_amount", "REAL DEFAULT 0");
safeAddColumn("sales", "discounted_total", "REAL DEFAULT 0");
safeAddColumn("sales", "note", "TEXT DEFAULT ''");
safeAddColumn("sales", "customer_id", "INTEGER");
safeAddColumn("sales", "payment_type", "TEXT DEFAULT 'cash'");
safeAddColumn("sales", "payment_status", "TEXT DEFAULT 'paid'");
safeAddColumn("sales", "amount_paid", "REAL DEFAULT 0");
safeAddColumn("sales", "amount_due", "REAL DEFAULT 0");
safeAddColumn("sales", "cashier_name", "TEXT DEFAULT 'Admin'");

// Ensure columns on shop_settings table
safeAddColumn("shop_settings", "currency", "TEXT DEFAULT 'Rs.'");
safeAddColumn("shop_settings", "invoice_prefix", "TEXT DEFAULT 'INV-'");
safeAddColumn("shop_settings", "credit_limit_behavior", "TEXT DEFAULT 'warning'");
safeAddColumn("shop_settings", "auto_backup", "INTEGER DEFAULT 0");
safeAddColumn("shop_settings", "auto_backup_path", "TEXT");
safeAddColumn("shop_settings", "backup_retention", "INTEGER DEFAULT 7");

// Ensure columns on products table
safeAddColumn("products", "quantity", "REAL DEFAULT 0");
safeAddColumn("products", "unit", "TEXT DEFAULT 'pcs'");

// Ensure columns on sale_items table
safeAddColumn("sale_items", "unit", "TEXT DEFAULT 'pcs'");

// Ensure columns on admin table
safeAddColumn("admin", "recovery_pin", "TEXT");

// Default Admin Initialization (Hashed)
const adminRecord = db.prepare("SELECT * FROM admin WHERE username=?").get("admin");
if (!adminRecord) {
  const hashed = hashPassword("1234");
  db.prepare("INSERT INTO admin (username, password) VALUES (?, ?)").run("admin", hashed);
  console.log("✅ Default admin created with hashed password: username=admin, password=1234");
}

// ---------------------------------------------------------------------------
// AUTHENTICATION FUNCTIONS
// ---------------------------------------------------------------------------
function loginAdmin(username, password) {
  const result = db.prepare("SELECT * FROM admin WHERE username=?").get(username);
  if (!result) return { success: false, message: "Invalid credentials" };

  const isValid = verifyPassword(password, result.password);
  if (!isValid) return { success: false, message: "Invalid credentials" };

  // Transparently migrate plaintext password to pbkdf2 hash
  if (!result.password.startsWith("pbkdf2:")) {
    const hashed = hashPassword(password);
    db.prepare("UPDATE admin SET password=? WHERE id=?").run(hashed, result.id);
  }

  return { success: true, admin: { id: result.id, username: result.username } };
}

function changeAdminPassword(currentPassword, newPassword) {
  try {
    const admin = db.prepare("SELECT * FROM admin WHERE username='admin'").get();
    if (!admin) return { success: false, message: "Admin account not found" };

    const isValid = verifyPassword(currentPassword, admin.password);
    if (!isValid) return { success: false, message: "Current password is incorrect" };

    if (!newPassword || String(newPassword).trim().length < 4) {
      return { success: false, message: "New password must be at least 4 characters long" };
    }

    const hashed = hashPassword(String(newPassword).trim());
    db.prepare("UPDATE admin SET password=? WHERE id=?").run(hashed, admin.id);
    addAuditLog("admin", "PASSWORD_CHANGED", "Admin password changed successfully");

    return { success: true, message: "Password updated successfully" };
  } catch (err) {
    console.error("Error changing admin password:", err);
    return { success: false, message: "Failed to update password: " + err.message };
  }
}

function setAdminRecoveryPin(currentPassword, newPin) {
  try {
    const admin = db.prepare("SELECT * FROM admin WHERE username='admin'").get();
    if (!admin) return { success: false, message: "Admin account not found" };

    const isValid = verifyPassword(currentPassword, admin.password);
    if (!isValid) return { success: false, message: "Current password is incorrect" };

    const cleanPin = String(newPin || "").trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      return { success: false, message: "Master Recovery PIN must be 4 to 6 numeric digits (e.g. 7860)" };
    }

    const hashedPin = hashPassword(cleanPin);
    db.prepare("UPDATE admin SET recovery_pin=? WHERE id=?").run(hashedPin, admin.id);
    addAuditLog("admin", "RECOVERY_PIN_UPDATED", "Admin master recovery PIN updated");

    return { success: true, message: "Master Recovery PIN configured successfully" };
  } catch (err) {
    console.error("Error setting recovery PIN:", err);
    return { success: false, message: "Failed to set recovery PIN: " + err.message };
  }
}

function getAdminSecurityStatus() {
  try {
    const admin = db.prepare("SELECT recovery_pin FROM admin WHERE username='admin'").get();
    return {
      hasRecoveryPin: Boolean(admin && admin.recovery_pin && String(admin.recovery_pin).trim() !== "")
    };
  } catch (err) {
    return { hasRecoveryPin: false };
  }
}

function resetAdminPasswordWithPin(username, recoveryPin, newPassword) {
  try {
    const targetUser = String(username || "admin").trim();
    const admin = db.prepare("SELECT * FROM admin WHERE username=?").get(targetUser);
    if (!admin) {
      return { success: false, message: "Admin account not found" };
    }

    if (!admin.recovery_pin) {
      return {
        success: false,
        message: "No Master Recovery PIN has been set for this account. Please use the emergency desktop reset tool."
      };
    }

    const isPinValid = verifyPassword(String(recoveryPin).trim(), admin.recovery_pin);
    if (!isPinValid) {
      return { success: false, message: "Invalid Master Recovery PIN. Please try again." };
    }

    if (!newPassword || String(newPassword).trim().length < 4) {
      return { success: false, message: "New password must be at least 4 characters long" };
    }

    const hashed = hashPassword(String(newPassword).trim());
    db.prepare("UPDATE admin SET password=? WHERE id=?").run(hashed, admin.id);
    addAuditLog("system", "ADMIN_PASSWORD_RESET_PIN", `Admin password reset via Master PIN for ${targetUser}`);

    return { success: true, message: "Password reset successfully! You can now log in with your new password." };
  } catch (err) {
    console.error("Error resetting password with PIN:", err);
    return { success: false, message: "Failed to reset password: " + err.message };
  }
}

function registerCashier(username, password) {
  try {
    const hashed = hashPassword(password);
    const stmt = db.prepare("INSERT INTO cashiers (username, password) VALUES (?, ?)");
    const result = stmt.run(username, hashed);
    return Promise.resolve({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    return Promise.reject(err);
  }
}

function loginCashier(username, password) {
  try {
    const row = db.prepare("SELECT * FROM cashiers WHERE username = ?").get(username);
    if (!row) return Promise.resolve(null);

    const isValid = verifyPassword(password, row.password);
    if (!isValid) return Promise.resolve(null);

    // Transparently upgrade plaintext password
    if (!row.password.startsWith("pbkdf2:")) {
      const hashed = hashPassword(password);
      db.prepare("UPDATE cashiers SET password=? WHERE id=?").run(hashed, row.id);
    }

    return Promise.resolve({ id: row.id, username: row.username });
  } catch (err) {
    return Promise.reject(err);
  }
}

function getAllCashiers() {
  return db.prepare("SELECT id, username FROM cashiers ORDER BY id DESC").all();
}

function deleteCashier(id) {
  db.prepare("DELETE FROM cashiers WHERE id = ?").run(id);
  return { success: true };
}

// ---------------------------------------------------------------------------
// AUDIT LOG FUNCTIONS
// ---------------------------------------------------------------------------
function addAuditLog(user, action, details) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_logs (user, action, details, created_at)
    VALUES (?, ?, ?, ?)
  `).run(user || "system", action, details, now);
}

function getAuditLogs(limit = 100) {
  return db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit);
}

// ---------------------------------------------------------------------------
// DIGITAL KHATA / CUSTOMER FUNCTIONS
// ---------------------------------------------------------------------------
const customerBalanceQuery = `
  SELECT c.*,
    COALESCE(SUM(l.debit), 0) AS total_credit,
    COALESCE(SUM(l.credit), 0) AS total_paid,
    COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS current_due,
    MAX(l.created_at) AS last_transaction_date,
    MAX(CASE WHEN l.credit > 0 THEN l.created_at ELSE NULL END) AS last_payment_date
  FROM customers c
  LEFT JOIN customer_ledger l ON c.id = l.customer_id
  WHERE c.deleted_at IS NULL
  GROUP BY c.id
`;

function checkDuplicatePhone(phone, excludeId = null) {
  if (!phone || !String(phone).trim()) return null;
  const cleanPhone = String(phone).trim();
  const query = excludeId
    ? `SELECT id FROM customers WHERE phone = ? AND id != ? AND deleted_at IS NULL`
    : `SELECT id FROM customers WHERE phone = ? AND deleted_at IS NULL`;

  const row = excludeId
    ? db.prepare(query).get(cleanPhone, excludeId)
    : db.prepare(query).get(cleanPhone);

  if (row) {
    return getCustomerById(row.id);
  }
  return null;
}

function getCustomers(options = {}) {
  const { filter = "all", search = "", sort = "highest_due" } = options;
  let query = `
    SELECT * FROM (
      ${customerBalanceQuery}
    )
    WHERE 1=1
  `;
  const params = [];

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    query += ` AND (name LIKE ? OR phone LIKE ? OR alternate_phone LIKE ? OR CAST(id AS TEXT) LIKE ?)`;
    params.push(s, s, s, s);
  }

  if (filter === "dues") {
    query += ` AND current_due > 0`;
  } else if (filter === "cleared") {
    query += ` AND current_due <= 0 AND total_credit > 0`;
  } else if (filter === "limit_exceeded") {
    query += ` AND credit_limit > 0 AND current_due > credit_limit`;
  }

  if (sort === "highest_due") {
    query += ` ORDER BY current_due DESC, id DESC`;
  } else if (sort === "lowest_due") {
    query += ` ORDER BY current_due ASC, id DESC`;
  } else if (sort === "name_asc") {
    query += ` ORDER BY name ASC`;
  } else if (sort === "recent") {
    query += ` ORDER BY COALESCE(last_transaction_date, created_at) DESC`;
  } else if (sort === "oldest_due") {
    query += ` ORDER BY COALESCE(last_payment_date, last_transaction_date, created_at) ASC`;
  } else {
    query += ` ORDER BY id DESC`;
  }

  return db.prepare(query).all(...params);
}

function getCustomerById(id) {
  const query = `
    SELECT * FROM (
      ${customerBalanceQuery}
    )
    WHERE id = ?
  `;
  return db.prepare(query).get(id) || null;
}

function addCustomer(customerData, user = "admin") {
  const {
    name,
    phone = "",
    alternate_phone = "",
    address = "",
    notes = "",
    credit_limit = 0,
    opening_balance = 0
  } = customerData;

  if (!name || !name.trim()) {
    throw new Error("Customer name is required");
  }

  const cleanPhone = phone ? String(phone).trim() : null;
  const now = new Date().toISOString();
  const openingBal = Number(opening_balance) || 0;
  const creditLim = Number(credit_limit) || 0;

  try {
    db.prepare("BEGIN TRANSACTION").run();

    const insertStmt = db.prepare(`
      INSERT INTO customers (name, phone, alternate_phone, address, notes, credit_limit, opening_balance, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    const result = insertStmt.run(
      name.trim(),
      cleanPhone,
      alternate_phone ? String(alternate_phone).trim() : null,
      address ? String(address).trim() : null,
      notes ? String(notes).trim() : null,
      creditLim,
      openingBal,
      now,
      now
    );

    const customerId = result.lastInsertRowid;

    if (openingBal > 0) {
      db.prepare(`
        INSERT INTO customer_ledger (customer_id, type, reference_id, reference_type, debit, credit, balance_after, note, created_by, created_at)
        VALUES (?, 'OPENING_BALANCE', 'OPENING', 'opening', ?, 0, ?, ?, ?, ?)
      `).run(
        customerId,
        openingBal,
        openingBal,
        notes ? `Opening Balance: ${notes}` : "Initial Opening Balance transferred",
        user,
        now
      );
    }

    addAuditLog(user, "CUSTOMER_CREATED", `Created customer "${name.trim()}" (ID: ${customerId}) with opening balance Rs. ${openingBal}`);

    db.prepare("COMMIT").run();
    return getCustomerById(customerId);
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }
}

function updateCustomer(customerData, user = "admin") {
  const { id, name, phone, alternate_phone, address, notes, credit_limit } = customerData;
  if (!id) throw new Error("Customer ID required");
  const existing = getCustomerById(id);
  if (!existing) throw new Error("Customer not found");

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, alternate_phone = ?, address = ?, notes = ?, credit_limit = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name ? name.trim() : existing.name,
    phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone,
    alternate_phone !== undefined ? (alternate_phone ? String(alternate_phone).trim() : null) : existing.alternate_phone,
    address !== undefined ? (address ? String(address).trim() : null) : existing.address,
    notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
    credit_limit !== undefined ? (Number(credit_limit) || 0) : existing.credit_limit,
    now,
    id
  );

  addAuditLog(user, "CUSTOMER_UPDATED", `Updated customer details for "${existing.name}" (ID: ${id})`);
  return getCustomerById(id);
}

function deactivateCustomer(id, user = "admin") {
  const existing = getCustomerById(id);
  if (!existing) throw new Error("Customer not found");
  const now = new Date().toISOString();
  db.prepare(`UPDATE customers SET status = 'inactive', updated_at = ? WHERE id = ?`).run(now, id);
  addAuditLog(user, "CUSTOMER_DEACTIVATED", `Deactivated customer "${existing.name}" (ID: ${id})`);
  return { success: true };
}

function deleteCustomer(id, user = "admin") {
  const existing = getCustomerById(id);
  if (!existing) throw new Error("Customer not found");

  const ledgerCount = db.prepare("SELECT COUNT(*) AS count FROM customer_ledger WHERE customer_id = ?").get(id).count;
  if (ledgerCount > 0) {
    // Soft delete to protect financial audit integrity
    const now = new Date().toISOString();
    db.prepare("UPDATE customers SET deleted_at = ?, status = 'deleted' WHERE id = ?").run(now, id);
    addAuditLog(user, "CUSTOMER_ARCHIVED", `Archived customer "${existing.name}" (ID: ${id}) with ${ledgerCount} financial entries`);
    return { success: true, archived: true, message: "Customer archived to preserve transaction history" };
  }

  db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  addAuditLog(user, "CUSTOMER_DELETED", `Deleted customer "${existing.name}" (ID: ${id})`);
  return { success: true, deleted: true };
}

function getCustomerLedger(customerId) {
  return db.prepare(`
    SELECT l.*,
      CASE 
        WHEN l.type = 'CREDIT_SALE' THEN 'Credit Sale'
        WHEN l.type = 'PAYMENT' THEN 'Payment'
        WHEN l.type = 'OPENING_BALANCE' THEN 'Opening Balance'
        WHEN l.type = 'ADJUSTMENT' THEN 'Adjustment'
        WHEN l.type = 'SALE_RETURN' THEN 'Sale Return'
        ELSE l.type
      END as type_label
    FROM customer_ledger l
    WHERE l.customer_id = ?
    ORDER BY l.id ASC
  `).all(customerId);
}

function addCustomerPayment(paymentData) {
  const {
    customer_id,
    amount,
    payment_method = "cash",
    note = "",
    received_by = "admin"
  } = paymentData;

  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  const customer = getCustomerById(customer_id);
  if (!customer) {
    throw new Error("Customer not found");
  }

  if (customer.current_due > 0 && numAmount > customer.current_due) {
    throw new Error(`Payment (Rs. ${numAmount}) cannot exceed current outstanding due of Rs. ${customer.current_due}`);
  }

  const now = new Date().toISOString();
  const paymentNumber = `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    db.prepare("BEGIN TRANSACTION").run();

    // 1. Insert into customer_payments
    const payStmt = db.prepare(`
      INSERT INTO customer_payments (payment_number, customer_id, amount, payment_method, payment_date, note, received_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const payResult = payStmt.run(paymentNumber, customer_id, numAmount, payment_method, now, note, received_by, now);

    // 2. Compute new balance
    const balRow = db.prepare(`
      SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS balance
      FROM customer_ledger
      WHERE customer_id = ?
    `).get(customer_id);
    const prevBalance = balRow ? balRow.balance : 0;
    const balanceAfter = Math.max(0, prevBalance - numAmount);

    // 3. Insert into customer_ledger
    db.prepare(`
      INSERT INTO customer_ledger (customer_id, type, reference_id, reference_type, debit, credit, balance_after, note, created_by, created_at)
      VALUES (?, 'PAYMENT', ?, 'payment', 0, ?, ?, ?, ?, ?)
    `).run(
      customer_id,
      paymentNumber,
      numAmount,
      balanceAfter,
      note ? `Payment: ${note}` : "Payment received",
      received_by,
      now
    );

    // 4. Audit Log
    addAuditLog(received_by, "PAYMENT_RECEIVED", `Payment ${paymentNumber} of Rs. ${numAmount} received from ${customer.name} (ID: ${customer_id}). New balance: Rs. ${balanceAfter}`);

    db.prepare("COMMIT").run();

    return {
      success: true,
      payment_id: payResult.lastInsertRowid,
      payment_number: paymentNumber,
      amount: numAmount,
      previous_due: prevBalance,
      remaining_due: balanceAfter,
      date: now,
      customer_name: customer.name,
      customer_phone: customer.phone,
      payment_method,
      note,
      received_by
    };
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }
}

function adjustCustomerBalance(adjustmentData) {
  const { customer_id, amount, type, note, user = "admin" } = adjustmentData;
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    throw new Error("Adjustment amount must be positive");
  }
  if (!note || !note.trim()) {
    throw new Error("A reason note is required for manual balance adjustment");
  }

  const customer = getCustomerById(customer_id);
  if (!customer) throw new Error("Customer not found");

  const now = new Date().toISOString();
  const adjRef = `ADJ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    db.prepare("BEGIN TRANSACTION").run();

    const balRow = db.prepare(`
      SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS balance
      FROM customer_ledger
      WHERE customer_id = ?
    `).get(customer_id);
    const prevBalance = balRow ? balRow.balance : 0;

    let debit = 0;
    let credit = 0;
    let balanceAfter = prevBalance;

    if (type === "debit") {
      // Increases customer debt
      debit = numAmount;
      balanceAfter = prevBalance + numAmount;
    } else {
      // Decreases customer debt
      credit = numAmount;
      balanceAfter = Math.max(0, prevBalance - numAmount);
    }

    db.prepare(`
      INSERT INTO customer_ledger (customer_id, type, reference_id, reference_type, debit, credit, balance_after, note, created_by, created_at)
      VALUES (?, 'ADJUSTMENT', ?, 'adjustment', ?, ?, ?, ?, ?, ?)
    `).run(
      customer_id,
      adjRef,
      debit,
      credit,
      balanceAfter,
      `Manual Adjustment: ${note.trim()}`,
      user,
      now
    );

    addAuditLog(user, "BALANCE_ADJUSTED", `Manual adjustment (${type}) of Rs. ${numAmount} for customer ${customer.name}. Reason: ${note.trim()}`);

    db.prepare("COMMIT").run();
    return { success: true, balance_after: balanceAfter, adjRef };
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }
}

function getKhataSummary() {
  const totalCustomers = db.prepare("SELECT COUNT(*) AS count FROM customers WHERE deleted_at IS NULL").get().count;

  const allBalRows = db.prepare(`
    SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS balance,
           COALESCE(SUM(l.debit), 0) as total_credit
    FROM customers c
    LEFT JOIN customer_ledger l ON c.id = l.customer_id
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
  `).all();

  let customersWithDues = 0;
  let totalOutstanding = 0;
  let clearedAccounts = 0;

  allBalRows.forEach((r) => {
    if (r.balance > 0) {
      customersWithDues++;
      totalOutstanding += r.balance;
    } else if (r.total_credit > 0 && r.balance <= 0) {
      clearedAccounts++;
    }
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const paymentsTodayRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM customer_payments
    WHERE payment_date LIKE ?
  `).get(`${todayStr}%`);

  const creditSalesTodayRow = db.prepare(`
    SELECT COALESCE(SUM(discounted_total), 0) AS total
    FROM sales
    WHERE payment_type = 'credit' AND date LIKE ?
  `).get(`${todayStr}%`);

  return {
    totalCustomers,
    customersWithDues,
    totalOutstanding,
    paymentsToday: paymentsTodayRow ? paymentsTodayRow.total : 0,
    creditSalesToday: creditSalesTodayRow ? creditSalesTodayRow.total : 0,
    clearedAccounts
  };
}

function getOutstandingDues(sort = "highest_due") {
  let query = `
    SELECT * FROM (
      ${customerBalanceQuery}
    )
    WHERE current_due > 0
  `;

  if (sort === "highest_due") {
    query += ` ORDER BY current_due DESC`;
  } else if (sort === "oldest_due") {
    query += ` ORDER BY COALESCE(last_payment_date, last_transaction_date, created_at) ASC`;
  } else {
    query += ` ORDER BY COALESCE(last_transaction_date, created_at) DESC`;
  }

  const rows = db.prepare(query).all();
  const now = new Date();

  return rows.map((r) => {
    const lastDateStr = r.last_payment_date || r.last_transaction_date || r.created_at;
    let daysSince = 0;
    if (lastDateStr) {
      const diffTime = Math.abs(now - new Date(lastDateStr));
      daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }
    return {
      ...r,
      days_since_last_activity: daysSince
    };
  });
}

function importKhataCustomers(customerRows, user = "admin") {
  let created = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const row of customerRows) {
    const name = String(row.name || row["customer name"] || row.customer || "").trim();
    if (!name) {
      skipped++;
      continue;
    }

    const phone = String(row.phone || row.mobile || row.contact || "").trim();
    if (phone) {
      const existing = checkDuplicatePhone(phone);
      if (existing) {
        duplicates++;
        continue;
      }
    }

    const openingBalance = Number(row.opening_balance || row.balance || row.due || row.khata || 0);
    const address = String(row.address || "").trim();
    const notes = String(row.notes || row.note || "").trim();
    const creditLimit = Number(row.credit_limit || row["credit limit"] || 0);

    try {
      addCustomer({
        name,
        phone,
        address,
        notes,
        opening_balance: openingBalance,
        credit_limit: creditLimit
      }, user);
      created++;
    } catch (e) {
      skipped++;
    }
  }

  return { created, skipped, duplicates };
}

// ---------------------------------------------------------------------------
// VENDOR FUNCTIONS
// ---------------------------------------------------------------------------
const vendorBalanceQuery = `
  SELECT v.*,
         COALESCE(p.total_purchases, 0) AS total_purchases,
         COALESCE(pay.total_payments, 0) AS total_payments,
         (COALESCE(v.opening_balance, 0) + COALESCE(p.total_purchases, 0) - COALESCE(pay.total_payments, 0)) AS balance,
         CASE
           WHEN p.last_purchase_date IS NULL THEN pay.last_payment_date
           WHEN pay.last_payment_date IS NULL THEN p.last_purchase_date
           WHEN p.last_purchase_date > pay.last_payment_date THEN p.last_purchase_date
           ELSE pay.last_payment_date
         END AS last_transaction_date
  FROM vendors v
  LEFT JOIN (
    SELECT vendor_id, SUM(total_amount) AS total_purchases, MAX(purchase_date) AS last_purchase_date
    FROM purchases
    GROUP BY vendor_id
  ) p ON v.id = p.vendor_id
  LEFT JOIN (
    SELECT vendor_id, SUM(amount) AS total_payments, MAX(payment_date) AS last_payment_date
    FROM vendor_payments
    GROUP BY vendor_id
  ) pay ON v.id = pay.vendor_id
`;

function getVendorsWithBalances(vendorId) {
  const query = `
    ${vendorBalanceQuery}
    ${vendorId ? "WHERE v.id = ?" : ""}
    ORDER BY v.id DESC
  `;
  return vendorId
    ? db.prepare(query).get(vendorId)
    : db.prepare(query).all();
}

function addVendor(vendor) {
  const now = new Date().toISOString();
  const openingBalance = Number(vendor.opening_balance) || 0;

  const insertStmt = db.prepare(`
    INSERT INTO vendors (name, contact, shop_name, address, opening_balance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(
    vendor.name,
    vendor.contact || null,
    vendor.shop_name || null,
    vendor.address || null,
    openingBalance,
    now,
    now
  );

  return { id: result.lastInsertRowid, ...vendor, opening_balance: openingBalance, created_at: now };
}

function getVendors() {
  return getVendorsWithBalances();
}

function getVendorById(id) {
  return getVendorsWithBalances(id);
}

function updateVendor(vendor) {
  const now = new Date().toISOString();
  const existing = getVendorById(vendor.id);
  if (!existing) throw new Error("Vendor not found");

  const openingBalance = Number(vendor.opening_balance) || 0;

  db.prepare(`
    UPDATE vendors
    SET name = ?, contact = ?, shop_name = ?, address = ?,
        opening_balance = ?, updated_at = ?
    WHERE id = ?
  `).run(
    vendor.name,
    vendor.contact || null,
    vendor.shop_name || null,
    vendor.address || null,
    openingBalance,
    now,
    vendor.id
  );

  return { success: true };
}

function deleteVendor(id) {
  db.prepare(`DELETE FROM purchase_items WHERE purchase_id IN (SELECT id FROM purchases WHERE vendor_id = ?)`).run(id);
  db.prepare(`DELETE FROM purchases WHERE vendor_id = ?`).run(id);
  db.prepare(`DELETE FROM vendor_payments WHERE vendor_id = ?`).run(id);
  db.prepare(`DELETE FROM vendor_history WHERE vendor_id = ?`).run(id);
  db.prepare(`DELETE FROM vendors WHERE id = ?`).run(id);
  return { success: true };
}

function getVendorHistory(vendorId) {
  return db.prepare(`
    SELECT 'purchase' AS type,
           id,
           purchase_date AS date,
           total_amount AS amount,
           paid_amount,
           payment_status,
           note
    FROM purchases
    WHERE vendor_id = ?
    UNION ALL
    SELECT 'payment' AS type,
           id,
           payment_date AS date,
           amount,
           NULL AS paid_amount,
           NULL AS payment_status,
           note
    FROM vendor_payments
    WHERE vendor_id = ?
    ORDER BY date DESC
  `).all(vendorId, vendorId);
}

// ---------------------------------------------------------------------------
// CATEGORIES & PRODUCTS FUNCTIONS
// ---------------------------------------------------------------------------
function addCategory(name) {
  const stmt = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const result = stmt.run(name);
  return { id: result.lastInsertRowid, name };
}

function getCategories() {
  return db.prepare("SELECT * FROM categories ORDER BY id DESC").all();
}

function updateCategory(id, name) {
  db.prepare("UPDATE categories SET name=? WHERE id=?").run(name, id);
  return { success: true };
}

function deleteCategory(id) {
  db.prepare("DELETE FROM categories WHERE id=?").run(id);
  return { success: true };
}

function getCategoriesForExport() {
  return db.prepare("SELECT * FROM categories ORDER BY id ASC").all();
}

function getProductsForExport() {
  return db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.id ASC
  `).all();
}

function getCategoryById(id) {
  return db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
}

function upsertCategoryByName(name) {
  if (!name) return { id: null, created: false };
  const trimmed = String(name).trim();
  if (!trimmed) return { id: null, created: false };

  const existing = db
    .prepare("SELECT id, name FROM categories WHERE lower(name) = lower(?)")
    .get(trimmed);

  if (existing) {
    return { id: existing.id, created: false };
  }

  const result = db.prepare("INSERT INTO categories (name) VALUES (?)").run(trimmed);
  return { id: result.lastInsertRowid, created: true };
}

function getProductByNameAndCategory(name, categoryId) {
  if (categoryId === null || categoryId === undefined || categoryId === "") {
    return db
      .prepare("SELECT * FROM products WHERE lower(name) = lower(?) AND category_id IS NULL")
      .get(name);
  }

  return db
    .prepare("SELECT * FROM products WHERE lower(name) = lower(?) AND category_id = ?")
    .get(name, categoryId);
}

function upsertProductFromImport(product) {
  const barcode = product.barcode && String(product.barcode).trim() !== ""
    ? String(product.barcode).trim()
    : null;
  const unit = product.unit ? String(product.unit).trim().toLowerCase() : "pcs";

  let existing = null;
  if (barcode) {
    existing = db.prepare("SELECT * FROM products WHERE barcode = ?").get(barcode);
  } else if (product.name) {
    existing = getProductByNameAndCategory(product.name, product.category_id);
  }

  if (existing) {
    db.prepare(`
      UPDATE products
      SET barcode = ?,
          name = ?,
          category_id = ?,
          quantity = ?,
          purchase_price = ?,
          selling_price = ?,
          unit = COALESCE(?, unit, 'pcs'),
          description = ?
      WHERE id = ?
    `).run(
      barcode,
      product.name,
      product.category_id,
      product.quantity,
      product.purchase_price,
      product.selling_price,
      unit,
      product.description,
      existing.id
    );

    return { id: existing.id, created: false, updated: true };
  }

  const result = db.prepare(`
    INSERT INTO products (barcode, name, category_id, quantity, purchase_price, selling_price, unit, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    barcode,
    product.name,
    product.category_id,
    product.quantity,
    product.purchase_price,
    product.selling_price,
    unit,
    product.description
  );

  return { id: result.lastInsertRowid, created: true, updated: false };
}

function addProduct(product) {
  const barcode = (!product.barcode || product.barcode.trim() === "") ? null : product.barcode.trim();
  const safeProduct = {
    barcode,
    name: product.name || "",
    category_id: product.category_id !== undefined && product.category_id !== "" ? product.category_id : null,
    quantity: Number(product.quantity) || 0,
    purchase_price: Number(product.purchase_price) || 0,
    selling_price: Number(product.selling_price) || 0,
    unit: product.unit ? String(product.unit).trim().toLowerCase() : "pcs",
    description: product.description || ""
  };

  try {
    const stmt = db.prepare(`
      INSERT INTO products (barcode, name, category_id, quantity, purchase_price, selling_price, unit, description)
      VALUES (@barcode, @name, @category_id, @quantity, @purchase_price, @selling_price, @unit, @description)
    `);
    const result = stmt.run(safeProduct);
    return { id: result.lastInsertRowid, ...safeProduct };
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new Error(`Barcode '${product.barcode}' already exists.`);
    }
    throw err;
  }
}

function getProducts() {
  const query = `
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.id DESC
  `;
  return db.prepare(query).all();
}

function updateProduct(product) {
  const barcode = (!product.barcode || product.barcode.trim() === "") ? null : product.barcode.trim();
  const safeProduct = {
    id: product.id,
    barcode,
    name: product.name || "",
    category_id: product.category_id !== undefined && product.category_id !== "" ? product.category_id : null,
    quantity: Number(product.quantity) || 0,
    purchase_price: Number(product.purchase_price) || 0,
    selling_price: Number(product.selling_price) || 0,
    unit: product.unit ? String(product.unit).trim().toLowerCase() : "pcs",
    description: product.description || ""
  };

  try {
    if (safeProduct.barcode) {
      const existing = db
        .prepare(`SELECT id FROM products WHERE barcode = ? AND id != ?`)
        .get(safeProduct.barcode, safeProduct.id);

      if (existing) {
        throw new Error(`Barcode '${safeProduct.barcode}' already exists for another product.`);
      }
    }

    const stmt = db.prepare(`
      UPDATE products
      SET barcode=@barcode,
          name=@name,
          category_id=@category_id,
          quantity=@quantity,
          purchase_price=@purchase_price,
          selling_price=@selling_price,
          unit=@unit,
          description=@description
      WHERE id=@id
    `);
    stmt.run(safeProduct);
    return { success: true };
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new Error(`Barcode '${product.barcode}' already exists.`);
    }
    throw err;
  }
}

function deleteProduct(id) {
  db.prepare("DELETE FROM products WHERE id=?").run(id);
  return { success: true };
}

function getProductByBarcodeOrName(input) {
  try {
    const stmt = db.prepare(`SELECT * FROM products WHERE barcode = ? OR name LIKE ?`);
    const row = stmt.get(input, `%${input}%`);
    return row || null;
  } catch (err) {
    console.error("Error fetching product:", err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// SALES & CHECKOUT (WITH FULL DIGITAL KHATA CREDIT SUPPORT)
// ---------------------------------------------------------------------------
function saveSale(saleData) {
  return new Promise((resolve, reject) => {
    const { 
      cart, 
      total, 
      discount = 0, 
      discountAmount = 0, 
      discountedTotal, 
      received = 0, 
      change = 0, 
      customer,
      customer_id = null,
      payment_type = "cash",
      cashier_name = "Admin",
      note = "" 
    } = saleData;
    
    const date = new Date().toISOString();
    const finalTotal = discountedTotal !== undefined ? discountedTotal : total;

    try {
      db.prepare("BEGIN TRANSACTION").run();

      // Check customer credit limits if credit sale
      let customerRecord = null;
      if (payment_type === "credit") {
        if (!customer_id) {
          throw new Error("Customer must be selected for Credit / Khata sale");
        }
        customerRecord = db.prepare("SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL").get(customer_id);
        if (!customerRecord) {
          throw new Error("Selected customer not found in database");
        }

        const settings = db.prepare("SELECT credit_limit_behavior FROM shop_settings WHERE id = 1").get();
        if (settings && settings.credit_limit_behavior === "block" && customerRecord.credit_limit > 0) {
          const balRow = db.prepare(`
            SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS balance
            FROM customer_ledger WHERE customer_id = ?
          `).get(customer_id);
          const currentBal = balRow ? balRow.balance : 0;
          if (currentBal + finalTotal > customerRecord.credit_limit) {
            throw new Error(`Sale blocked: Exceeds customer credit limit of Rs. ${customerRecord.credit_limit}`);
          }
        }
      }

      // Stock validation
      for (const item of cart) {
        const requestedQuantity = Number(item.quantity) || 0;
        if (!item.id || requestedQuantity <= 0) {
          throw new Error(`Invalid quantity for ${item.name || "product"}`);
        }

        const product = db.prepare("SELECT id, name, quantity FROM products WHERE id = ?").get(item.id);
        if (!product) {
          throw new Error(`Product not found: ${item.name || item.id}`);
        }

        if (Number(product.quantity) < requestedQuantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${product.quantity}, requested: ${requestedQuantity}`
          );
        }
      }

      const numReceived = Number(received) || 0;
      let amountPaid = 0;
      let amountDue = 0;
      let paymentStatus = "paid";

      if (payment_type === "credit") {
        amountPaid = Math.min(numReceived, finalTotal);
        amountDue = Math.max(0, finalTotal - amountPaid);
        paymentStatus = amountDue === 0 ? "paid" : amountPaid > 0 ? "partial" : "credit";
      } else {
        amountPaid = finalTotal;
        amountDue = 0;
        paymentStatus = "paid";
      }

      // Insert sale record
      const saleStmt = db.prepare(`
        INSERT INTO sales (
          date, total, discount, discount_amount, discounted_total, 
          received, change, customer_name, customer_id, payment_type,
          payment_status, amount_paid, amount_due, cashier_name, note
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const saleResult = saleStmt.run(
        date, 
        total, 
        discount, 
        discountAmount, 
        finalTotal,
        numReceived, 
        change, 
        customer || (customerRecord ? customerRecord.name : "Walk-in Customer"),
        customer_id || null,
        payment_type,
        paymentStatus,
        amountPaid,
        amountDue,
        cashier_name,
        note
      );
      
      const saleId = saleResult.lastInsertRowid;
      const invoiceNumber = `INV-${saleId}`;

      // Insert sale items and deduct stock
      const saleItemStmt = db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, total, unit) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const updateProductStmt = db.prepare(`
        UPDATE products SET quantity = ROUND(quantity - ?, 3) WHERE id = ?
      `);

      for (const item of cart) {
        const itemQty = Number(item.quantity) || 0;
        const itemPrice = Number(item.selling_price) || 0;
        const itemTotal = Number(
          item.line_total !== undefined 
            ? item.line_total 
            : Math.round(itemQty * itemPrice * 100) / 100
        );
        const itemUnit = item.unit || "pcs";

        saleItemStmt.run(
          saleId,
          item.id,
          item.name,
          itemQty,
          itemPrice,
          itemTotal,
          itemUnit
        );
        updateProductStmt.run(itemQty, item.id);
      }

      // If credit sale, update customer ledger atomically
      if (payment_type === "credit" && customer_id) {
        const balRow = db.prepare(`
          SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS balance
          FROM customer_ledger WHERE customer_id = ?
        `).get(customer_id);
        const prevBal = balRow ? balRow.balance : 0;
        const balAfterSale = prevBal + finalTotal;

        // Record credit sale in ledger
        db.prepare(`
          INSERT INTO customer_ledger (customer_id, type, reference_id, reference_type, debit, credit, balance_after, note, created_by, created_at)
          VALUES (?, 'CREDIT_SALE', ?, 'sale', ?, 0, ?, ?, ?, ?)
        `).run(
          customer_id,
          invoiceNumber,
          finalTotal,
          balAfterSale,
          note ? `Credit Sale: ${note}` : "Credit Sale from POS",
          cashier_name,
          date
        );

        // If upfront partial payment made
        if (amountPaid > 0) {
          const paymentNumber = `PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
          db.prepare(`
            INSERT INTO customer_payments (payment_number, customer_id, amount, payment_method, payment_date, note, received_by, created_at)
            VALUES (?, ?, ?, 'cash', ?, ?, ?, ?)
          `).run(paymentNumber, customer_id, amountPaid, date, `Upfront payment on ${invoiceNumber}`, cashier_name, date);

          const finalBal = balAfterSale - amountPaid;
          db.prepare(`
            INSERT INTO customer_ledger (customer_id, type, reference_id, reference_type, debit, credit, balance_after, note, created_by, created_at)
            VALUES (?, 'PAYMENT', ?, 'payment', 0, ?, ?, ?, ?, ?)
          `).run(
            customer_id,
            paymentNumber,
            amountPaid,
            finalBal,
            `Upfront payment at checkout for ${invoiceNumber}`,
            cashier_name,
            date
          );
        }

        addAuditLog(cashier_name, "CREDIT_SALE", `Credit sale ${invoiceNumber} of Rs. ${finalTotal} to customer "${customerRecord.name}" (ID: ${customer_id})`);
      } else {
        addAuditLog(cashier_name, "SALE_COMPLETED", `Sale ${invoiceNumber} of Rs. ${finalTotal} completed via ${payment_type}`);
      }

      db.prepare("COMMIT").run();
      resolve({ success: true, saleId, invoiceNumber });

    } catch (err) {
      db.prepare("ROLLBACK").run();
      console.error("Error saving sale:", err);
      reject(err);
    }
  });
}

function enrichSaleProfit(sale) {
  const totalProfit = Number(sale.total_profit || 0);
  const finalTotal = Number(sale.discounted_total !== undefined && sale.discounted_total !== null ? sale.discounted_total : sale.total || 0);
  const isCredit = sale.payment_type === "credit";
  const amountPaid = isCredit ? Number(sale.amount_paid || 0) : finalTotal;
  const amountDue = isCredit ? Math.max(0, Number(sale.amount_due !== undefined && sale.amount_due !== null ? sale.amount_due : (finalTotal - amountPaid))) : 0;

  let realizedProfit = totalProfit;
  let pendingProfit = 0;

  if (isCredit && finalTotal > 0) {
    const paidRatio = Math.min(1, Math.max(0, amountPaid / finalTotal));
    realizedProfit = Math.round(totalProfit * paidRatio * 100) / 100;
    pendingProfit = Math.round((totalProfit - realizedProfit) * 100) / 100;
  }

  return {
    ...sale,
    total_profit: totalProfit,
    realized_profit: realizedProfit,
    pending_profit: pendingProfit
  };
}

function getAllSales() {
  const query = `
    SELECT s.*, 
           (SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id) AS total_items,
           COALESCE(
             (SELECT SUM((si.price - COALESCE(p.purchase_price, 0)) * si.quantity) 
              FROM sale_items si 
              LEFT JOIN products p ON si.product_id = p.id 
              WHERE si.sale_id = s.id) - COALESCE(s.discount_amount, 0),
             0
           ) AS total_profit
    FROM sales s
    ORDER BY s.date DESC
  `;
  const rows = db.prepare(query).all();
  return rows.map(enrichSaleProfit);
}

function getSalesByDateRange(start, end) {
  const query = `
    SELECT s.*, 
           (SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id) AS total_items,
           COALESCE(
             (SELECT SUM((si.price - COALESCE(p.purchase_price, 0)) * si.quantity) 
              FROM sale_items si 
              LEFT JOIN products p ON si.product_id = p.id 
              WHERE si.sale_id = s.id) - COALESCE(s.discount_amount, 0),
             0
           ) AS total_profit
    FROM sales s
    WHERE date BETWEEN ? AND ?
    ORDER BY s.date DESC
  `;
  const rows = db.prepare(query).all(start, end);
  return rows.map(enrichSaleProfit);
}

function getSalesCategoryBreakdown(start, end) {
  let query = `
    SELECT 
      COALESCE(c.name, 'Uncategorized') AS category_name,
      ROUND(SUM(COALESCE(si.total, si.price * si.quantity, 0)), 2) AS total_sales,
      SUM(si.quantity) AS total_quantity,
      COUNT(DISTINCT s.id) AS total_transactions
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    LEFT JOIN products p ON si.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
  `;
  const params = [];
  if (start && end) {
    query += ` WHERE s.date BETWEEN ? AND ? `;
    params.push(start, end);
  }
  query += `
    GROUP BY category_name
    ORDER BY total_sales DESC
  `;
  return db.prepare(query).all(...params);
}

function getSales() {
  const query = `
    SELECT s.*, 
           COUNT(si.id) as items_count,
           GROUP_CONCAT(si.product_name) as product_names
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    GROUP BY s.id
    ORDER BY s.date DESC
  `;
  return db.prepare(query).all();
}

function getSaleDetails(saleId) {
  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId);
  const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(saleId);
  return { sale, items };
}

function deleteSale(saleId, user = "admin") {
  try {
    db.prepare("BEGIN TRANSACTION").run();

    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId);
    if (!sale) throw new Error("Sale record not found");

    // 1. Restore product stock
    const items = db.prepare("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?").all(saleId);
    const restoreStmt = db.prepare("UPDATE products SET quantity = ROUND(quantity + ?, 3) WHERE id = ?");
    items.forEach((item) => {
      restoreStmt.run(item.quantity, item.product_id);
    });

    // 2. If credit sale, reverse ledger entry AND any upfront checkout payment
    if (sale.customer_id && sale.payment_type === "credit") {
      const invoiceRef = `INV-${saleId}`;
      db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_id = ?").run(sale.customer_id, invoiceRef);

      // Clean up any upfront payment created at checkout for this invoice
      const payments = db.prepare(
        "SELECT id, payment_number FROM customer_payments WHERE customer_id = ? AND note LIKE ?"
      ).all(sale.customer_id, `%${invoiceRef}%`);

      for (const p of payments) {
        db.prepare("DELETE FROM customer_ledger WHERE customer_id = ? AND reference_id = ?").run(sale.customer_id, p.payment_number);
        db.prepare("DELETE FROM customer_payments WHERE id = ?").run(p.id);
      }

      // Re-calculate running balance_after for customer ledger
      const remainingLedger = db.prepare("SELECT id, debit, credit FROM customer_ledger WHERE customer_id = ? ORDER BY id ASC").all(sale.customer_id);
      let runningBal = 0;
      const updateBalStmt = db.prepare("UPDATE customer_ledger SET balance_after = ? WHERE id = ?");
      for (const entry of remainingLedger) {
        runningBal += (entry.debit - entry.credit);
        updateBalStmt.run(runningBal, entry.id);
      }
    }

    // 3. Delete sale items and sale record
    db.prepare("DELETE FROM sale_items WHERE sale_id = ?").run(saleId);
    db.prepare("DELETE FROM sales WHERE id = ?").run(saleId);

    addAuditLog(user, "SALE_DELETED", `Deleted sale INV-${saleId} of Rs. ${sale.discounted_total || sale.total}`);

    db.prepare("COMMIT").run();
    return { success: true };
  } catch (err) {
    db.prepare("ROLLBACK").run();
    console.error("❌ Error deleting sale:", err);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// PURCHASES & VENDOR PAYMENTS
// ---------------------------------------------------------------------------
function addPurchase(purchaseData) {
  const {
    vendor_id,
    purchase_date,
    total_amount,
    paid_amount,
    payment_status,
    note,
    items
  } = purchaseData || {};

  const vendor = getVendorById(vendor_id);
  if (!vendor) throw new Error("Vendor not found");

  const lineItems = Array.isArray(items) ? items : [];
  if (lineItems.length === 0) throw new Error("Purchase items are required");

  const now = new Date().toISOString();
  const purchaseDate = purchase_date || now;

  let computedTotal = 0;
  lineItems.forEach((item) => {
    const quantity = Number(item.quantity);
    const price = Number(item.purchase_price) || 0;
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Invalid purchase quantity");
    }
    computedTotal += quantity * price;
  });

  const totalAmount = total_amount !== undefined && total_amount !== null
    ? Number(total_amount) || 0
    : computedTotal;

  const paidAmount = Number(paid_amount) || 0;
  if (totalAmount < 0 || paidAmount < 0 || paidAmount > totalAmount) {
    throw new Error("Invalid purchase amounts");
  }

  const status = payment_status
    || (paidAmount >= totalAmount && totalAmount > 0
      ? "paid"
      : paidAmount > 0
        ? "partial"
        : "unpaid");

  const insertPurchase = db.prepare(`
    INSERT INTO purchases (vendor_id, purchase_date, total_amount, paid_amount, payment_status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, purchase_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateStock = db.prepare(`UPDATE products SET quantity = quantity + ? WHERE id = ?`);
  const updatePurchasePrice = db.prepare(`UPDATE products SET purchase_price = ? WHERE id = ?`);
  const insertPayment = db.prepare(`
    INSERT INTO vendor_payments (vendor_id, purchase_id, amount, payment_date, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    db.prepare("BEGIN TRANSACTION").run();
    const purchaseResult = insertPurchase.run(
      vendor_id,
      purchaseDate,
      totalAmount,
      paidAmount,
      status,
      note || null,
      now
    );

    lineItems.forEach((item) => {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      const price = Number(item.purchase_price) || 0;
      if (!productId || !Number.isInteger(quantity) || quantity <= 0 || price < 0) {
        throw new Error("Invalid purchase item");
      }

      const product = db.prepare("SELECT id, name FROM products WHERE id = ?").get(productId);
      if (!product) {
        throw new Error("Product not found for purchase item");
      }

      insertItem.run(
        purchaseResult.lastInsertRowid,
        productId,
        product.name,
        quantity,
        price,
        quantity * price
      );

      updateStock.run(quantity, productId);
      updatePurchasePrice.run(price, productId);
    });

    if (paidAmount > 0) {
      insertPayment.run(
        vendor_id,
        purchaseResult.lastInsertRowid,
        paidAmount,
        purchaseDate,
        "Purchase payment",
        now
      );
    }

    db.prepare("COMMIT").run();
    return { success: true, purchase_id: purchaseResult.lastInsertRowid };
  } catch (err) {
    db.prepare("ROLLBACK").run();
    throw err;
  }
}

function getPurchases() {
  return db.prepare(`
    SELECT p.*,
           v.name AS vendor_name,
           COALESCE(SUM(pi.quantity), 0) AS total_items
    FROM purchases p
    LEFT JOIN vendors v ON p.vendor_id = v.id
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    GROUP BY p.id
    ORDER BY p.purchase_date DESC
  `).all();
}

function getPurchaseItems(purchaseId) {
  return db.prepare(`
    SELECT * FROM purchase_items
    WHERE purchase_id = ?
    ORDER BY id ASC
  `).all(purchaseId);
}

function addVendorPayment(paymentData) {
  const { vendor_id, amount, note, payment_date, purchase_id } = paymentData;
  const vendor = getVendorById(vendor_id);
  if (!vendor) throw new Error("Vendor not found");

  const paymentAmount = Number(amount) || 0;
  if (paymentAmount <= 0) throw new Error("Invalid payment amount");

  db.prepare(`
    INSERT INTO vendor_payments (vendor_id, purchase_id, amount, payment_date, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    vendor_id,
    purchase_id || null,
    paymentAmount,
    payment_date || new Date().toISOString(),
    note || "Payment",
    new Date().toISOString()
  );

  return { success: true };
}

function getCreditors() {
  return db.prepare(`
    SELECT *
    FROM (
      ${vendorBalanceQuery}
    )
    WHERE balance > 0
    ORDER BY balance DESC
  `).all();
}

// ---------------------------------------------------------------------------
// SHOP SETTINGS FUNCTIONS
// ---------------------------------------------------------------------------
function getShopSettings() {
  return db.prepare("SELECT * FROM shop_settings WHERE id = 1").get();
}

function saveShopSettings(settings) {
  const existing = getShopSettings();

  if (existing) {
    db.prepare(`
      UPDATE shop_settings
      SET shop_name = ?, logo = ?, address = ?, phone = ?, footer_note = ?,
          currency = ?, invoice_prefix = ?, credit_limit_behavior = ?,
          auto_backup = ?, auto_backup_path = ?, backup_retention = ?
      WHERE id = 1
    `).run(
      settings.shop_name || "POS",
      settings.logo || "",
      settings.address || "",
      settings.phone || "",
      settings.footer_note || "",
      settings.currency || "Rs.",
      settings.invoice_prefix || "INV-",
      settings.credit_limit_behavior || "warning",
      settings.auto_backup ? 1 : 0,
      settings.auto_backup_path || "",
      Number(settings.backup_retention) || 7
    );
  } else {
    db.prepare(`
      INSERT INTO shop_settings (
        id, shop_name, logo, address, phone, footer_note,
        currency, invoice_prefix, credit_limit_behavior, auto_backup,
        auto_backup_path, backup_retention
      )
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      settings.shop_name || "POS",
      settings.logo || "",
      settings.address || "",
      settings.phone || "",
      settings.footer_note || "",
      settings.currency || "Rs.",
      settings.invoice_prefix || "INV-",
      settings.credit_limit_behavior || "warning",
      settings.auto_backup ? 1 : 0,
      settings.auto_backup_path || "",
      Number(settings.backup_retention) || 7
    );
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
module.exports = {
  db,
  dbPath,
  appDataPath,
  loginAdmin,
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesForExport,
  getProductsForExport,
  getCategoryById,
  upsertCategoryByName,
  upsertProductFromImport,
  addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  getProductByBarcodeOrName,
  saveSale,
  getSales,
  getSaleDetails,
  getAllSales,
  getSalesByDateRange,
  getSalesCategoryBreakdown,
  registerCashier,
  loginCashier,
  getAllCashiers,
  deleteCashier,
  addVendor,
  getVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  getVendorHistory,
  addPurchase,
  getPurchases,
  getPurchaseItems,
  addVendorPayment,
  getCreditors,
  getShopSettings,
  saveShopSettings,
  deleteSale,
  // Khata / Customer Exports
  checkDuplicatePhone,
  getCustomers,
  getCustomerById,
  addCustomer,
  updateCustomer,
  deactivateCustomer,
  deleteCustomer,
  getCustomerLedger,
  addCustomerPayment,
  adjustCustomerBalance,
  getKhataSummary,
  getOutstandingDues,
  importKhataCustomers,
  // Audit Log Exports
  addAuditLog,
  getAuditLogs,
  // Admin Security & Password Recovery
  changeAdminPassword,
  setAdminRecoveryPin,
  getAdminSecurityStatus,
  resetAdminPasswordWithPin
};
