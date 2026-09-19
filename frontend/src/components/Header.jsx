import { motion } from "framer-motion";

export default function Header({ title, username, role, shopSettings, licenseStatus, onOpenSettings }) {
  const shopName = shopSettings?.shop_name || "POS";
  const shopLogo = shopSettings?.logo || null;
  const shopAddress = shopSettings?.address || "";

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="
        w-full h-20 px-10
        flex items-center justify-between
        bg-white/95
        border-b border-gray-200
        shadow-xs
      "
    >
      {/* LEFT SIDE — LOGO + SHOP NAME + PAGE TITLE */}
      <div className="flex items-center gap-4">
        {/* CIRCLE LOGO */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 shadow-xs flex items-center justify-center overflow-hidden"
        >
          {shopLogo ? (
            <img
              src={shopLogo}
              alt="Shop Logo"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xs text-gray-500">No Logo</span>
          )}
        </motion.div>

        {/* SHOP NAME + PAGE TITLE */}
        <div className="flex flex-col leading-tight">
          <h1 className="text-lg font-bold text-gray-900 tracking-wide">
            {shopName}
          </h1>

          {shopAddress && (
            <span className="text-xs text-gray-500 -mt-1">
              {shopAddress}
            </span>
          )}

          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-sm text-gray-600"
          >
            {title}
          </motion.span>
        </div>
      </div>

      {/* RIGHT SIDE — LICENSE BADGE & USER INFORMATION */}
      <div className="flex items-center gap-4">
        {licenseStatus && (
          <div
            onClick={onOpenSettings}
            className={`cursor-pointer px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm border ${
              licenseStatus.state === "LICENSE_ACTIVE"
                ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                : licenseStatus.isLocked
                ? "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                : Number(licenseStatus.daysRemaining) <= 3
                ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                : "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
            }`}
            title="Click to view license details"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                licenseStatus.state === "LICENSE_ACTIVE"
                  ? "bg-emerald-500"
                  : licenseStatus.isLocked
                  ? "bg-rose-500 animate-ping"
                  : Number(licenseStatus.daysRemaining) <= 3
                  ? "bg-amber-500 animate-pulse"
                  : "bg-blue-500"
              }`}
            />
            <span>
              {licenseStatus.state === "LICENSE_ACTIVE"
                ? "Commercial License"
                : licenseStatus.isLocked
                ? "License Required"
                : `Trial: ${licenseStatus.daysRemaining}d left`}
            </span>
          </div>
        )}

        {/* ZOOM RESET HELPER */}
        <button
          type="button"
          onClick={() => window.api?.zoomReset?.()}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-colors"
          title="Click to reset display zoom to 100% (or press Ctrl + 0)"
        >
          <span>🔍 100%</span>
        </button>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-gray-700 font-medium text-sm"
        >
          Logged in as{" "}
          <span className="text-blue-600 font-semibold">
            {username || role}
          </span>
        </motion.div>
      </div>
    </motion.header>
  );
}
