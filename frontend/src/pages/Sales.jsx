import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

const CATEGORY_COLORS = [
  "#2563eb", // Blue
  "#059669", // Emerald Green
  "#d97706", // Amber
  "#7c3aed", // Violet
  "#0891b2", // Cyan
  "#dc2626", // Red
  "#ea580c", // Orange
  "#4f46e5", // Indigo
  "#0284c7", // Sky Blue
  "#65a30d"  // Lime
];

function Sales() {
  const [sales, setSales] = useState([]);
  const [filter, setFilter] = useState("all");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [summary, setSummary] = useState({ 
    totalSales: 0, 
    totalDiscountedSales: 0,
    totalDiscounts: 0,
    totalItems: 0, 
    totalProfit: 0, 
    realizedProfit: 0,
    pendingProfit: 0,
    profitPercentage: 0 
  });
  const [chartData, setChartData] = useState([]);
  const [chartView, setChartView] = useState("bar"); // "bar" or "pie"
  const [categoryData, setCategoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectedSale, setSelectedSale] = useState(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);
  const [toast, setToast] = useState({ show: false, type: "", message: "" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 2500);
  };

  useEffect(() => {
    if (filter !== "custom") {
      loadSales();
    }
  }, [filter]);

  const loadSales = async (range = null) => {
    setLoading(true);
    setLoadError(null);

    try {
      const now = new Date();
      let salesData = [];
      let catData = [];
      let queryRange = null;
      
      if (filter === "all") {
        salesData = await window.api.getAllSales();
        catData = await window.api.getSalesCategoryBreakdown();
      } else if (filter === "today") {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        queryRange = { 
          start: start.toISOString(), 
          end: end.toISOString() 
        };
        salesData = await window.api.getSalesRange(queryRange);
        catData = await window.api.getSalesCategoryBreakdown(queryRange);
      } else if (filter === "custom" && range) {
        const start = new Date(range.start);
        const end = new Date(range.end);
        
        if (start > end) {
          showToast("Start date cannot be after end date!", "error");
          setLoading(false);
          return;
        }
        
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        
        queryRange = { 
          start: start.toISOString(), 
          end: end.toISOString() 
        };
        salesData = await window.api.getSalesRange(queryRange);
        catData = await window.api.getSalesCategoryBreakdown(queryRange);
      } else if (filter === "7days") {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        start.setHours(0, 0, 0, 0);
        queryRange = { 
          start: start.toISOString(), 
          end: now.toISOString() 
        };
        salesData = await window.api.getSalesRange(queryRange);
        catData = await window.api.getSalesCategoryBreakdown(queryRange);
      } else if (filter === "month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        queryRange = { 
          start: start.toISOString(), 
          end: now.toISOString() 
        };
        salesData = await window.api.getSalesRange(queryRange);
        catData = await window.api.getSalesCategoryBreakdown(queryRange);
      } else if (filter === "year") {
        const start = new Date(now.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        queryRange = { 
          start: start.toISOString(), 
          end: now.toISOString() 
        };
        salesData = await window.api.getSalesRange(queryRange);
        catData = await window.api.getSalesCategoryBreakdown(queryRange);
      }

      const cleanSales = salesData || [];
      const cleanCats = catData || [];

      setSales(cleanSales);
      setCategoryData(cleanCats);
      calculateSummary(cleanSales);
      prepareChartData(cleanSales);
    } catch (err) {
      console.error("Error loading sales:", err);
      setLoadError("Unable to load sales analytics.");
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (data) => {
    const totalSales = data.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalDiscountedSales = data.reduce((sum, s) => sum + (s.discounted_total || s.total || 0), 0);
    const totalDiscounts = data.reduce((sum, s) => sum + (s.discount_amount || 0), 0);
    const totalItems = data.reduce((sum, s) => sum + (s.total_items || 0), 0);
    const totalProfit = data.reduce((sum, s) => sum + (s.total_profit || 0), 0);
    const realizedProfit = data.reduce((sum, s) => sum + (s.realized_profit !== undefined ? s.realized_profit : s.total_profit || 0), 0);
    const pendingProfit = data.reduce((sum, s) => sum + (s.pending_profit || 0), 0);
    const profitPercentage = totalDiscountedSales > 0 ? (realizedProfit / totalDiscountedSales) * 100 : 0;
    
    setSummary({ 
      totalSales, 
      totalDiscountedSales,
      totalDiscounts,
      totalItems, 
      totalProfit,
      realizedProfit,
      pendingProfit,
      profitPercentage 
    });
  };

  const prepareChartData = (data) => {
    if (!data || !data.length) {
      setChartData([]);
      return;
    }

    // Sort data chronologically ascending
    const sortedData = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const startDate = new Date(sortedData[0].date);
    const endDate = new Date(sortedData[sortedData.length - 1].date);
    const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    let grouped = {};

    if (diffDays <= 1) {
      // Group by hour (e.g., 10 AM, 11 AM)
      sortedData.forEach((s) => {
        const date = new Date(s.date);
        const hour = date.getHours();
        const hour12 = hour % 12 || 12;
        const ampm = hour < 12 ? "AM" : "PM";
        const label = `${hour12} ${ampm}`;
        if (!grouped[label]) {
          grouped[label] = { sales: 0, discountedSales: 0, profit: 0 };
        }
        grouped[label].sales += (s.total || 0);
        grouped[label].discountedSales += (s.discounted_total || s.total || 0);
        grouped[label].profit += (s.total_profit || 0);
      });
    } else if (diffDays <= 31) {
      // Group by day (e.g., Sep 18)
      sortedData.forEach((s) => {
        const day = new Date(s.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        });
        if (!grouped[day]) {
          grouped[day] = { sales: 0, discountedSales: 0, profit: 0 };
        }
        grouped[day].sales += (s.total || 0);
        grouped[day].discountedSales += (s.discounted_total || s.total || 0);
        grouped[day].profit += (s.total_profit || 0);
      });
    } else {
      // Group by month (e.g., Sep 2026)
      sortedData.forEach((s) => {
        const date = new Date(s.date);
        const month = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        if (!grouped[month]) {
          grouped[month] = { sales: 0, discountedSales: 0, profit: 0 };
        }
        grouped[month].sales += (s.total || 0);
        grouped[month].discountedSales += (s.discounted_total || s.total || 0);
        grouped[month].profit += (s.total_profit || 0);
      });
    }

    const items = Object.keys(grouped).map((label) => {
      const g = grouped[label];
      const sales = Math.round((g.discountedSales || 0) * 100) / 100;
      const rawProfit = Math.round((g.profit || 0) * 100) / 100;
      const profit = rawProfit > 0 ? rawProfit : 0;
      const loss = rawProfit < 0 ? Math.abs(rawProfit) : 0;
      // Cost = Sales - Profit (or Sales + Loss)
      const cost = Math.max(0, Math.round((sales - rawProfit) * 100) / 100);
      const margin = sales > 0 ? ((rawProfit / sales) * 100).toFixed(1) : "0.0";

      return {
        name: label,
        sales,
        cost,
        profit,
        loss,
        rawProfit,
        margin
      };
    });

    setChartData(items);
  };

  const handleCustomSearch = () => {
    if (!customRange.start || !customRange.end) {
      showToast("Please select both start and end dates.", "error");
      return;
    }
    loadSales(customRange);
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    if (newFilter === "custom") {
      setCustomRange({ start: "", end: "" });
      setSales([]);
      setCategoryData([]);
      setChartData([]);
      setSummary({ 
        totalSales: 0, 
        totalDiscountedSales: 0,
        totalDiscounts: 0,
        totalItems: 0, 
        totalProfit: 0, 
        realizedProfit: 0,
        pendingProfit: 0,
        profitPercentage: 0 
      });
    }
  };

  // Format time for table (AM/PM)
  const formatDateTime = (dateStr) => {
    try {
      const date = new Date(dateStr);
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${date.toLocaleDateString()} ${hours}:${minutes} ${ampm}`;
    } catch (error) {
      return "Invalid Date";
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString("en-PK", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  // Format Y-Axis for charts
  const formatYAxis = (val) => {
    if (val >= 1000000) return `Rs. ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `Rs. ${(val / 1000).toFixed(0)}k`;
    return `Rs. ${val}`;
  };

  // View sale details
  const viewSaleDetails = async (saleId) => {
    try {
      const details = await window.api.getSaleDetails(saleId);
      setSelectedSale(details);
      setShowSaleDetails(true);
    } catch (err) {
      console.error("Error loading sale details:", err);
      showToast("Error loading sale details.", "error");
    }
  };

  // Delete sale record
  const deleteSaleRecord = async (saleId) => {
    saleId = Number(saleId);

    if (!saleId || isNaN(saleId)) {
      showToast("Invalid sale ID", "error");
      return;
    }

    const targetSale = sales.find((s) => Number(s.id) === saleId);
    let confirmMsg = "Are you sure you want to delete this sale? This will restore product stock.";
    if (targetSale && (targetSale.payment_type === "credit" || targetSale.customer_id)) {
      const custName = targetSale.customer_name || "Customer";
      const billTotal = targetSale.discounted_total !== undefined ? targetSale.discounted_total : targetSale.total;
      const upfront = Number(targetSale.amount_paid || 0);
      const remainingDue = Number(targetSale.amount_due || (billTotal - upfront));

      confirmMsg = `⚠️ CAUTION (ادھار سیل): You are deleting an UDHAAR / CREDIT SALE!\n\n` +
        `• Customer: ${custName}\n` +
        `• Invoice Total: Rs. ${Number(billTotal).toLocaleString()}\n` +
        `• Upfront Paid at checkout: Rs. ${upfront.toLocaleString()}\n` +
        `• Remaining Debt: Rs. ${remainingDue.toLocaleString()}\n\n` +
        `Deleting this sale will:\n` +
        `1. Restore items back to product inventory stock.\n` +
        `2. REMOVE this invoice debt from ${custName}'s Digital Khata ledger.\n` +
        `3. Reverse any upfront payment recorded at checkout.\n\n` +
        `Do you want to proceed?`;
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const result = await window.api.deleteSale(saleId);

      if (result.success) {
        setShowSaleDetails(false);
        showToast("Sale deleted successfully!", "success");
        loadSales();
      } else {
        showToast("Failed to delete sale.", "error");
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Error deleting sale.", "error");
    }
  };

  // Custom tooltip for Bar chart
  const BarChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-lg text-xs space-y-1.5 min-w-[170px]">
          <p className="font-bold text-gray-800 border-b border-gray-100 pb-1">{label}</p>
          <div className="flex justify-between items-center text-blue-700">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span> Sales:
            </span>
            <span className="font-bold">Rs. {formatCurrency(data.sales)}</span>
          </div>
          <div className="flex justify-between items-center text-amber-700">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Cost:
            </span>
            <span className="font-bold">Rs. {formatCurrency(data.cost)}</span>
          </div>
          {data.rawProfit >= 0 ? (
            <div className="flex justify-between items-center text-emerald-700">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Profit:
              </span>
              <span className="font-bold">Rs. {formatCurrency(data.profit)}</span>
            </div>
          ) : (
            <div className="flex justify-between items-center text-rose-700">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600"></span> Loss:
              </span>
              <span className="font-bold">Rs. {formatCurrency(data.loss)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-gray-500 pt-1 border-t border-gray-100 text-[11px]">
            <span>Margin:</span>
            <span className="font-semibold text-gray-700">{data.margin}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for Pie chart
  const PieChartTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white px-3.5 py-2.5 border border-gray-200 rounded-lg shadow-lg text-xs space-y-1.5 min-w-[160px]">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.fill }} />
            <span className="font-bold text-gray-800">{data.category_name}</span>
          </div>
          <div className="flex justify-between items-center text-gray-700">
            <span>Sales:</span>
            <span className="font-bold text-gray-900">Rs. {formatCurrency(data.total_sales)}</span>
          </div>
          <div className="flex justify-between items-center text-blue-700">
            <span>Share:</span>
            <span className="font-semibold">{data.percentage}%</span>
          </div>
          <div className="flex justify-between items-center text-gray-500 text-[11px] pt-1 border-t border-gray-100">
            <span>Items sold:</span>
            <span>{data.total_quantity} pcs</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate formatted category data with colors and percentages
  const totalCategorySales = categoryData.reduce((sum, c) => sum + (c.total_sales || 0), 0);
  const formattedCategoryData = categoryData.map((item, idx) => ({
    ...item,
    fill: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
    percentage: totalCategorySales > 0 ? ((item.total_sales / totalCategorySales) * 100).toFixed(1) : "0.0"
  }));

  return (
    <div className="p-6">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
            toast.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-emerald-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Sales & Analytics</h2>
        <p className="text-sm text-gray-500 mt-0.5">Review store transactions, financial margins, and category performance</p>
      </div>

      {/* Date Filters */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {[
          ["all", "All Time"],
          ["today", "Today"],
          ["7days", "Last 7 Days"],
          ["month", "This Month"],
          ["year", "This Year"],
          ["custom", "Custom Range"],
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => handleFilterChange(val)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === val
                ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20"
                : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-xs"
            }`}
          >
            {label}
          </button>
        ))}

        {filter === "custom" && (
          <div className="flex flex-wrap items-center gap-2 ml-2 bg-white p-2 rounded-lg border border-gray-200 shadow-xs">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 font-medium">From:</label>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                className="text-xs px-2.5 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 font-medium">To:</label>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                className="text-xs px-2.5 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleCustomSearch}
              className="px-3.5 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Error State */}
      {loadError && (
        <div className="p-4 mb-5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-rose-700">
            <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{loadError}</span>
          </div>
          <button
            onClick={() => loadSales(filter === "custom" ? customRange : null)}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {/* Card 1: Gross Sales */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Gross Sales</span>
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          </div>
          <div className="text-lg font-bold text-gray-900 tracking-tight">
            Rs. {formatCurrency(summary.totalSales)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Before discounts</p>
        </div>

        {/* Card 2: Total Discounts */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Discounts</span>
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          </div>
          <div className="text-lg font-bold text-amber-600 tracking-tight">
            -Rs. {formatCurrency(summary.totalDiscounts)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Saved by customers</p>
        </div>

        {/* Card 3: Net Sales */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Net Sales</span>
            <span className="w-2 h-2 rounded-full bg-blue-700"></span>
          </div>
          <div className="text-lg font-bold text-blue-700 tracking-tight">
            Rs. {formatCurrency(summary.totalDiscountedSales)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Billed revenue</p>
        </div>

        {/* Card 4: Realized Cash Profit */}
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-sm hover:shadow transition-shadow bg-gradient-to-b from-white to-emerald-50/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Realized Profit</span>
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          </div>
          <div className={`text-lg font-bold tracking-tight ${(summary.realizedProfit || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {(summary.realizedProfit || 0) >= 0 ? `Rs. ${formatCurrency(summary.realizedProfit)}` : `-Rs. ${formatCurrency(Math.abs(summary.realizedProfit))}`}
          </div>
          <p className="text-[10px] text-emerald-700 font-medium mt-1">
            Cash received in pocket
          </p>
        </div>

        {/* Card 5: Left Out / Udhaar Profit */}
        <div className="bg-white p-3.5 rounded-xl border border-purple-200 shadow-sm hover:shadow transition-shadow bg-gradient-to-b from-white to-purple-50/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Udhaar Profit</span>
            <span className="w-2 h-2 rounded-full bg-purple-600"></span>
          </div>
          <div className="text-lg font-bold text-purple-700 tracking-tight">
            Rs. {formatCurrency(summary.pendingProfit || 0)}
          </div>
          <p className="text-[10px] text-purple-600 font-medium mt-1">
            Left out (pending collection)
          </p>
        </div>

        {/* Card 6: Profit Margin */}
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Profit Margin</span>
            <span className={`w-2 h-2 rounded-full ${(summary.realizedProfit || 0) >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}></span>
          </div>
          <div className={`text-lg font-bold tracking-tight ${(summary.realizedProfit || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {(summary.realizedProfit || 0) >= 0 ? `+${summary.profitPercentage.toFixed(1)}%` : `-${Math.abs(summary.profitPercentage).toFixed(1)}%`}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">% on realized cash</p>
        </div>
      </div>

      {/* Sales & Profit Overview Chart Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6 relative">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Updating analytics...</span>
            </div>
          </div>
        )}

        {/* Chart Header & Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-800 tracking-tight">Sales & Profit Overview</h3>
            <p className="text-xs text-gray-500 mt-0.5">Track your sales, costs, profit and loss</p>
          </div>

          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 self-start sm:self-auto shadow-xs">
            <button
              onClick={() => setChartView("bar")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                chartView === "bar"
                  ? "bg-white text-blue-700 shadow-xs font-semibold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Bar Chart
            </button>
            <button
              onClick={() => setChartView("pie")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                chartView === "pie"
                  ? "bg-white text-blue-700 shadow-xs font-semibold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              Pie Chart
            </button>
          </div>
        </div>

        {/* View 1: Bar Chart */}
        {chartView === "bar" && (
          <div>
            {chartData.length > 0 ? (
              <>
                {/* Metric Legend */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 mb-3 px-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-600"></span> Sales
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span> Cost
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span> Profit
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-600"></span> Loss
                  </span>
                </div>

                <ResponsiveContainer width="100%" height={320}>
                  <BarChart 
                    data={chartData} 
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={{ stroke: "#e2e8f0" }}
                    />
                    <YAxis 
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={{ stroke: "#e2e8f0" }}
                      tickFormatter={formatYAxis}
                    />
                    <Tooltip content={<BarChartTooltip />} />
                    <Bar 
                      dataKey="sales" 
                      name="Sales"
                      radius={[4, 4, 0, 0]}
                      fill="#2563eb"
                      maxBarSize={36}
                    />
                    <Bar 
                      dataKey="cost" 
                      name="Cost"
                      radius={[4, 4, 0, 0]}
                      fill="#f59e0b"
                      maxBarSize={36}
                    />
                    <Bar 
                      dataKey="profit" 
                      name="Profit"
                      radius={[4, 4, 0, 0]}
                      fill="#16a34a"
                      maxBarSize={36}
                    />
                    <Bar 
                      dataKey="loss" 
                      name="Loss"
                      radius={[4, 4, 0, 0]}
                      fill="#dc2626"
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800">No sales data available for this period</p>
                <p className="text-xs text-gray-500 mt-1">Try selecting another date range</p>
              </div>
            )}
          </div>
        )}

        {/* View 2: Pie / Donut Chart */}
        {chartView === "pie" && (
          <div>
            {formattedCategoryData.length > 0 ? (
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-2">
                {/* Donut Chart with Centered Total Sales */}
                <div className="relative w-full md:w-1/2 flex items-center justify-center min-h-[260px]">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Tooltip content={<PieChartTooltip />} />
                      <Pie
                        data={formattedCategoryData}
                        dataKey="total_sales"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        innerRadius={68}
                        outerRadius={100}
                        paddingAngle={3}
                        stroke="#fff"
                        strokeWidth={2}
                      >
                        {formattedCategoryData.map((entry, index) => (
                          <Cell key={`cat-cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text inside Donut */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Sales</span>
                    <span className="text-base sm:text-lg font-bold text-gray-900">
                      Rs. {formatCurrency(totalCategorySales)}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {formattedCategoryData.length} {formattedCategoryData.length === 1 ? "Category" : "Categories"}
                    </span>
                  </div>
                </div>

                {/* Category Breakdown Table / List */}
                <div className="w-full md:w-1/2 flex flex-col justify-center border-t md:border-t-0 md:border-l border-gray-100 md:pl-6 pt-4 md:pt-0">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5 flex justify-between items-center">
                    <span>Category</span>
                    <div className="flex gap-4">
                      <span>Share</span>
                      <span className="w-20 text-right">Sales</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {formattedCategoryData.map((cat, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.fill }}
                          />
                          <span className="font-medium text-gray-700 truncate" title={cat.category_name}>
                            {cat.category_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <span className="text-gray-500 font-medium">{cat.percentage}%</span>
                          <span className="w-20 text-right font-semibold text-gray-900">
                            Rs. {formatCurrency(cat.total_sales)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 border border-dashed border-gray-200 rounded-xl bg-gray-50/50 p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800">No category breakdown available</p>
                <p className="text-xs text-gray-500 mt-1">Try selecting another date range</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sales Table */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Sales Records</h3>
          <span className="text-sm text-gray-500">
            Showing {sales.length} transaction{sales.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        {sales.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-sm font-semibold text-gray-700 border-b">Date & Time</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Original Total</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Discount</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Final Total</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Profit (Realized)</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Margin %</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Received</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Change</th>
                  <th className="p-3 text-right text-sm font-semibold text-gray-700 border-b">Items</th>
                  <th className="p-3 text-center text-sm font-semibold text-gray-700 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const finalTotal = s.discounted_total || s.total || 0;
                  const discountAmount = s.discount_amount || 0;
                  const discountPercent = s.discount || 0;
                  const realizedProfit = s.realized_profit !== undefined ? s.realized_profit : (s.total_profit || 0);
                  const profitMargin = finalTotal > 0 ? (realizedProfit / finalTotal) * 100 : 0;
                  
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 border-b">
                      <td className="p-3 text-sm text-gray-600">{formatDateTime(s.date)}</td>
                      <td className="p-3 text-sm text-right font-medium text-gray-900">
                        {formatCurrency(s.total)}
                      </td>
                      <td className="p-3 text-sm text-right">
                        {discountPercent > 0 ? (
                          <div>
                            <div className="text-red-600 font-medium">-{formatCurrency(discountAmount)}</div>
                            <div className="text-xs text-gray-500">({discountPercent}%)</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-right font-medium text-green-600">
                        {formatCurrency(finalTotal)}
                      </td>
                      <td className="p-3 text-sm text-right">
                        <div className={`font-medium ${realizedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(realizedProfit)}
                        </div>
                        {(s.pending_profit || 0) > 0 && (
                          <div className="text-[10px] text-purple-600 font-semibold" title="Uncollected Udhaar Profit">
                            (+Rs. {formatCurrency(s.pending_profit)} udhaar)
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-sm text-right text-gray-600">
                        {profitMargin.toFixed(1)}%
                      </td>
                      <td className="p-3 text-sm text-right text-gray-600">
                        {formatCurrency(s.received)}
                      </td>
                      <td className="p-3 text-sm text-right text-gray-600">
                        {formatCurrency(s.change)}
                      </td>
                      <td className="p-3 text-sm text-right text-gray-600">
                        {s.total_items || 0}
                      </td>
                      <td className="p-3 text-sm text-center">
                        <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => viewSaleDetails(s.id)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
                        >
                          View
                        </button>

                        <button
                          onClick={() => deleteSaleRecord(Number(s.id))}
                          className="bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>

                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No sales records found for the selected period.</p>
          </div>
        )}
      </div>

      {/* Sale Details Modal */}
      {showSaleDetails && selectedSale && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-800">Sale Details</h3>
                <div className="flex gap-3">
                <button
                  onClick={() => deleteSaleRecord(Number(selectedSale.sale.id))}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Delete Sale
                </button>

                <button
                  onClick={() => setShowSaleDetails(false)}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Close
                </button>
              </div>

              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p><strong>Date:</strong> {formatDateTime(selectedSale.sale.date)}</p>
                  <p><strong>Customer:</strong> {selectedSale.sale.customer_name || 'Walk-in Customer'}</p>
                </div>
                <div>
                  <p><strong>Original Total:</strong> Rs. {formatCurrency(selectedSale.sale.total)}</p>
                  {selectedSale.sale.discount > 0 && (
                    <>
                      <p><strong>Discount:</strong> {selectedSale.sale.discount}% (-Rs. {formatCurrency(selectedSale.sale.discount_amount)})</p>
                      <p><strong>Final Total:</strong> Rs. {formatCurrency(selectedSale.sale.discounted_total)}</p>
                    </>
                  )}
                  <p>
                    <strong>Realized Profit:</strong> <span className="text-green-600 font-semibold">Rs. {formatCurrency(selectedSale.sale.realized_profit !== undefined ? selectedSale.sale.realized_profit : selectedSale.sale.total_profit || 0)}</span>
                  </p>
                  {(selectedSale.sale.pending_profit || 0) > 0 && (
                    <p className="text-purple-600 font-medium">
                      <strong>Pending Udhaar Profit:</strong> Rs. {formatCurrency(selectedSale.sale.pending_profit)}
                    </p>
                  )}
                  {selectedSale.sale.note && (
                    <p><strong>Note:</strong> {selectedSale.sale.note}</p>
                  )}
                </div>
              </div>

              <h4 className="font-semibold mb-3">Items Sold</h4>
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left text-sm font-semibold border">Product</th>
                    <th className="p-2 text-right text-sm font-semibold border">Quantity</th>
                    <th className="p-2 text-right text-sm font-semibold border">Price</th>
                    <th className="p-2 text-right text-sm font-semibold border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items.map((item, index) => (
                    <tr key={index} className="border">
                      <td className="p-2 text-sm border font-medium">{item.product_name}</td>
                      <td className="p-2 text-sm text-right border">
                        {item.quantity} {item.unit && item.unit !== 'pcs' ? item.unit : ''}
                      </td>
                      <td className="p-2 text-sm text-right border">
                        Rs. {formatCurrency(item.price)} {item.unit && item.unit !== 'pcs' ? `/${item.unit}` : ''}
                      </td>
                      <td className="p-2 text-sm text-right border font-bold text-gray-900">
                        Rs. {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {toast.show && (
        <div
        className={`fixed bottom-6 right-6 px-4 py-3 rounded shadow-lg text-white z-50
        ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}
        >
        {toast.message}
    </div>
  )}
      
    </div>
    
  );
}

export default Sales;