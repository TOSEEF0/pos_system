// electron/main.js
const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");
const { parse } = require("csv-parse/sync");

// Disable hardware acceleration to eliminate Windows D3D / GPU input freezes, typing lag, and caret stalls
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling,MediaSessionService");
app.commandLine.appendSwitch("disable-gpu-process-crash-limit");

// ---- IMPORT DATABASE FUNCTIONS ----
const {
  db,
  dbPath,
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
  getAllSales,
  getSalesByDateRange,
  getSalesCategoryBreakdown,
  getSaleDetails,
  deleteSale,
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
  addVendorPayment,
  getCreditors,
  addPurchase,
  getPurchases,
  getPurchaseItems,
  getShopSettings,
  saveShopSettings,
  // Khata / Customer Functions
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
  addAuditLog,
  getAuditLogs,
  changeAdminPassword,
  setAdminRecoveryPin,
  getAdminSecurityStatus,
  resetAdminPasswordWithPin
} = require("./database");

// ---- IMPORT LICENSING CONTROLLER ----
const { licenseManager, LicenseState } = require("./licensing/licenseManager");

function guardOperation() {
  const check = licenseManager.canOperate();
  if (!check.allowed) {
    throw new Error(check.message);
  }
}

const isDev = !app.isPackaged;
let mainWindow = null;

// --------------------------------------------------
// CREATE MAIN WINDOW
// --------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Aaj Cash & Carry POS",
    width: 1280,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1.0
    },
  });

  // Always reset zoom factor to 1.0 (100%) on load to prevent persisted negative zoom levels
  const resetWindowZoom = () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.setZoomLevel(0);
      mainWindow.webContents.setZoomFactor(1.0);
      mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    }
  };

  mainWindow.webContents.on("did-finish-load", resetWindowZoom);
  mainWindow.webContents.on("dom-ready", resetWindowZoom);

  // Keyboard zoom control shortcuts (Ctrl+0 to reset, Ctrl+= to zoom in, Ctrl+- to zoom out)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && !input.alt && !input.meta) {
      if (input.key === "0" || input.key === "Num0" || input.code === "Digit0" || input.code === "Numpad0") {
        mainWindow.webContents.setZoomLevel(0);
        mainWindow.webContents.setZoomFactor(1.0);
        event.preventDefault();
      } else if (
        input.key === "=" ||
        input.key === "+" ||
        input.key === "Add" ||
        input.code === "Equal" ||
        input.code === "NumpadAdd"
      ) {
        const current = mainWindow.webContents.getZoomFactor();
        const next = Math.min(Math.round((current + 0.1) * 10) / 10, 2.0);
        mainWindow.webContents.setZoomFactor(next);
        event.preventDefault();
      } else if (
        input.key === "-" ||
        input.key === "_" ||
        input.key === "Subtract" ||
        input.code === "Minus" ||
        input.code === "NumpadSubtract"
      ) {
        const current = mainWindow.webContents.getZoomFactor();
        const next = Math.max(Math.round((current - 0.1) * 10) / 10, 0.7);
        mainWindow.webContents.setZoomFactor(next);
        event.preventDefault();
      }
    }
  });

  const csp = isDev
    ? [
        "default-src 'self' http://localhost:5173",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
        "style-src 'self' 'unsafe-inline' http://localhost:5173",
        "img-src 'self' data: blob: http://localhost:5173",
        "font-src 'self' data: http://localhost:5173",
        "connect-src 'self' ws://localhost:5173 http://localhost:5173 http://localhost:4000 http://127.0.0.1:4000"
      ].join("; ")
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self' http://localhost:4000 http://127.0.0.1:4000"
      ].join("; ");

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    responseHeaders["Content-Security-Policy"] = [csp];
    callback({ responseHeaders });
  });

  // Application menu with View -> Actual Size (Ctrl+0), Zoom In, Zoom Out
  const menuTemplate = [
    {
      label: "File",
      submenu: [
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Reset Zoom (100%)",
          accelerator: "CmdOrCtrl+0",
          click: () => resetWindowZoom()
        },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const current = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.min(Math.round((current + 0.1) * 10) / 10, 2.0));
            }
          }
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const current = mainWindow.webContents.getZoomFactor();
              mainWindow.webContents.setZoomFactor(Math.max(Math.round((current - 0.1) * 10) / 10, 0.7));
            }
          }
        },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Reset Zoom to 100% (Ctrl+0)",
          click: () => resetWindowZoom()
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    const indexPath = path.join(__dirname, "../frontend/dist/index.html");
    const fallbackPath = path.join(process.resourcesPath, "frontend", "dist", "index.html");
    mainWindow.loadFile(fs.existsSync(indexPath) ? indexPath : fallbackPath);
  }
}

