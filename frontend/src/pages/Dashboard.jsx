import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

const statCards = [
  { key: "todaySales", label: "Today's Total Sales", icon: "Rs", color: "text-blue-700 bg-blue-50" },
  { key: "totalOutstanding", label: "Customer Outstanding Dues", icon: "Wallet", color: "text-amber-700 bg-amber-50" },
  { key: "creditSalesToday", label: "Today's Credit Sales", icon: "Book", color: "text-purple-700 bg-purple-50" },
  { key: "paymentsToday", label: "Today's Payments Received", icon: "Check", color: "text-green-700 bg-green-50" },
  { key: "totalProducts", label: "Total Products", icon: "Box", color: "text-gray-700 bg-gray-50" },
  { key: "lowStock", label: "Low Stock Items", icon: "Alert", color: "text-red-700 bg-red-50" },
];

const iconMap = {
  Rs: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 4h8a4 4 0 0 1 0 8H6z" />
      <path d="M6 12h7a4 4 0 0 1 0 8H6z" />
    </svg>
  ),
  Wallet: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3z" />
      <path d="M3 7V5a2 2 0 0 1 2-2h12" />
      <circle cx="17" cy="12" r="1.5" />
    </svg>
  ),
  Book: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  Check: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Box: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M21 7l-9 5-9-5" />
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M12 12v9" />
    </svg>
  ),
  Alert: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86l-7.4 12.82A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.71-3.32l-7.4-12.82a2 2 0 0 0-3.42 0z" />
    </svg>
  ),
};

