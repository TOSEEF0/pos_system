// frontend/src/components/LicenseLockScreen.jsx
import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, ShieldAlert, Copy, Check, Download, RefreshCw, PhoneCall, AlertTriangle, Clock } from "lucide-react";

export default function LicenseLockScreen({ licenseStatus, onLicenseActivated, onRefreshStatus }) {
  const [licenseKey, setLicenseKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRegisteringTrial, setIsRegisteringTrial] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");

  const state = licenseStatus?.state || "TRIAL_EXPIRED";
  const deviceBinding = licenseStatus?.deviceBinding || "DETECTING...";

  const handleCopyDeviceBinding = () => {
    navigator.clipboard.writeText(deviceBinding);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const cleanKey = licenseKey.trim().toUpperCase();
    if (!cleanKey) {
      setErrorMessage("Please enter your 16-character license key (e.g. AAJ-XXXX-XXXX-XXXX).");
      return;
    }

    if (cleanKey.startsWith("DEV-")) {
      setErrorMessage("Yeh aapka Computer Hardware ID hai, License Key nahi! License Key 'AAJ-' se shuru hoti hai (Misaal: AAJ-XXXX-XXXX-XXXX). Apna Hardware ID software vendor ko bhej kar License Key hasil karein.");
      return;
    }

    setIsActivating(true);
    try {
      let res = null;
      if (window.api?.license?.activate) {
        res = await window.api.license.activate(cleanKey, customerName.trim());
      } else if (window.api?.activateLicense) {
        res = await window.api.activateLicense({
          licenseKey: cleanKey,
          customerName: customerName.trim()
        });
      }

      if (res && res.success) {
        setSuccessMessage(res.message || "License activated successfully! Launching POS...");
        setTimeout(() => {
          if (onLicenseActivated) onLicenseActivated();
        }, 1200);
      } else {
        setErrorMessage(res?.message || "Invalid or already bound license key. Contact support.");
      }
    } catch (err) {
      setErrorMessage("Activation failed: " + (err.message || "Could not reach licensing server"));
    } finally {
      setIsActivating(false);
    }
  };

  const handleRegisterTrial = async () => {
    setIsRegisteringTrial(true);
    setErrorMessage("");
    try {
      const registerFn = window.api?.license?.registerTrial || window.api?.registerTrial;
      const res = await registerFn();
      if (res && res.success) {
        setSuccessMessage("15-day trial successfully registered!");
        setTimeout(() => {
          if (onLicenseActivated) onLicenseActivated();
        }, 1000);
      } else {
        setErrorMessage(res?.message || "Could not register trial. Check internet connection or enter license key.");
      }
    } catch (err) {
      setErrorMessage("Trial registration error: " + (err.message || "Licensing server unreachable"));
    } finally {
      setIsRegisteringTrial(false);
    }
  };

  const handleEmergencyBackup = async () => {
    setIsExporting(true);
    setBackupMessage("");
    try {
      const backupFn = window.api?.license?.emergencyBackup || window.api?.backupDatabase;
      const res = await backupFn();
      if (res && res.success) {
        setBackupMessage(`Safe backup saved to: ${res.filePath}`);
      } else if (res && !res.canceled) {
        setBackupMessage("Backup failed: " + (res.error || "Unknown error"));
      }
    } catch (err) {
      setBackupMessage("Backup error: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // State-specific banner text
  const getBannerDetails = () => {
    switch (state) {
      case "TRIAL_EXPIRED":
        return {
          title: "15-Day Free Trial Expired",
          urduTitle: "آپ کی 15 دن کی مفت آزمائشی مدت ختم ہو چکی ہے",
          desc: "To continue billing, barcode scanning, and accessing your store dashboard, please activate your commercial license.",
          icon: Clock,
          badgeColor: "bg-amber-100 text-amber-900 border-amber-300"
        };
      case "LICENSE_EXPIRED":
        return {
          title: "Commercial License Expired",
          urduTitle: "آپ کا سافٹ ویئر لائسنس ختم ہو چکا ہے",
          desc: "Your subscription period has ended. Please enter an updated activation key to resume normal operations.",
          icon: ShieldAlert,
          badgeColor: "bg-red-100 text-red-900 border-red-300"
        };
      case "LICENSE_REVOKED":
        return {
          title: "License Deactivated or Revoked",
          urduTitle: "یہ لائسنس غیر فعال کر دیا گیا ہے",
          desc: "This installation has been revoked by software administration. Contact support to re-authorize this machine.",
          icon: ShieldAlert,
          badgeColor: "bg-red-100 text-red-900 border-red-300"
        };
      case "LICENSE_TAMPER_DETECTED":
        return {
          title: "Clock Tampering Detected",
          urduTitle: "سسٹم کلاک میں تبدیلی کی نشاندہی ہوئی ہے",
          desc: "The Windows system clock was rolled backwards. Please restore the accurate current date & time on your computer and restart the application.",
          icon: AlertTriangle,
          badgeColor: "bg-rose-100 text-rose-900 border-rose-300"
        };
      case "TRIAL_REGISTRATION_PENDING":
      default:
        return {
          title: "License Activation Required",
          urduTitle: "آج کیش اینڈ کیری پی او ایس — لائسنس درکار ہے",
          desc: "Please connect to the internet once to start your free 15-day trial, or enter your purchased commercial activation key.",
          icon: KeyRound,
          badgeColor: "bg-blue-100 text-blue-900 border-blue-300"
        };
    }
  };

  const banner = getBannerDetails();
  const Icon = banner.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6"
      >
        {/* TOP STATUS HEADER */}
        <div className="bg-slate-900 text-white p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">{banner.title}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                  LOCKED
                </span>
              </div>
              <p className="text-sm font-arabic text-slate-300 mt-1" dir="rtl">
                {banner.urduTitle}
              </p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {banner.desc}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* HARDWARE DEVICE BINDING BOX */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold uppercase tracking-wider">Your Computer Hardware ID (ڈیوائس آئی ڈی)</span>
              <span>Send this to software vendor</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-sm font-bold bg-white px-3 py-2 rounded-lg border border-slate-300 text-slate-800 select-all tracking-wider">
                {deviceBinding}
              </div>
              <button
                type="button"
                onClick={handleCopyDeviceBinding}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-200 hover:bg-slate-300 active:bg-slate-400 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                title="Copy Device ID to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy ID"}
              </button>
            </div>
          </div>

          {/* ACTIVATION FORM */}
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Commercial License Activation Key (لائسنس کی)
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="AAJ-XXXX-XXXX-XXXX"
                className="w-full font-mono text-base tracking-widest px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent uppercase placeholder:text-slate-400"
              />
              {licenseKey.trim().toUpperCase().startsWith("DEV-") && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 font-semibold">
                  <span>⚠️ Yeh aapka Computer Hardware ID hai! License Key "AAJ-" se shuru hoti hai.</span>
                </p>
              )}
              <p className="text-[11px] text-slate-500 mt-1">
                Format: <span className="font-mono font-bold text-blue-600">AAJ-XXXX-XXXX-XXXX</span> (Upar wala Hardware ID vendor ko bhej kar key hasil karein)
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Store / Owner Name (دکان یا مالک کا نام - اختیاری)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Askari 11 Cash & Carry"
                className="w-full text-sm px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
                <Check className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isActivating}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm"
              >
                {isActivating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {isActivating ? "Verifying with Authority..." : "Activate Commercial License"}
              </button>

              {(state === "FIRST_RUN" || state === "TRIAL_REGISTRATION_PENDING") && (
                <button
                  type="button"
                  onClick={handleRegisterTrial}
                  disabled={isRegisteringTrial}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl transition-colors text-xs flex items-center gap-1.5"
                >
                  {isRegisteringTrial ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4 text-blue-600" />}
                  Register Free Trial
                </button>
              )}
            </div>
          </form>

          {/* CRITICAL DATA SAFETY & USB BACKUP SECTION */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Guaranteed Data Safety & USB Export (ڈیٹا کا تحفظ)
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                  آپ کی تمام پروڈکٹس، سیلز، کسٹمرز اور ادھار کھاتہ مکمل محفوظ ہیں۔ لائسنس ختم ہونے سے آپ کا ڈیٹا ضائع نہیں ہوتا۔ آپ جب چاہیں ایمرجنسی بیک اپ ڈاؤن لوڈ کر سکتے ہیں۔
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleEmergencyBackup}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {isExporting ? "Saving..." : "Export Safe SQLite Backup"}
              </button>
              <span className="text-[11px] text-emerald-700 font-medium">
                Save to USB Drive (.sqlite)
              </span>
            </div>

            {backupMessage && (
              <p className="text-[11px] font-medium text-emerald-900 bg-white/80 p-2 rounded border border-emerald-300">
                {backupMessage}
              </p>
            )}
          </div>

          {/* VENDOR & SUPPORT CONTACT */}
          <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-blue-600" />
              <span>
                <strong>Official Support:</strong> Salman Ashraf (Askari 11, Lahore)
              </span>
            </div>
            <div className="text-slate-400">
              Offline-First Retail Architecture v1.0
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