// --------------------------------------------------
// EXCEL / CSV IMPORT & EXPORT
// --------------------------------------------------
const PRODUCT_KEY_MAP = {
  "barcode": "barcode",
  "bar code": "barcode",
  "sku": "barcode",
  "name": "name",
  "product name": "name",
  "product": "name",
  "category": "category_name",
  "category name": "category_name",
  "category_name": "category_name",
  "category id": "category_id",
  "category_id": "category_id",
  "qty": "quantity",
  "quantity": "quantity",
  "purchase price": "purchase_price",
  "purchase_price": "purchase_price",
  "cost": "purchase_price",
  "selling price": "selling_price",
  "selling_price": "selling_price",
  "price": "selling_price",
  "unit": "unit",
  "uom": "unit",
  "description": "description",
  "desc": "description"
};

const CATEGORY_KEY_MAP = {
  "id": "id",
  "name": "name",
  "category": "name",
  "category name": "name"
};

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRow(row, map) {
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const mapped = map[normalizeKey(key)];
    if (!mapped) return;
    if (value === undefined || value === null || value === "") return;
    normalized[mapped] = value;
  });
  return normalized;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInteger(value) {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
  return num;
}

async function exportShopData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultPath = path.join(
    app.getPath("documents"),
    `shop-data-${timestamp}.xlsx`
  );

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export Shop Data",
    defaultPath,
    filters: [{ name: "Excel Files", extensions: ["xlsx"] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const categories = getCategoriesForExport();
  const products = getProductsForExport();

  const categoriesSheet = xlsx.utils.json_to_sheet(
    categories.map((c) => ({
      id: c.id,
      name: c.name
    }))
  );

  const productsSheet = xlsx.utils.json_to_sheet(
    products.map((p) => ({
      barcode: p.barcode || "",
      name: p.name || "",
      category_id: p.category_id ?? "",
      category_name: p.category_name || "",
      quantity: p.quantity ?? 0,
      purchase_price: p.purchase_price ?? 0,
      selling_price: p.selling_price ?? 0,
      description: p.description || ""
    }))
  );

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, categoriesSheet, "Categories");
  xlsx.utils.book_append_sheet(workbook, productsSheet, "Products");

  xlsx.writeFile(workbook, filePath);
  addAuditLog("admin", "EXPORT_SHOP_DATA", `Exported shop data to ${filePath}`);

  return { success: true, filePath };
}

async function importShopData() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Import Shop Data",
    properties: ["openFile"],
    filters: [
      { name: "Excel or CSV", extensions: ["xlsx", "csv"] }
    ]
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = filePaths[0];
  const ext = path.extname(filePath).toLowerCase();

  let categoryRows = [];
  let productRows = [];

  if (ext === ".xlsx") {
    const workbook = xlsx.readFile(filePath);
    const categorySheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "categories"
    );
    const productSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase() === "products"
    );

    if (categorySheetName) {
      categoryRows = xlsx.utils.sheet_to_json(
        workbook.Sheets[categorySheetName],
        { defval: "" }
      );
    }

    if (productSheetName) {
      productRows = xlsx.utils.sheet_to_json(
        workbook.Sheets[productSheetName],
        { defval: "" }
      );
    } else if (workbook.SheetNames.length > 0) {
      productRows = xlsx.utils.sheet_to_json(
        workbook.Sheets[workbook.SheetNames[0]],
        { defval: "" }
      );
    }
  } else {
    const content = fs.readFileSync(filePath, "utf8");
    productRows = parse(content, { columns: true, skip_empty_lines: true });
  }

  let createdCategories = 0;
  let createdProducts = 0;
  let updatedProducts = 0;
  let skippedProducts = 0;

  const categoryCache = new Map();

  for (const row of categoryRows) {
    const normalized = normalizeRow(row, CATEGORY_KEY_MAP);
    const name = normalized.name ? String(normalized.name).trim() : "";
    if (!name) continue;

    const result = upsertCategoryByName(name);
    if (result.created) createdCategories += 1;
    if (result.id) categoryCache.set(name.toLowerCase(), result.id);
  }

  for (const row of productRows) {
    const normalized = normalizeRow(row, PRODUCT_KEY_MAP);
    const name = normalized.name ? String(normalized.name).trim() : "";
    if (!name) {
      skippedProducts += 1;
      continue;
    }

    const quantity = toNumber(normalized.quantity);
    if (quantity === null || quantity < 0) {
      skippedProducts += 1;
      continue;
    }

    const purchasePrice = toNumber(normalized.purchase_price);
    const sellingPrice = toNumber(normalized.selling_price);

    if (purchasePrice === null || sellingPrice === null || purchasePrice < 0 || sellingPrice < 0) {
      skippedProducts += 1;
      continue;
    }

    let categoryId = null;
    const categoryIdValue = toInteger(normalized.category_id);
    if (categoryIdValue !== null) {
      const existingCategory = getCategoryById(categoryIdValue);
      if (existingCategory) categoryId = existingCategory.id;
    }

    const categoryName = normalized.category_name
      ? String(normalized.category_name).trim()
      : "";

    if (!categoryId && categoryName) {
      const cacheKey = categoryName.toLowerCase();
      if (categoryCache.has(cacheKey)) {
        categoryId = categoryCache.get(cacheKey);
      } else {
        const result = upsertCategoryByName(categoryName);
        if (result.created) createdCategories += 1;
        categoryId = result.id;
        if (categoryId) categoryCache.set(cacheKey, categoryId);
      }
    }

    const importResult = upsertProductFromImport({
      barcode: normalized.barcode ? String(normalized.barcode).trim() : null,
      name,
      category_id: categoryId,
      quantity,
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      unit: normalized.unit ? String(normalized.unit).trim().toLowerCase() : "pcs",
      description: normalized.description ? String(normalized.description).trim() : ""
    });

    if (importResult.created) createdProducts += 1;
    if (importResult.updated) updatedProducts += 1;
  }

  addAuditLog("admin", "IMPORT_SHOP_DATA", `Imported ${createdProducts} products, updated ${updatedProducts}, skipped ${skippedProducts}`);

  return {
    success: true,
    filePath,
    summary: {
      createdCategories,
      createdProducts,
      updatedProducts,
      skippedProducts
    }
  };
}

