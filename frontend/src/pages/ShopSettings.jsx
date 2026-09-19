// frontend/src/pages/ShopSettings.jsx
import { useState, useEffect } from "react";

const emptySettings = {
  shop_name: "Aaj Cash & Carry",
  logo: "",
  address: "",
  phone: "",
  footer_note: "Thank you for your business!",
  currency: "Rs.",
  invoice_prefix: "INV-",
  credit_limit_behavior: "warning",
  auto_backup: 0,
  auto_backup_path: "",
  backup_retention: 7
};

export default function ShopSettings({ shopSettings, setShopSettings, licenseStatus, onLicenseUpdated }) {
  const [settings, setSettings] = useState(shopSettings || emptySettings);
  const [toast, setToast] = useState({ show: false, type: "", message: "" });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  // Security & Password Management State
  const [hasRecoveryPin, setHasRecoveryPin] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Recovery PIN State
  const [pinCurrentPassword, setPinCurrentPassword] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Software Licensing State
  const [localLicense, setLocalLicense] = useState(licenseStatus || null);
  const [activationKey, setActivationKey] = useState("");
  const [licenseCustomerName, setLicenseCustomerName] = useState("");
  const [isActivatingLicense, setIsActivatingLicense] = useState(false);
  const [isSyncingLicense, setIsSyncingLicense] = useState(false);
  const [copiedDevId, setCopiedDevId] = useState(false);

  const fetchLicenseData = async () => {
    try {
      const getFn = window.api?.license?.getStatus || window.api?.getLicenseStatus;
      if (getFn) {
        const status = await getFn();
        setLocalLicense(status);
        if (onLicenseUpdated) onLicenseUpdated(status);
      }
    } catch (e) {
      console.error("Could not fetch license data", e);
    }
  };

  useEffect(() => {
    fetchLicenseData();
  }, []);

  const handleActivateFromSettings = async (e) => {
    e.preventDefault();
    const cleanKey = activationKey.trim().toUpperCase();
    if (!cleanKey) {
      showToast("error", "Please enter a valid license activation key.");
      return;
    }
    setIsActivatingLicense(true);
    try {
      const actFn = window.api?.license?.activate || window.api?.activateLicense;
      const res = await actFn({ licenseKey: cleanKey, customerName: licenseCustomerName.trim() });
      if (res && res.success) {
        showToast("success", res.message || "Commercial license activated successfully!");
        setActivationKey("");
        fetchLicenseData();
      } else {
        showToast("error", res?.message || "Invalid or rejected license key.");
      }
    } catch (err) {
      showToast("error", "Activation error: " + err.message);
    } finally {
      setIsActivatingLicense(false);
    }
  };

  const handleSyncWithServer = async () => {
    setIsSyncingLicense(true);
    try {
      const verifyFn = window.api?.license?.verify || window.api?.verifyLicense;
      const status = await verifyFn();
      setLocalLicense(status);
      if (onLicenseUpdated) onLicenseUpdated(status);
      showToast("success", "License verified with authority!");
    } catch (e) {
      showToast("error", "Could not reach server: " + e.message);
    } finally {
      setIsSyncingLicense(false);
    }
  };

  const handleCopyDeviceId = () => {
    if (localLicense?.deviceBinding) {
      navigator.clipboard.writeText(localLicense.deviceBinding);
      setCopiedDevId(true);
      setTimeout(() => setCopiedDevId(false), 2500);
      showToast("success", "Device Hardware ID copied to clipboard!");
    }
  };

  // Fetch admin security status
  const fetchSecurityStatus = async () => {
    try {
      const res = await window.api.getAdminSecurityStatus();
      if (res) setHasRecoveryPin(Boolean(res.hasRecoveryPin));
    } catch (e) {
      console.error("Could not fetch admin security status", e);
    }
  };

  useEffect(() => {
    fetchSecurityStatus();
  }, []);

  // Load settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      if (shopSettings) return;
      const data = await window.api.getShopSettings();
      if (data) {
        setSettings({ ...emptySettings, ...data });
        if (setShopSettings) setShopSettings(data);
      }
    };
    fetchSettings();
  }, [shopSettings, setShopSettings]);

  useEffect(() => {
    if (shopSettings) setSettings({ ...emptySettings, ...shopSettings });
  }, [shopSettings]);

  // Show toast message
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3500);
  };

  // Change Admin Password
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast("error", "Please enter your current password.");
      return;
    }
    if (newPassword.length < 4) {
      showToast("error", "New password must be at least 4 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("error", "New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await window.api.changeAdminPassword({
        currentPassword,
        newPassword
      });
      if (result && result.success) {
        showToast("success", "Admin password updated successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        showToast("error", (result && result.message) || "Failed to update password.");
      }
    } catch (err) {
      showToast("error", "Error changing password: " + err.message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Set Master Recovery PIN
  const handleSetRecoveryPin = async (e) => {
    e.preventDefault();
    if (!pinCurrentPassword) {
      showToast("error", "Please enter your current admin password.");
      return;
    }
    const cleanPin = String(recoveryPin || "").trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      showToast("error", "Recovery PIN must be 4 to 6 numeric digits (e.g. 7860).");
      return;
    }
    if (cleanPin !== String(confirmPin || "").trim()) {
      showToast("error", "PIN confirmation does not match.");
      return;
    }

    setIsSavingPin(true);
    try {
      const result = await window.api.setAdminRecoveryPin({
        currentPassword: pinCurrentPassword,
        newPin: cleanPin
      });
      if (result && result.success) {
        showToast("success", "Master Recovery PIN saved successfully!");
        setHasRecoveryPin(true);
        setPinCurrentPassword("");
        setRecoveryPin("");
        setConfirmPin("");
      } else {
        showToast("error", (result && result.message) || "Failed to set recovery PIN.");
      }
    } catch (err) {
      showToast("error", "Error setting recovery PIN: " + err.message);
    } finally {
      setIsSavingPin(false);
    }
  };

  // Handle Save
  const handleSave = async () => {
    try {
      const result = await window.api.saveShopSettings(settings);
      if (result.success) {
        if (setShopSettings) setShopSettings(settings);
        showToast("success", "Settings saved successfully!");
      } else {
        showToast("error", "Failed to save settings.");
      }
    } catch (err) {
      showToast("error", "Something went wrong saving settings.");
    }
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      showToast("error", "Logo too large. Please use an image under 1MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSettings((prev) => ({ ...prev, logo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setSettings((prev) => ({ ...prev, logo: "" }));
  };

  const handleExport = async () => {
    const exportFn = window.electronAPI?.exportShopData || window.api?.exportShopData;
    if (!exportFn) {
      showToast("error", "Export is not available.");
      return;
    }

    setIsExporting(true);
    try {
      const result = await exportFn();
      if (!result || result.canceled) return;
      if (result.success) {
        showToast("success", "Exported data to: " + result.filePath);
      } else {
        showToast("error", result.error || "Export failed.");
      }
    } catch (err) {
      showToast("error", "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    const importFn = window.electronAPI?.importShopData || window.api?.importShopData;
    if (!importFn) {
      showToast("error", "Import is not available.");
      return;
    }

    setIsImporting(true);
    try {
      const result = await importFn();
      if (!result || result.canceled) return;
      if (result.success) {
        const summary = result.summary || {};
        showToast("success", `Imported ${summary.createdProducts || 0} products, updated ${summary.updatedProducts || 0}`);
        window.dispatchEvent(new Event("shop-data-updated"));
      } else {
        showToast("error", result.error || "Import failed.");
      }
    } catch (err) {
      showToast("error", "Import failed.");
    } finally {
      setIsImporting(false);
    }
  };

  // Safe Database Backup
  const handleBackupDatabase = async () => {
    setIsBackingUp(true);
    try {
      if (window.api?.backupDatabase) {
        const res = await window.api.backupDatabase();
        if (res?.canceled) return;
        if (res?.success) {
          showToast("success", `Database backup saved successfully to ${res.filePath}`);
        } else {
          showToast("error", res?.error || "Database backup failed.");
        }
      }
    } catch (err) {
      showToast("error", "Backup failed.");
    } finally {
      setIsBackingUp(false);
    }
  };

  // Safe Database Restore
  const handleRestoreDatabase = async () => {
    setShowRestoreConfirm(false);
    setIsRestoring(true);
    try {
      if (window.api?.restoreDatabase) {
        const res = await window.api.restoreDatabase();
        if (res?.canceled) return;
        if (res?.success) {
          showToast("success", res.message || "Database restored successfully!");
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          showToast("error", res?.error || "Database restore failed.");
        }
      }
    } catch (err) {
      showToast("error", "Restore failed: " + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`
            fixed top-5 right-5 px-5 py-3 rounded-xl shadow-xl text-white z-50 font-medium
            ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}
          `}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Shop &amp; POS Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure store branding, receipt info, khata policies, and database backup</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting || isExporting}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
          >
            {isImporting ? "Importing..." : "Import Products"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isImporting}
            className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : "Export Products"}
          </button>
        </div>
      </div>

      {/* SETTINGS FORM */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
        {/* LOGO */}
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Store Logo (Thermal Receipt / Header)</label>
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border bg-white flex items-center justify-center overflow-hidden shrink-0">
              {settings.logo ? (
                <img src={settings.logo} alt="Shop Logo Preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-gray-400">No Logo</span>
              )}
            </div>

            <div className="flex-1">
              <input type="file" accept="image/*" onChange={handleLogoChange} className="w-full text-xs text-gray-500" />
              <p className="text-xs text-gray-400 mt-1">Recommended: square PNG or JPG under 1MB.</p>
            </div>

            {settings.logo && (
              <button
                type="button"
                onClick={clearLogo}
                className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* BASIC STORE INFO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Shop / Business Name *</label>
            <input
              type="text"
              className="w-full p-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={settings.shop_name}
              onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Phone Number(s)</label>
            <input
              type="text"
              className="w-full p-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={settings.phone}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Store Address</label>
          <input
            type="text"
            className="w-full p-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={settings.address}
            onChange={(e) => setSettings({ ...settings, address: e.target.value })}
          />
        </div>

        {/* DIGITAL KHATA & BILLING POLICY */}
        <div className="border-t pt-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider text-blue-900">
            Digital Khata &amp; Currency Settings
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Currency Symbol</label>
              <input
                type="text"
                className="w-full p-2.5 rounded-xl border text-sm outline-none"
                value={settings.currency || "Rs."}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Invoice Prefix</label>
              <input
                type="text"
                className="w-full p-2.5 rounded-xl border text-sm outline-none"
                value={settings.invoice_prefix || "INV-"}
                onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Credit Limit Exceeded Behavior</label>
              <select
                className="w-full p-2.5 rounded-xl border text-sm outline-none bg-white"
                value={settings.credit_limit_behavior || "warning"}
                onChange={(e) => setSettings({ ...settings, credit_limit_behavior: e.target.value })}
              >
                <option value="warning">Warning Only (Allow Sale)</option>
                <option value="block">Block Credit Sale</option>
              </select>
            </div>
          </div>
        </div>

        {/* RECEIPT FOOTER */}
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Receipt Footer Note</label>
          <input
            type="text"
            className="w-full p-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={settings.footer_note}
            onChange={(e) => setSettings({ ...settings, footer_note: e.target.value })}
          />
        </div>

        {/* SAVE BUTTON */}
        <button
          onClick={handleSave}
          className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow"
        >
          Save All Settings
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ADMIN SECURITY & PASSWORD RECOVERY SECTION */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>🔐</span> Admin Security &amp; Password Management
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Update your admin login password and set a secret Master Recovery PIN for password recovery.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* CHANGE ADMIN PASSWORD */}
          <form onSubmit={handleChangePassword} className="bg-gray-50/80 rounded-xl p-5 border border-gray-200 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <span>🔑</span> Change Admin Password
                </h4>
                <span className="text-[11px] text-gray-400">Username: admin</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Current Password *</label>
                  <input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">New Password (Min 4 chars) *</label>
                  <input
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Confirm New Password *</label>
                  <input
                    type="password"
                    placeholder="Re-type new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow transition disabled:opacity-50"
            >
              {isChangingPassword ? "Updating Password..." : "Update Password"}
            </button>
          </form>

          {/* MASTER RECOVERY PIN (EMERGENCY RESET) */}
          <form onSubmit={handleSetRecoveryPin} className="bg-gray-50/80 rounded-xl p-5 border border-gray-200 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                  <span>🛡️</span> Master Recovery PIN
                </h4>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  hasRecoveryPin ? "bg-green-100 text-green-700 border border-green-200" : "bg-amber-100 text-amber-700 border border-amber-200"
                }`}>
                  {hasRecoveryPin ? "✅ PIN Configured" : "⚠️ Not Configured"}
                </span>
              </div>

              <p className="text-xs text-gray-500">
                Set a secret 4 to 6 digit ATM-style PIN (e.g. 7860). If you ever forget your password, you can use this PIN on the login screen to reset it immediately.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Current Admin Password *</label>
                  <input
                    type="password"
                    placeholder="Confirm password to authorize"
                    value={pinCurrentPassword}
                    onChange={(e) => setPinCurrentPassword(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Secret Master PIN (4–6 Digits) *</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="e.g. 7860"
                    value={recoveryPin}
                    onChange={(e) => setRecoveryPin(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-widest"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Confirm Secret Master PIN *</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Re-type secret PIN"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-white text-sm outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-widest"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingPin}
              className="w-full mt-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded-xl text-sm shadow transition disabled:opacity-50"
            >
              {isSavingPin ? "Saving Master PIN..." : hasRecoveryPin ? "Update Master Recovery PIN" : "Save Master Recovery PIN"}
            </button>
          </form>
        </div>
      </div>

      {/* SOFTWARE LICENSE & ACTIVATION SECTION */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>🔑</span> Software License &amp; Activation (سافٹ ویئر لائسنس)
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Cryptographically verified offline-first license. No internet connection required for regular retail billing.
            </p>
          </div>

          <div>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                localLicense?.state === "LICENSE_ACTIVE"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : localLicense?.isLocked
                  ? "bg-rose-50 text-rose-700 border-rose-300"
                  : "bg-blue-50 text-blue-700 border-blue-300"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  localLicense?.state === "LICENSE_ACTIVE"
                    ? "bg-emerald-500"
                    : localLicense?.isLocked
                    ? "bg-rose-500"
                    : "bg-blue-500"
                }`}
              />
              {localLicense?.state === "LICENSE_ACTIVE"
                ? "Commercial License Active"
                : localLicense?.isLocked
                ? "License Required / Locked"
                : `15-Day Free Trial (${localLicense?.daysRemaining || 0} days remaining)`}
            </span>
          </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Hardware Device ID:</span>
              <button
                type="button"
                onClick={handleCopyDeviceId}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {copiedDevId ? "Copied!" : "Copy ID"}
              </button>
            </div>
            <p className="font-mono text-xs font-bold text-slate-800 break-all select-all">
              {localLicense?.deviceBinding || "Loading..."}
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-semibold text-slate-600">Installation ID:</span>
            <p className="font-mono text-xs font-bold text-slate-800 select-all">
              {localLicense?.installationId || "Loading..."}
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-semibold text-slate-600">Valid Until:</span>
            <p className="font-semibold text-slate-800">
              {localLicense?.expiresAt ? new Date(localLicense.expiresAt).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : "N/A"}
              {localLicense?.daysRemaining !== undefined && ` (${localLicense.daysRemaining} days left)`}
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-semibold text-slate-600">Registered Customer:</span>
            <p className="font-semibold text-slate-800">
              {localLicense?.customerName || "Valued Retail Store"}
            </p>
          </div>
        </div>

        {/* ACTIVATION FORM */}
        <form onSubmit={handleActivateFromSettings} className="space-y-4 pt-2 border-t">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Activate New Commercial Key (نئی لائسنس کی لگائیں)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">License Activation Key</label>
              <input
                type="text"
                value={activationKey}
                onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
                placeholder="AAJ-XXXX-XXXX-XXXX"
                className="w-full font-mono text-sm px-3.5 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 uppercase placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shop / Owner Name (Optional)</label>
              <input
                type="text"
                value={licenseCustomerName}
                onChange={(e) => setLicenseCustomerName(e.target.value)}
                placeholder="Askari 11 General Store"
                className="w-full text-sm px-3.5 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isActivatingLicense}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-50"
            >
              {isActivatingLicense ? "Activating..." : "Activate Commercial License"}
            </button>

            <button
              type="button"
              onClick={handleSyncWithServer}
              disabled={isSyncingLicense}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition disabled:opacity-50"
            >
              {isSyncingLicense ? "Syncing..." : "Sync / Re-verify Online"}
            </button>
          </div>
        </form>
      </div>

      {/* OFFLINE DATABASE BACKUP & RESTORE SECTION */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <span>💾</span> Offline Database Backup &amp; Recovery
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Create full offline backups of your products, sales, inventory, and customer khata to a USB drive or local folder.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleBackupDatabase}
            disabled={isBackingUp}
            className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition shadow flex items-center gap-2 disabled:opacity-50"
          >
            <span>📁</span> {isBackingUp ? "Saving Backup..." : "Backup Database Now (.db)"}
          </button>

          <button
            type="button"
            onClick={() => setShowRestoreConfirm(true)}
            disabled={isRestoring}
            className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition shadow flex items-center gap-2 disabled:opacity-50"
          >
            <span>🔄</span> {isRestoring ? "Restoring..." : "Restore Database from File"}
          </button>
        </div>
      </div>

      {/* RESTORE CONFIRMATION DIALOG */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-gray-900">Restore POS Database?</h3>
            </div>

            <p className="text-sm text-gray-600">
              Restoring a database will replace the current store records with the backup file. A safety backup of your existing data will be automatically saved before restoring.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(false)}
                className="px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreDatabase}
                className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 shadow"
              >
                Select File &amp; Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
