import { useState } from "react";

export default function Sidebar({ currentPage, setCurrentPage, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);

  const items = [
    { key: "dashboard", label: "Dashboard", icon: "DB" },
    { key: "cashier", label: "POS Billing", icon: "POS" },
    { key: "customers", label: "Digital Khata", icon: "KH" },
    { key: "sales", label: "Sales", icon: "SL" },
    { key: "products", label: "Products", icon: "PR" },
    { key: "categories", label: "Categories", icon: "CT" },
    { key: "purchases", label: "Purchases", icon: "PU" },
    { key: "vendors", label: "Vendors", icon: "VD" },
    { key: "creditors", label: "Vendor Creditors", icon: "CR" },
    { key: "audit-logs", label: "Audit Logs", icon: "AL" },
    { key: "shop-settings", label: "Shop Settings", icon: "SS" },
    { key: "register-cashier", label: "Register Cashier", icon: "RC" },
    { key: "managecashier", label: "Manage Cashier", icon: "MC" },
  ];

  return (
    <div
      className={`
        ${collapsed ? "w-20" : "w-60"}
        h-screen flex flex-col shrink-0 transition-all duration-300
        overflow-y-auto
        bg-white
        border-r border-gray-200
        shadow-sm
      `}
    >
      {/* BRAND */}
      <div className="px-4 py-4 flex items-center justify-between">
        {!collapsed && (
          <div className="leading-tight">
            <h1 className="text-lg font-bold text-gray-900 tracking-wide">
              POS
            </h1>
            <p className="text-xs text-gray-500">Cash &amp; Carry</p>
          </div>
        )}

        {/* COLLAPSE BUTTON */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-white/50 transition text-gray-700"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? ">>" : "<<"}
        </button>
      </div>

      {/* MENU */}
      <nav className="flex-1 px-2 space-y-1 pb-4">
        {items.map((item) => {
          const active = currentPage === item.key;

          return (
            <button
              key={item.key}
              onClick={() => setCurrentPage(item.key)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                transition-all duration-200 group
                border border-transparent

                ${
                  active
                    ? `
                    bg-white/70 
                    text-blue-900 font-semibold
                    border-blue-200/70
                    shadow-sm
                    border-l-4 border-l-blue-500
                  `
                    : `
                    text-gray-700
                    hover:bg-white/50 
                  `
                }
              `}
            >
              {/* ICON */}
              <span
                className={`
                  text-xs font-semibold tracking-[0.25em] transition-all
                  ${active ? "text-blue-600" : "text-gray-500"}
                `}
              >
                {item.icon}
              </span>

              {/* LABEL */}
              {!collapsed && (
                <span
                  className={`transition-all ${
                    active ? "text-gray-900" : "text-gray-700"
                  }`}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* LOGOUT BUTTON */}
      <div className="p-4">
        <button
          onClick={onLogout}
          className={`
            w-full px-4 py-2.5 rounded-xl 
            bg-gradient-to-r from-red-500 to-red-600 
            text-white font-semibold shadow-md
            hover:shadow-red-500/30 transition-all
          `}
        >
          {collapsed ? "LO" : "Logout"}
        </button>
      </div>
    </div>
  );
}