// --------------------------------------------------
// PAPER KHATA (CUSTOMER REGISTER) IMPORT & EXPORT
// --------------------------------------------------
async function importKhataData() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Import Customers / Paper Khata (Excel / CSV)",
    properties: ["openFile"],
    filters: [{ name: "Excel or CSV", extensions: ["xlsx", "xls", "csv"] }]
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  let rows = [];

  try {
    if (ext === ".csv") {
      const content = fs.readFileSync(filePath, "utf8");
      rows = parse(content, { columns: true, skip_empty_lines: true });
    } else {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
    }

    const result = importKhataCustomers(rows, "admin");
    return { success: true, filePath, ...result };
  } catch (err) {
    console.error("Khata import error:", err);
    return { success: false, error: err.message };
  }
}

async function exportCustomersData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultPath = path.join(
    app.getPath("documents"),
    `customers-khata-${timestamp}.xlsx`
  );

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export Customers Ledger (Excel)",
    defaultPath,
    filters: [{ name: "Excel Files", extensions: ["xlsx"] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const customers = getCustomers({ filter: "all" });
  const sheetData = customers.map((c) => ({
    "Customer ID": c.id,
    "Name": c.name,
    "Phone": c.phone || "",
    "Alternate Phone": c.alternate_phone || "",
    "Address": c.address || "",
    "Opening Balance": c.opening_balance || 0,
    "Total Credit Sales": c.total_credit || 0,
    "Total Payments Paid": c.total_paid || 0,
    "Current Outstanding Due": c.current_due || 0,
    "Credit Limit": c.credit_limit || 0,
    "Status": c.current_due > 0 ? "DUES" : "CLEARED",
    "Last Transaction": c.last_transaction_date ? new Date(c.last_transaction_date).toLocaleString() : "",
    "Notes": c.notes || ""
  }));

  const sheet = xlsx.utils.json_to_sheet(sheetData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Customers Khata");
  xlsx.writeFile(workbook, filePath);

  addAuditLog("admin", "EXPORT_CUSTOMERS", `Exported ${customers.length} customer records to ${filePath}`);
  return { success: true, filePath };
}

// --------------------------------------------------
// SAFE DATABASE BACKUP & RESTORE
// --------------------------------------------------
async function backupDatabase() {
  const timestamp = new Date().toISOString().slice(0, 10);
  const defaultPath = path.join(
    app.getPath("documents"),
    `Aaj_Cash_Carry_Backup_${timestamp}.db`
  );

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Backup POS Database (USB / Local Disk)",
    defaultPath,
    filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  try {
    // Checkpoint WAL journal before backing up
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch (e) {}

    fs.copyFileSync(dbPath, filePath);
    addAuditLog("admin", "BACKUP_CREATED", `Created database backup at ${filePath}`);
    return { success: true, filePath };
  } catch (err) {
    console.error("Backup error:", err);
    return { success: false, error: err.message };
  }
}

async function restoreDatabase() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select Database Backup to Restore (.db)",
    properties: ["openFile"],
    filters: [{ name: "SQLite Database", extensions: ["db", "sqlite"] }]
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    return { canceled: true };
  }

  const backupFilePath = filePaths[0];

  try {
    // Verify file header is valid SQLite database
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(backupFilePath, "r");
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const header = buffer.toString("utf8", 0, 15);
    if (!header.startsWith("SQLite format 3")) {
      return { success: false, error: "The selected file is not a valid SQLite database file." };
    }

    // Create a safety backup of current database first
    const safetyBackup = `${dbPath}.safety_${Date.now()}`;
    fs.copyFileSync(dbPath, safetyBackup);

    // Overwrite database file
    fs.copyFileSync(backupFilePath, dbPath);
    addAuditLog("admin", "BACKUP_RESTORED", `Restored database from ${backupFilePath}`);

    return {
      success: true,
      message: "Database restored successfully! Application will now reload.",
      reloadRequired: true
    };
  } catch (err) {
    console.error("Restore error:", err);
    return { success: false, error: err.message };
  }
}

