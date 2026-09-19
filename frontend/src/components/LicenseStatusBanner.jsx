// frontend/src/components/LicenseStatusBanner.jsx
import { motion } from "framer-motion";
import { Clock, ShieldAlert, KeyRound, ArrowRight } from "lucide-react";

export default function LicenseStatusBanner({ licenseStatus, onOpenSettings }) {
  if (!licenseStatus) return null;

  const { state, daysRemaining, type } = licenseStatus;

  // Only display banner for TRIAL_ACTIVE
  if (state !== "TRIAL_ACTIVE" && type !== "TRIAL") return null;

  const isUrgent = Number(daysRemaining) <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`w-full px-6 py-2.5 text-xs flex items-center justify-between border-b shadow-sm transition-colors ${
        isUrgent
          ? "bg-amber-500 text-slate-950 border-amber-600 font-medium"
          : "bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white border-blue-900"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${
            isUrgent ? "bg-black/10 text-slate-950" : "bg-white/20 text-white"
          }`}
        >
          {isUrgent ? <ShieldAlert className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wider text-[11px] px-2 py-0.5 rounded bg-black/10">
            Free Trial
          </span>
          <span>
            {daysRemaining === 0 ? (
              <strong>Expires today!</strong>
            ) : (
              <>
                <strong>{daysRemaining} Day{daysRemaining === 1 ? "" : "s"} Remaining</strong> in your 15-day evaluation.
              </>
            )}
            {" "}All POS billing, barcode, and khata features are currently running 100% offline.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
          isUrgent
            ? "bg-slate-950 text-white hover:bg-slate-800 active:scale-95"
            : "bg-white text-blue-800 hover:bg-blue-50 active:scale-95"
        }`}
      >
        <KeyRound className="w-3 h-3" />
        <span>Enter License Key</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