export default function Dashboard({ setCurrentPage }) {
  const [stats, setStats] = useState({
    todaySales: 0,
    totalOutstanding: 0,
    creditSalesToday: 0,
    paymentsToday: 0,
    totalProducts: 0,
    lowStock: 0,
  });
  const [recentSales, setRecentSales] = useState([]);
  const [outstandingDuesList, setOutstandingDuesList] = useState([]);
  const [toast, setToast] = useState(null);
  const [busyAction, setBusyAction] = useState("");

  const formatMoney = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      try {
        const [products, sales, khataSummary, dues] = await Promise.all([
          window.api.getProducts?.() || [],
          window.api.getAllSales?.() || [],
          window.api.getKhataSummary?.() || {},
          window.api.getOutstandingDues?.("highest_due") || []
        ]);

        if (!mounted) return;

        const todayKey = new Date().toISOString().slice(0, 10);
        const todaySales = (sales || []).reduce((sum, sale) => {
          const dateKey = String(sale.date || "").slice(0, 10);
          if (dateKey !== todayKey) return sum;
          const value = Number(sale.discounted_total ?? sale.total ?? 0);
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);

        const lowStock = (products || []).filter((p) => Number(p.quantity) <= 5).length;

        setStats({
          todaySales,
          totalOutstanding: khataSummary.totalOutstanding || 0,
          creditSalesToday: khataSummary.creditSalesToday || 0,
          paymentsToday: khataSummary.paymentsToday || 0,
          totalProducts: products?.length || 0,
          lowStock,
        });

        setRecentSales((sales || []).slice(0, 6));
        setOutstandingDuesList((dues || []).slice(0, 6));
      } catch (err) {
        console.error("Dashboard stats error", err);
      }
    }

    loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  const actionButtons = useMemo(
    () => [
      {
        key: "open-pos",
        label: "Open POS Billing",
        action: () => setCurrentPage?.("cashier"),
        primary: true,
      },
      {
        key: "open-khata",
        label: "Digital Khata",
        action: () => setCurrentPage?.("customers"),
        primary: true,
      },
      {
        key: "add-product",
        label: "Add Product",
        action: () => setCurrentPage?.("products"),
      },
      {
        key: "import-products",
        label: "Import Products",
        action: async () => {
          const fn = window.electronAPI?.importShopData || window.api?.importShopData;
          if (!fn) return;
          setBusyAction("import");
          const result = await fn();
          if (result?.success) {
            setToast({ type: "success", message: "Import completed." });
          }
          setBusyAction("");
        },
      },
      {
        key: "export-data",
        label: "Export Products",
        action: async () => {
          const fn = window.electronAPI?.exportShopData || window.api?.exportShopData;
          if (!fn) return;
          setBusyAction("export");
          const result = await fn();
          if (result?.success) {
            setToast({ type: "success", message: "Export saved." });
          }
          setBusyAction("");
        },
      },
      {
        key: "backup-db",
        label: "Backup Database",
        action: async () => {
          const fn = window.api?.backupDatabase;
          if (!fn) return;
          const res = await fn();
          if (res?.success) {
            setToast({ type: "success", message: `Backup saved to ${res.filePath}` });
          }
        },
      },
    ],
    [setCurrentPage]
  );

  return (
    <div
      className="
        w-full h-full 
        p-4 md:p-6 
        space-y-6 
        max-w-7xl mx-auto
        overflow-y-auto
      "
    >
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 rounded-xl px-4 py-3 text-sm shadow-xl font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
          Aaj Cash &amp; Carry POS Control Center
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Offline retail billing, inventory &amp; Digital Khata management
        </p>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card) => {
          const isCurrency = ["todaySales", "totalOutstanding", "creditSalesToday", "paymentsToday"].includes(card.key);
          const rawVal = stats[card.key] || 0;

          return (
            <div
              key={card.key}
              className="rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{card.label}</span>
                <span className={`rounded-full p-2 ${card.color}`}>
                  {iconMap[card.icon]}
                </span>
              </div>
              <div className="mt-3 text-xl font-bold text-gray-900">
                {isCurrency ? `Rs. ${formatMoney(rawVal)}` : rawVal}
              </div>
            </div>
          );
        })}
      </div>

      {/* QUICK ACTIONS & WHO OWES ME MONEY SECTION */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* QUICK ACTIONS */}
        <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Quick Actions</h2>
            <p className="text-xs text-gray-500">Jump directly into daily store workflows</p>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {actionButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={btn.action}
                disabled={busyAction !== ""}
                className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition text-left flex items-center justify-between shadow-xs ${
                  btn.primary
                    ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                } disabled:opacity-50`}
              >
                <span>{btn.label}</span>
                <span className="text-xs">→</span>
              </button>
            ))}
          </div>
        </div>

        {/* WHO OWES ME MONEY? PREVIEW */}
        <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-1.5">
                <span>🚨</span> Outstanding Customer Dues
              </h2>
              <p className="text-xs text-gray-500">Who owes money (highest due accounts)</p>
            </div>
            <button
              onClick={() => setCurrentPage?.("customers")}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              View Full Khata →
            </button>
          </div>

          {outstandingDuesList.length === 0 ? (
            <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border">
              All customer accounts are clear!
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border rounded-xl overflow-hidden">
              {outstandingDuesList.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setCurrentPage?.("customers")}
                  className="p-3 hover:bg-blue-50/50 cursor-pointer flex justify-between items-center transition text-sm"
                >
                  <div>
                    <div className="font-semibold text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-500">📞 {c.phone || "No phone"} • {c.days_since_last_activity} days ago</div>
                  </div>
                  <div className="text-right font-bold text-red-600">
                    Rs. {formatMoney(c.current_due)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RECENT SALES */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Recent Store Sales</h2>
          <button
            onClick={() => setCurrentPage?.("sales")}
            className="text-xs text-blue-600 hover:underline font-semibold"
          >
            All Sales &amp; Reports →
          </button>
        </div>

        {recentSales.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border">
            No sales recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs font-bold text-blue-700">INV-{s.id}</td>
                    <td className="p-3 font-medium text-gray-800">{s.customer_name || "Walk-in"}</td>
                    <td className="p-3 text-xs text-gray-500">{new Date(s.date).toLocaleString()}</td>
                    <td className="p-3 text-xs">
                      <span className={`px-2 py-0.5 rounded font-bold ${s.payment_type === 'credit' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                        {(s.payment_type || 'cash').toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-gray-900">
                      Rs. {formatMoney(s.discounted_total || s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