// --------------------------------------------------
// IPC HANDLERS REGISTRATION
// --------------------------------------------------
// Authentication
ipcMain.handle("login-admin", async (e, d) => loginAdmin(d.username, d.password));
ipcMain.handle("change-admin-password", async (e, d) => changeAdminPassword(d.currentPassword, d.newPassword));
ipcMain.handle("set-admin-recovery-pin", async (e, d) => setAdminRecoveryPin(d.currentPassword, d.newPin));
ipcMain.handle("get-admin-security-status", async () => getAdminSecurityStatus());
ipcMain.handle("reset-admin-password-with-pin", async (e, d) => resetAdminPasswordWithPin(d.username, d.recoveryPin, d.newPassword));
ipcMain.handle("register-cashier", async (e, d) => registerCashier(d.username, d.password));
ipcMain.handle("login-cashier", async (e, d) => loginCashier(d.username, d.password));
ipcMain.handle("get-cashiers", async () => getAllCashiers());
ipcMain.handle("delete-cashier", async (e, id) => deleteCashier(id));

// Categories & Products
ipcMain.handle("get-categories", async () => getCategories());
ipcMain.handle("add-category", async (e, n) => { guardOperation(); return addCategory(n); });
ipcMain.handle("update-category", async (e, id, n) => { guardOperation(); return updateCategory(id, n); });
ipcMain.handle("delete-category", async (e, id) => { guardOperation(); return deleteCategory(id); });
ipcMain.handle("get-products", async () => getProducts());
ipcMain.handle("add-product", async (e, p) => { guardOperation(); return addProduct(p); });
ipcMain.handle("update-product", async (e, p) => { guardOperation(); return updateProduct(p); });
ipcMain.handle("delete-product", async (e, id) => { guardOperation(); return deleteProduct(id); });
ipcMain.handle("get-product", async (e, input) => getProductByBarcodeOrName(input));

// Sales
ipcMain.handle("save-sale", async (e, sale) => { guardOperation(); return saveSale(sale); });
ipcMain.handle("get-all-sales", async () => getAllSales());
ipcMain.handle("get-sales-range", async (e, range) => getSalesByDateRange(range.start, range.end));
ipcMain.handle("get-sales-category-breakdown", async (e, range) => {
  if (range && range.start && range.end) {
    return getSalesCategoryBreakdown(range.start, range.end);
  }
  return getSalesCategoryBreakdown();
});
ipcMain.handle("get-sale-details", async (e, saleId) => getSaleDetails(saleId));
ipcMain.handle("delete-sale", async (e, saleId) => { guardOperation(); return deleteSale(saleId); });

// Vendors & Purchases
ipcMain.handle("add-vendor", async (e, v) => { guardOperation(); return addVendor(v); });
ipcMain.handle("get-vendors", async () => getVendors());
ipcMain.handle("get-vendor-by-id", async (e, id) => getVendorById(id));
ipcMain.handle("update-vendor", async (e, v) => { guardOperation(); return updateVendor(v); });
ipcMain.handle("delete-vendor", async (e, id) => { guardOperation(); return deleteVendor(id); });
ipcMain.handle("get-vendor-history", async (e, id) => getVendorHistory(id));
ipcMain.handle("add-vendor-payment", async (e, d) => { guardOperation(); return addVendorPayment(d); });
ipcMain.handle("get-creditors", async () => getCreditors());
ipcMain.handle("add-purchase", async (e, data) => { guardOperation(); return addPurchase(data); });
ipcMain.handle("get-purchases", async () => getPurchases());
ipcMain.handle("get-purchase-items", async (e, id) => getPurchaseItems(id));

