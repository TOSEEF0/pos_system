// electron/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // ---------------- ADMIN + CASHIER ----------------
  loginAdmin: (username, password) =>
    ipcRenderer.invoke("login-admin", { username, password }),

  changeAdminPassword: (data) =>
    ipcRenderer.invoke("change-admin-password", data),

  setAdminRecoveryPin: (data) =>
    ipcRenderer.invoke("set-admin-recovery-pin", data),

  getAdminSecurityStatus: () =>
    ipcRenderer.invoke("get-admin-security-status"),

  resetAdminPasswordWithPin: (data) =>
    ipcRenderer.invoke("reset-admin-password-with-pin", data),

  registerCashier: (data) =>
    ipcRenderer.invoke("register-cashier", data),

  loginCashier: (data) =>
    ipcRenderer.invoke("login-cashier", data),

  getCashiers: () =>
    ipcRenderer.invoke("get-cashiers"),

  deleteCashier: (id) =>
    ipcRenderer.invoke("delete-cashier", id),

  // ---------------- CATEGORIES ----------------
  getCategories: () => ipcRenderer.invoke("get-categories"),
  addCategory: (name) => ipcRenderer.invoke("add-category", name),
  updateCategory: (id, name) => ipcRenderer.invoke("update-category", id, name),
  deleteCategory: (id) => ipcRenderer.invoke("delete-category", id),

  // ---------------- PRODUCTS ----------------
  getProducts: () => ipcRenderer.invoke("get-products"),
  addProduct: (product) => ipcRenderer.invoke("add-product", product),
  updateProduct: (product) => ipcRenderer.invoke("update-product", product),
  deleteProduct: (id) => ipcRenderer.invoke("delete-product", id),
  getProduct: (input) => ipcRenderer.invoke("get-product", input),

  // ---------------- SALES ----------------
  saveSale: (sale) => ipcRenderer.invoke("save-sale", sale),
  getSalesRange: (range) => ipcRenderer.invoke("get-sales-range", range),
  getAllSales: () => ipcRenderer.invoke("get-all-sales"),
  getSalesCategoryBreakdown: (range) => ipcRenderer.invoke("get-sales-category-breakdown", range),
  getSaleDetails: (saleId) => ipcRenderer.invoke("get-sale-details", saleId),
  deleteSale: (saleId) => ipcRenderer.invoke("delete-sale", saleId),
  printReceipt: (receiptData) => ipcRenderer.invoke("print-receipt", receiptData),

  // ---------------- VENDORS ----------------
  addVendor: (vendor) => ipcRenderer.invoke("add-vendor", vendor),
  getVendors: () => ipcRenderer.invoke("get-vendors"),
  getVendorById: (id) => ipcRenderer.invoke("get-vendor-by-id", id),
  updateVendor: (vendor) => ipcRenderer.invoke("update-vendor", vendor),
  deleteVendor: (id) => ipcRenderer.invoke("delete-vendor", id),
  getVendorHistory: (id) => ipcRenderer.invoke("get-vendor-history", id),
  addVendorPayment: (paymentData) => ipcRenderer.invoke("add-vendor-payment", paymentData),

  // ---------------- PURCHASES ----------------
  addPurchase: (purchase) => ipcRenderer.invoke("add-purchase", purchase),
  getPurchases: () => ipcRenderer.invoke("get-purchases"),
  getPurchaseItems: (purchaseId) => ipcRenderer.invoke("get-purchase-items", purchaseId),

  // ---------------- CREDITORS (VENDORS DUE) ----------------
  getCreditors: () => ipcRenderer.invoke("get-creditors"),

  // ---------------- DIGITAL KHATA / CUSTOMERS ----------------
  getCustomers: (opts) => ipcRenderer.invoke("get-customers", opts),
  getCustomerById: (id) => ipcRenderer.invoke("get-customer-by-id", id),
  checkDuplicatePhone: (phone, excludeId) => ipcRenderer.invoke("check-duplicate-phone", phone, excludeId),
  addCustomer: (data) => ipcRenderer.invoke("add-customer", data),
  updateCustomer: (data) => ipcRenderer.invoke("update-customer", data),
  deactivateCustomer: (id) => ipcRenderer.invoke("deactivate-customer", id),
  deleteCustomer: (id) => ipcRenderer.invoke("delete-customer", id),
  getCustomerLedger: (customerId) => ipcRenderer.invoke("get-customer-ledger", customerId),
  addCustomerPayment: (paymentData) => ipcRenderer.invoke("add-customer-payment", paymentData),
  adjustCustomerBalance: (adjData) => ipcRenderer.invoke("adjust-customer-balance", adjData),
  getKhataSummary: () => ipcRenderer.invoke("get-khata-summary"),
  getOutstandingDues: (sort) => ipcRenderer.invoke("get-outstanding-dues", sort),
  importKhataData: () => ipcRenderer.invoke("import-khata-data"),
  exportCustomersData: () => ipcRenderer.invoke("export-customers-data"),

  // ---------------- AUDIT LOGS ----------------
  getAuditLogs: (limit) => ipcRenderer.invoke("get-audit-logs", limit),

  // ---------------- BACKUP & RESTORE ----------------
  backupDatabase: () => ipcRenderer.invoke("backup-database"),
  restoreDatabase: () => ipcRenderer.invoke("restore-database"),

  // ---------------- KHATA PRINTING ----------------
  printPaymentReceipt: (data) => ipcRenderer.invoke("print-payment-receipt", data),
  printCustomerStatement: (data) => ipcRenderer.invoke("print-customer-statement", data),

  // ---------------- SHOP SETTINGS & DATA ----------------
  getShopSettings: () => ipcRenderer.invoke("get-shop-settings"),
  saveShopSettings: (settings) => ipcRenderer.invoke("save-shop-settings", settings),
  exportShopData: () => ipcRenderer.invoke("export-shop-data"),
  importShopData: () => ipcRenderer.invoke("import-shop-data"),

  // ---------------- LICENSING & TRIAL SYSTEM ----------------
  getLicenseStatus: () => ipcRenderer.invoke("license:get-status"),
  registerTrial: () => ipcRenderer.invoke("license:register-trial"),
  activateLicense: (data) => ipcRenderer.invoke("license:activate", data),
  verifyLicense: () => ipcRenderer.invoke("license:verify"),
  emergencyBackup: () => ipcRenderer.invoke("license:emergency-backup"),
  license: {
    getStatus: () => ipcRenderer.invoke("license:get-status"),
    registerTrial: () => ipcRenderer.invoke("license:register-trial"),
    activate: (licenseKey, customerName) => ipcRenderer.invoke("license:activate", { licenseKey, customerName }),
    verify: () => ipcRenderer.invoke("license:verify"),
    emergencyBackup: () => ipcRenderer.invoke("license:emergency-backup")
  },

  // ---------------- ZOOM & DISPLAY CONTROLS ----------------
  zoomReset: () => ipcRenderer.invoke("zoom-reset"),
  zoomIn: () => ipcRenderer.invoke("zoom-in"),
  zoomOut: () => ipcRenderer.invoke("zoom-out"),
  getZoomFactor: () => ipcRenderer.invoke("get-zoom-factor")
});

contextBridge.exposeInMainWorld("electronAPI", {
  exportShopData: () => ipcRenderer.invoke("export-shop-data"),
  importShopData: () => ipcRenderer.invoke("import-shop-data"),
  importKhataData: () => ipcRenderer.invoke("import-khata-data"),
  exportCustomersData: () => ipcRenderer.invoke("export-customers-data"),
  backupDatabase: () => ipcRenderer.invoke("backup-database"),
  restoreDatabase: () => ipcRenderer.invoke("restore-database")
});