// Digital Khata / Customers
ipcMain.handle("get-customers", async (e, opts) => getCustomers(opts));
ipcMain.handle("get-customer-by-id", async (e, id) => getCustomerById(id));
ipcMain.handle("check-duplicate-phone", async (e, phone, excludeId) => checkDuplicatePhone(phone, excludeId));
ipcMain.handle("add-customer", async (e, data) => { guardOperation(); return addCustomer(data); });
ipcMain.handle("update-customer", async (e, data) => { guardOperation(); return updateCustomer(data); });
ipcMain.handle("deactivate-customer", async (e, id) => { guardOperation(); return deactivateCustomer(id); });
ipcMain.handle("delete-customer", async (e, id) => { guardOperation(); return deleteCustomer(id); });
ipcMain.handle("get-customer-ledger", async (e, customerId) => getCustomerLedger(customerId));
ipcMain.handle("add-customer-payment", async (e, paymentData) => { guardOperation(); return addCustomerPayment(paymentData); });
ipcMain.handle("adjust-customer-balance", async (e, adjData) => { guardOperation(); return adjustCustomerBalance(adjData); });
ipcMain.handle("get-khata-summary", async () => getKhataSummary());
ipcMain.handle("get-outstanding-dues", async (e, sort) => getOutstandingDues(sort));
ipcMain.handle("import-khata-data", async () => { guardOperation(); return importKhataData(); });
ipcMain.handle("export-customers-data", async () => exportCustomersData());

// Audit Logs
ipcMain.handle("get-audit-logs", async (e, limit) => getAuditLogs(limit));

// Backup & Restore (ALWAYS ALLOWED - Guaranteed local data protection)
ipcMain.handle("backup-database", async () => backupDatabase());
ipcMain.handle("restore-database", async () => restoreDatabase());

// Settings & Export/Import
ipcMain.handle("get-shop-settings", async () => getShopSettings());
ipcMain.handle("save-shop-settings", async (e, s) => { guardOperation(); return saveShopSettings(s); });
ipcMain.handle("export-shop-data", async () => exportShopData());
ipcMain.handle("import-shop-data", async () => { guardOperation(); return importShopData(); });

// --------------------------------------------------
// LICENSING & TRIAL IPC HANDLERS
// --------------------------------------------------
ipcMain.handle("license:get-status", async () => {
  return licenseManager.getStatus();
});
ipcMain.handle("license:register-trial", async () => {
  return await licenseManager.registerTrial();
});
ipcMain.handle("license:activate", async (e, payload) => {
  const licenseKey = typeof payload === "string" ? payload : (payload?.licenseKey || "");
  const customerName = typeof payload === "object" ? (payload?.customerName || "") : "";
  return await licenseManager.activateLicense(licenseKey, customerName);
});
ipcMain.handle("license:verify", async () => {
  return await licenseManager.verifyWithServer();
});
ipcMain.handle("license:emergency-backup", async () => {
  return await backupDatabase();
});

// --------------------------------------------------
// PRINT UTILITIES & PREVIEW WINDOW
// --------------------------------------------------
function renderAndPrint(html, title = "Receipt Preview", width = 440, height = 680) {
  try {
    const tempDir = app.getPath("temp");
    const tempFile = path.join(tempDir, `pos_print_${Date.now()}_${Math.floor(Math.random() * 10000)}.html`);
    fs.writeFileSync(tempFile, html, "utf8");

    const win = new BrowserWindow({
      width,
      height,
      autoHideMenuBar: true,
      title,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    win.loadFile(tempFile);

    win.webContents.on("did-finish-load", () => {
      win.show();
      // Auto-trigger native Windows print dialog
      win.webContents.print({ silent: false }, (success, failureReason) => {
        if (!success && failureReason !== "cancelled") {
          console.log("Print status:", failureReason);
        }
      });
      setTimeout(() => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}
      }, 180000);
    });

    return { success: true };
  } catch (err) {
    console.error("renderAndPrint error:", err);
    return { success: false, error: err.message };
  }
}

// --------------------------------------------------
// PRINT RECEIPT (ENHANCED FOR CASH & CREDIT KHATA)
// --------------------------------------------------
ipcMain.handle("print-receipt", async (event, receipt) => {
  try {
    const settings = getShopSettings() || {
      shop_name: "Aaj Cash & Carry",
      address: "",
      phone: "",
      footer_note: "",
      currency: "Rs."
    };

    const currency = settings.currency || "Rs.";
    const isCredit = receipt.payment_type === "credit" || receipt.is_credit;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt Preview</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; color: #111; }
            .center { text-align: center; }
            .right { text-align: right; }
            hr { border: none; border-top: 1px dashed #444; margin: 6px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            td, th { padding: 3px 0; }
            .badge { display: inline-block; padding: 2px 6px; border: 1px solid #111; font-weight: bold; margin-top: 4px; }
            .footer { margin-top: 12px; font-size: 10px; text-align: center; color: #555; }
            button { width: 100%; padding: 8px; margin-top: 14px; font-size: 14px; font-weight: bold; cursor: pointer; background: #2563eb; color: #fff; border: none; border-radius: 6px; }
            @media print {
              button { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>

        <body>
          <div class="center">
            <strong style="font-size: 15px;">${settings.shop_name}</strong><br/>
            ${settings.address ? `${settings.address}<br/>` : ""}
            ${settings.phone ? `Phone: ${settings.phone}<br/>` : ""}
            <div class="badge">${isCredit ? "UDHAAR / CREDIT SALE" : "SALES RECEIPT"}</div><br/>
            <span style="font-size: 10px;">${receipt.date}</span><br/>
            ${receipt.invoice_number ? `<b>Inv #:</b> ${receipt.invoice_number}<br/>` : ""}
            ${receipt.customer ? `<b>Customer:</b> ${receipt.customer}<br/>` : ""}
            ${receipt.customer_phone ? `<b>Phone:</b> ${receipt.customer_phone}<br/>` : ""}
          </div>

          <hr/>

          <table>
            <thead>
              <tr><th style="text-align:left;">Item</th><th class="center">Qty</th><th class="right">Price</th><th class="right">Total</th></tr>
            </thead>
            <tbody>
              ${(receipt.cart || []).map(i => {
                const qtyVal = Number(i.quantity !== undefined ? i.quantity : (i.qty || 1));
                const unitStr = i.unit && i.unit !== "pcs" ? ` ${i.unit}` : "";
                const priceVal = Number(i.price || i.selling_price || 0);
                const lineTotal = Number(i.line_total !== undefined ? i.line_total : (i.total !== undefined ? i.total : qtyVal * priceVal));
                return `
                <tr>
                  <td>${i.name}</td>
                  <td class="center">${qtyVal}${unitStr}</td>
                  <td class="right">${priceVal.toFixed(2)}</td>
                  <td class="right">${lineTotal.toFixed(2)}</td>
                </tr>
              `;
              }).join("")}
            </tbody>
          </table>

          <hr/>

          <table>
            <tr><td class="right">Subtotal:</td><td class="right" style="width: 35%;">${currency} ${Number(receipt.total || 0).toFixed(2)}</td></tr>

            ${
              Number(receipt.discount || 0) > 0
                ? `
                <tr><td class="right">Discount (${receipt.discount}%):</td><td class="right">-${currency} ${Number(receipt.discountAmount || 0).toFixed(2)}</td></tr>
                <tr><td class="right"><b>Net Total:</b></td><td class="right"><b>${currency} ${Number(receipt.discountedTotal || receipt.total).toFixed(2)}</b></td></tr>
                `
                : `<tr><td class="right"><b>Net Total:</b></td><td class="right"><b>${currency} ${Number(receipt.total || 0).toFixed(2)}</b></td></tr>`
            }

            ${
              isCredit
                ? `
                <tr><td class="right">Paid Now:</td><td class="right">${currency} ${Number(receipt.received || 0).toFixed(2)}</td></tr>
                <tr><td class="right">Previous Due:</td><td class="right">${currency} ${Number(receipt.previous_due || 0).toFixed(2)}</td></tr>
                <tr style="border-top: 1px solid #111;"><td class="right"><b>New Balance Due:</b></td><td class="right"><b>${currency} ${Number(receipt.new_due || 0).toFixed(2)}</b></td></tr>
                `
                : `
                <tr><td class="right">Received:</td><td class="right">${currency} ${Number(receipt.received || 0).toFixed(2)}</td></tr>
                <tr><td class="right">Change:</td><td class="right">${currency} ${Number(receipt.change || 0).toFixed(2)}</td></tr>
                `
            }
          </table>

          ${receipt.note ? `<p style="font-size: 10px; margin: 4px 0;"><b>Note:</b> ${receipt.note}</p>` : ""}

          <hr/>
          <div class="footer">
            ${settings.footer_note || "Thank you for your business!"}<br/>
            Offline Digital Khata POS
          </div>

          <button onclick="window.print()">🖨 Print Receipt</button>
        </body>
      </html>
    `;

    return renderAndPrint(html, "Receipt Preview", 440, 680);
  } catch (err) {
    console.error("Print error:", err);
    return { success: false, error: err.message };
  }
});

// --------------------------------------------------
// PRINT CUSTOMER PAYMENT RECEIPT
// --------------------------------------------------
ipcMain.handle("print-payment-receipt", async (event, data) => {
  try {
    const settings = getShopSettings() || {
      shop_name: "Aaj Cash & Carry",
      address: "",
      phone: "",
      footer_note: "",
      currency: "Rs."
    };

    const currency = settings.currency || "Rs.";

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Payment Receipt</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 12px; color: #111; }
            .center { text-align: center; }
            .right { text-align: right; }
            hr { border: none; border-top: 1px dashed #444; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            td { padding: 4px 0; }
            .box { border: 1px solid #111; padding: 6px; margin: 8px 0; text-align: center; }
            .footer { margin-top: 15px; font-size: 10px; text-align: center; color: #555; }
            button { width: 100%; padding: 8px; margin-top: 14px; font-size: 14px; font-weight: bold; cursor: pointer; background: #16a34a; color: #fff; border: none; border-radius: 6px; }
            @media print {
              button { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="center">
            <strong style="font-size: 16px;">${settings.shop_name}</strong><br/>
            ${settings.address ? `${settings.address}<br/>` : ""}
            ${settings.phone ? `Phone: ${settings.phone}<br/>` : ""}
            <div style="font-weight: bold; margin-top: 5px; font-size: 13px;">KHATA PAYMENT RECEIPT</div>
            <div style="font-size: 10px;">Ref: ${data.payment_number}</div>
            <div style="font-size: 10px;">Date: ${new Date(data.date).toLocaleString()}</div>
          </div>

          <hr/>

          <div>
            <b>Customer:</b> ${data.customer_name}<br/>
            ${data.customer_phone ? `<b>Phone:</b> ${data.customer_phone}<br/>` : ""}
            ${data.received_by ? `<b>Received By:</b> ${data.received_by}<br/>` : ""}
            <b>Method:</b> ${(data.payment_method || "cash").toUpperCase()}<br/>
            ${data.note ? `<b>Note:</b> ${data.note}<br/>` : ""}
          </div>

          <div class="box">
            <span style="font-size: 11px;">PAYMENT RECEIVED</span><br/>
            <strong style="font-size: 18px;">${currency} ${Number(data.amount).toFixed(2)}</strong>
          </div>

          <table>
            <tr><td>Previous Due:</td><td class="right">${currency} ${Number(data.previous_due).toFixed(2)}</td></tr>
            <tr><td>Paid Amount:</td><td class="right">-${currency} ${Number(data.amount).toFixed(2)}</td></tr>
            <tr style="border-top: 1px solid #111;">
              <td><b>Remaining Due:</b></td>
              <td class="right"><b>${currency} ${Number(data.remaining_due).toFixed(2)}</b></td>
            </tr>
          </table>

          ${Number(data.remaining_due) === 0 ? `<div class="center" style="font-weight:bold; margin-top:6px; color:#16a34a;">✓ ACCOUNT CLEARED</div>` : ""}

          <hr/>
          <div class="footer">
            ${settings.footer_note || "Thank you for your payment!"}<br/>
            Digital Khata System
          </div>

          <button onclick="window.print()">🖨 Print Payment Receipt</button>
        </body>
      </html>
    `;

    return renderAndPrint(html, "Payment Receipt Preview", 440, 600);
  } catch (err) {
    console.error("Print payment receipt error:", err);
    return { success: false, error: err.message };
  }
});

// --------------------------------------------------
// PRINT CUSTOMER STATEMENT
// --------------------------------------------------
ipcMain.handle("print-customer-statement", async (event, data) => {
  try {
    const settings = getShopSettings() || {
      shop_name: "Aaj Cash & Carry",
      address: "",
      phone: "",
      currency: "Rs."
    };

    const currency = settings.currency || "Rs.";
    const customer = data.customer;
    const ledger = data.ledger || [];

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Customer Ledger Statement - ${customer.name}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #222; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; }
            .shop-title { font-size: 20px; font-weight: bold; color: #1e3a8a; }
            .customer-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f1f5f9; font-weight: bold; }
            .right { text-align: right; }
            .due-badge { font-size: 16px; font-weight: bold; color: ${customer.current_due > 0 ? '#b91c1c' : '#15803d'}; }
            button { padding: 10px 18px; font-size: 14px; font-weight: bold; cursor: pointer; background: #2563eb; color: #fff; border: none; border-radius: 6px; margin-bottom: 15px; }
            @media print {
              button { display: none; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <button onclick="window.print()">🖨 Print Statement</button>

          <div class="header">
            <div>
              <div class="shop-title">${settings.shop_name}</div>
              <div>${settings.address || ""}</div>
              <div>Phone: ${settings.phone || "-"}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 16px; font-weight: bold;">CUSTOMER LEDGER STATEMENT</div>
              <div>Date: ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div class="customer-card">
            <div>
              <div style="font-size: 14px; font-weight: bold;">${customer.name}</div>
              <div>Phone: ${customer.phone || "-"}</div>
              ${customer.address ? `<div>Address: ${customer.address}</div>` : ""}
            </div>
            <div style="text-align: right;">
              <div>Current Outstanding Balance:</div>
              <div class="due-badge">${currency} ${Number(customer.current_due || 0).toLocaleString()}</div>
              <div>Status: ${customer.current_due > 0 ? 'HAS OUTSTANDING DUES' : 'CLEARED'}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 15%;">Date</th>
                <th style="width: 15%;">Type</th>
                <th style="width: 15%;">Ref #</th>
                <th>Note / Details</th>
                <th class="right" style="width: 13%;">Debit (+)</th>
                <th class="right" style="width: 13%;">Credit (-)</th>
                <th class="right" style="width: 14%;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${ledger.map((row) => `
                <tr>
                  <td>${new Date(row.created_at).toLocaleDateString()}</td>
                  <td><b>${row.type_label || row.type}</b></td>
                  <td>${row.reference_id || "-"}</td>
                  <td>${row.note || "-"}</td>
                  <td class="right">${row.debit > 0 ? `${currency} ${Number(row.debit).toFixed(2)}` : "-"}</td>
                  <td class="right">${row.credit > 0 ? `${currency} ${Number(row.credit).toFixed(2)}` : "-"}</td>
                  <td class="right"><b>${currency} ${Number(row.balance_after).toFixed(2)}</b></td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <div style="margin-top: 20px; text-align: right; font-size: 12px;">
            <p>Total Credit: <b>${currency} ${Number(customer.total_credit || 0).toLocaleString()}</b> | Total Payments: <b>${currency} ${Number(customer.total_paid || 0).toLocaleString()}</b></p>
            <p style="font-size: 14px;">Net Outstanding: <b style="color: ${customer.current_due > 0 ? '#b91c1c' : '#15803d'};">${currency} ${Number(customer.current_due || 0).toLocaleString()}</b></p>
          </div>
        </body>
      </html>
    `;

    return renderAndPrint(html, `Statement - ${customer.name}`, 800, 750);
  } catch (err) {
    console.error("Print statement error:", err);
    return { success: false, error: err.message };
  }
});

// --------------------------------------------------
// ZOOM CONTROL IPC HANDLERS
// --------------------------------------------------
ipcMain.handle("zoom-reset", () => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.setZoomLevel(0);
    mainWindow.webContents.setZoomFactor(1.0);
    return { success: true, factor: 1.0 };
  }
  return { success: false, factor: 1.0 };
});

ipcMain.handle("zoom-in", () => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    const current = mainWindow.webContents.getZoomFactor();
    const next = Math.min(Math.round((current + 0.1) * 10) / 10, 2.0);
    mainWindow.webContents.setZoomFactor(next);
    return { success: true, factor: next };
  }
  return { success: false };
});

ipcMain.handle("zoom-out", () => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    const current = mainWindow.webContents.getZoomFactor();
    const next = Math.max(Math.round((current - 0.1) * 10) / 10, 0.7);
    mainWindow.webContents.setZoomFactor(next);
    return { success: true, factor: next };
  }
  return { success: false };
});

ipcMain.handle("get-zoom-factor", () => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    return mainWindow.webContents.getZoomFactor();
  }
  return 1.0;
});

// --------------------------------------------------
// APP EVENTS
// --------------------------------------------------
app.whenReady().then(async () => {
  try {
    await licenseManager.initialize();
  } catch (err) {
    console.error("License initialization warning:", err.message);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

