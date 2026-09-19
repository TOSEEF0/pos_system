// frontend/src/pages/Customers.jsx
import React, { useEffect, useState, useMemo } from "react";
import toast, { Toaster } from "react-hot-toast";

export default function Customers({ setCurrentPage, setSelectedCustomerForSale }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // 'all', 'dues', 'cleared', 'limit_exceeded'
  const [sort, setSort] = useState("highest_due");
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    customersWithDues: 0,
    totalOutstanding: 0,
    paymentsToday: 0,
    creditSalesToday: 0,
    clearedAccounts: 0
  });

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSaleDetailsModal, setShowSaleDetailsModal] = useState(false);

  // Selected records
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerLedger, setCustomerLedger] = useState([]);
  const [selectedSaleDetails, setSelectedSaleDetails] = useState(null);

  // Add customer form state
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    alternate_phone: "",
    address: "",
    notes: "",
    credit_limit: "",
    opening_balance: ""
  });
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Balance adjustment state
  const [adjustType, setAdjustType] = useState("debit"); // debit = add due, credit = reduce due
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // Load Customers & Summary
  useEffect(() => {
    loadCustomers();
    loadSummary();
  }, [filter, sort]);

  const formatMoney = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const loadSummary = async () => {
    try {
      if (window.api?.getKhataSummary) {
        const data = await window.api.getKhataSummary();
        if (data) setSummary(data);
      }
    } catch (err) {
      console.error("Error loading summary:", err);
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      if (window.api?.getCustomers) {
        const data = await window.api.getCustomers({ filter, search, sort });
        setCustomers(data || []);
      }
    } catch (err) {
      console.error("Error loading customers:", err);
      toast.error("Failed to load customers.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadCustomers();
  };

  // Duplicate phone live check
  const handlePhoneChange = async (e) => {
    const val = e.target.value;
    setNewCustomer((prev) => ({ ...prev, phone: val }));
    if (val.trim().length >= 7 && window.api?.checkDuplicatePhone) {
      try {
        const existing = await window.api.checkDuplicatePhone(val);
        if (existing) {
          setDuplicateWarning(existing);
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {
        console.error("Duplicate check error:", err);
      }
    } else {
      setDuplicateWarning(null);
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name.trim()) {
      toast.error("Please enter a customer name.");
      return;
    }

    try {
      const created = await window.api.addCustomer(newCustomer);
      toast.success(`Customer "${created.name}" created successfully!`);
      setShowAddModal(false);
      setNewCustomer({
        name: "",
        phone: "",
        alternate_phone: "",
        address: "",
        notes: "",
        credit_limit: "",
        opening_balance: ""
      });
      setDuplicateWarning(null);
      await loadCustomers();
      await loadSummary();
      openProfile(created);
    } catch (err) {
      toast.error(err.message || "Failed to create customer.");
    }
  };

  // Open Profile & Ledger
  const openProfile = async (cust) => {
    setSelectedCustomer(cust);
    setShowProfileModal(true);
    try {
      if (window.api?.getCustomerLedger) {
        const ledger = await window.api.getCustomerLedger(cust.id);
        setCustomerLedger(ledger || []);
      }
    } catch (err) {
      console.error("Error loading ledger:", err);
    }
  };

  const refreshSelectedCustomer = async () => {
    if (!selectedCustomer) return;
    try {
      const updated = await window.api.getCustomerById(selectedCustomer.id);
      if (updated) setSelectedCustomer(updated);
      const ledger = await window.api.getCustomerLedger(selectedCustomer.id);
      setCustomerLedger(ledger || []);
      await loadCustomers();
      await loadSummary();
    } catch (err) {
      console.error(err);
    }
  };

  // Open Payment Modal
  const openPaymentModal = (cust) => {
    setSelectedCustomer(cust);
    setPaymentAmount("");
    setPaymentNote("");
    setPaymentMethod("cash");
    setShowPaymentModal(true);
  };

  // Submit Payment Collection
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (isSubmittingPayment) return; // double-click protection

    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }

    if (selectedCustomer.current_due > 0 && amt > selectedCustomer.current_due) {
      toast.error(`Payment cannot exceed outstanding balance of Rs. ${formatMoney(selectedCustomer.current_due)}`);
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await window.api.addCustomerPayment({
        customer_id: selectedCustomer.id,
        amount: amt,
        payment_method: paymentMethod,
        note: paymentNote,
        received_by: "Cashier"
      });

      toast.success(`Payment of Rs. ${formatMoney(amt)} recorded!`);
      setShowPaymentModal(false);

      // Offer receipt printing
      if (window.api?.printPaymentReceipt) {
        window.api.printPaymentReceipt(res);
      }

      await refreshSelectedCustomer();
    } catch (err) {
      toast.error(err.message || "Payment recording failed.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Submit Manual Adjustment
  const handleSubmitAdjust = async (e) => {
    e.preventDefault();
    if (isSubmittingAdjust) return;

    const amt = Number(adjustAmount);
    if (!amt || amt <= 0) {
      toast.error("Please enter a valid adjustment amount.");
      return;
    }
    if (!adjustNote.trim()) {
      toast.error("A reason note is required for manual balance adjustment.");
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      await window.api.adjustCustomerBalance({
        customer_id: selectedCustomer.id,
        amount: amt,
        type: adjustType,
        note: adjustNote,
        user: "Admin"
      });

      toast.success("Balance adjusted successfully!");
      setShowAdjustModal(false);
      setAdjustAmount("");
      setAdjustNote("");
      await refreshSelectedCustomer();
    } catch (err) {
      toast.error(err.message || "Adjustment failed.");
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Start New Credit Sale for Customer
  const handleStartCreditSale = (cust) => {
    if (setSelectedCustomerForSale) {
      setSelectedCustomerForSale(cust);
    }
    if (setCurrentPage) {
      setCurrentPage("cashier");
    }
  };

  // Print Statement
  const handlePrintStatement = () => {
    if (!selectedCustomer) return;
    if (window.api?.printCustomerStatement) {
      window.api.printCustomerStatement({
        customer: selectedCustomer,
        ledger: customerLedger
      });
    }
  };

  // Open Invoice details from ledger
  const handleViewInvoice = async (refId) => {
    if (!refId || !refId.startsWith("INV-")) return;
    const saleId = Number(refId.replace("INV-", ""));
    try {
      const details = await window.api.getSaleDetails(saleId);
      if (details?.sale) {
        setSelectedSaleDetails(details);
        setShowSaleDetailsModal(true);
      }
    } catch (err) {
      toast.error("Could not load invoice details.");
    }
  };

  // Paper Khata Import
  const handleImportKhata = async () => {
    try {
      if (window.api?.importKhataData) {
        const res = await window.api.importKhataData();
        if (res?.canceled) return;
        if (res?.success) {
          toast.success(`Imported: ${res.created} customers, Skipped: ${res.skipped}, Duplicates: ${res.duplicates}`);
          await loadCustomers();
          await loadSummary();
        } else {
          toast.error(res?.error || "Import failed");
        }
      }
    } catch (err) {
      toast.error("Import failed");
    }
  };

  // Export Khata
  const handleExportKhata = async () => {
    try {
      if (window.api?.exportCustomersData) {
        const res = await window.api.exportCustomersData();
        if (res?.canceled) return;
        if (res?.success) {
          toast.success("Exported customers ledger successfully!");
        } else {
          toast.error(res?.error || "Export failed");
        }
      }
    } catch (err) {
      toast.error("Export failed");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <Toaster position="top-right" />

      {/* HEADER & TOP ACTIONS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>📒</span> Digital Khata / Customers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage customer accounts, credit sales (Udhaar), payments, and transaction history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleImportKhata}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            📥 Import Paper Khata
          </button>
          <button
            onClick={handleExportKhata}
            className="px-3.5 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition shadow-sm"
          >
            📤 Export Ledger
          </button>
          <button
            onClick={() => {
              setDuplicateWarning(null);
              setShowAddModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-md flex items-center gap-1.5"
          >
            <span>+</span> Add New Customer
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/60 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Customers</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{summary.totalCustomers}</div>
        </div>

        <div className="bg-red-50/80 backdrop-blur-md p-4 rounded-2xl border border-red-200 shadow-sm">
          <div className="text-xs font-medium text-red-600 uppercase tracking-wider">With Dues</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{summary.customersWithDues}</div>
        </div>

        <div className="bg-amber-50/80 backdrop-blur-md p-4 rounded-2xl border border-amber-200 shadow-sm col-span-2 sm:col-span-1">
          <div className="text-xs font-medium text-amber-700 uppercase tracking-wider">Total Outstanding</div>
          <div className="text-xl font-bold text-amber-900 mt-1">Rs. {formatMoney(summary.totalOutstanding)}</div>
        </div>

        <div className="bg-green-50/80 backdrop-blur-md p-4 rounded-2xl border border-green-200 shadow-sm">
          <div className="text-xs font-medium text-green-700 uppercase tracking-wider">Payments Today</div>
          <div className="text-xl font-bold text-green-800 mt-1">Rs. {formatMoney(summary.paymentsToday)}</div>
        </div>

        <div className="bg-blue-50/80 backdrop-blur-md p-4 rounded-2xl border border-blue-200 shadow-sm">
          <div className="text-xs font-medium text-blue-700 uppercase tracking-wider">Credit Sales Today</div>
          <div className="text-xl font-bold text-blue-800 mt-1">Rs. {formatMoney(summary.creditSalesToday)}</div>
        </div>

        <div className="bg-emerald-50/80 backdrop-blur-md p-4 rounded-2xl border border-emerald-200 shadow-sm">
          <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Cleared Accounts</div>
          <div className="text-2xl font-bold text-emerald-800 mt-1">{summary.clearedAccounts}</div>
        </div>
      </div>

      {/* FILTER TABS & SEARCH BAR */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* TABS */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All Customers
            </button>
            <button
              onClick={() => setFilter("dues")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                filter === "dues" ? "bg-red-600 text-white shadow-sm" : "text-red-600 hover:text-red-700"
              }`}
            >
              <span>🚨</span> Who Owes Me Money?
            </button>
            <button
              onClick={() => setFilter("cleared")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "cleared" ? "bg-white text-green-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              ✓ Cleared
            </button>
            <button
              onClick={() => setFilter("limit_exceeded")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "limit_exceeded" ? "bg-white text-amber-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              ⚠️ Limit Exceeded
            </button>
          </div>

          {/* SORT */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 font-medium">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 outline-none"
            >
              <option value="highest_due">Highest Due First</option>
              <option value="lowest_due">Lowest Due First</option>
              <option value="recent">Recently Active</option>
              <option value="oldest_due">Oldest Unpaid Activity</option>
              <option value="name_asc">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* SEARCH BAR */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Search by customer name, phone number, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                window.api.getCustomers({ filter, search: "", sort }).then(setCustomers);
              }}
              className="bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm hover:bg-gray-300"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* CUSTOMER LIST TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mb-2"></div>
            <p>Loading customer accounts...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <h3 className="text-lg font-semibold text-gray-800">No customer records found</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              {filter === "dues"
                ? "All customer accounts are clear! No outstanding dues at this moment."
                : "Add your first customer to start tracking credit sales and payments."}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition"
            >
              + Add Customer
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200 font-semibold text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3.5 pl-5">Customer</th>
                  <th className="p-3.5">Contact / Phone</th>
                  <th className="p-3.5 text-right">Credit Limit</th>
                  <th className="p-3.5 text-right">Total Credit</th>
                  <th className="p-3.5 text-right">Total Paid</th>
                  <th className="p-3.5 text-right">Current Due</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((c) => {
                  const hasDue = c.current_due > 0;
                  const isExceeded = c.credit_limit > 0 && c.current_due > c.credit_limit;

                  return (
                    <tr key={c.id} className="hover:bg-blue-50/40 transition duration-150">
                      <td className="p-3.5 pl-5 font-semibold text-gray-900 cursor-pointer" onClick={() => openProfile(c)}>
                        <div className="hover:text-blue-600">{c.name}</div>
                        {c.address && <div className="text-xs text-gray-500 font-normal truncate max-w-xs">{c.address}</div>}
                      </td>

                      <td className="p-3.5 text-gray-700">
                        <div>{c.phone || "-"}</div>
                        {c.alternate_phone && <div className="text-xs text-gray-500">{c.alternate_phone}</div>}
                      </td>

                      <td className="p-3.5 text-right text-gray-600">
                        {c.credit_limit > 0 ? `Rs. ${formatMoney(c.credit_limit)}` : "-"}
                      </td>

                      <td className="p-3.5 text-right text-gray-700">
                        Rs. {formatMoney(c.total_credit)}
                      </td>

                      <td className="p-3.5 text-right text-green-700">
                        Rs. {formatMoney(c.total_paid)}
                      </td>

                      <td className="p-3.5 text-right">
                        <span
                          className={`text-base font-bold ${
                            hasDue ? "text-red-600" : "text-gray-400"
                          }`}
                        >
                          Rs. {formatMoney(c.current_due)}
                        </span>
                      </td>

                      <td className="p-3.5 text-center">
                        {isExceeded ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                            LIMIT OVER
                          </span>
                        ) : hasDue ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            DUES
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            ✓ CLEARED
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-right pr-5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openProfile(c)}
                            className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium"
                          >
                            Profile
                          </button>

                          {hasDue && (
                            <button
                              onClick={() => openPaymentModal(c)}
                              className="px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
                            >
                              Pay
                            </button>
                          )}

                          <button
                            onClick={() => handleStartCreditSale(c)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                          >
                            + Credit Sale
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ADD CUSTOMER MODAL (WITH LIVE DUPLICATE PHONE DETECTION) */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-xl font-bold text-gray-900">Add New Customer</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {duplicateWarning && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <span>⚠️</span> Customer with this phone already exists!
                </div>
                <div className="text-xs text-amber-900 space-y-1">
                  <div><b>Name:</b> {duplicateWarning.name}</div>
                  <div><b>Phone:</b> {duplicateWarning.phone}</div>
                  <div><b>Current Due:</b> Rs. {formatMoney(duplicateWarning.current_due)}</div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      openProfile(duplicateWarning);
                    }}
                    className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
                  >
                    Open Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-300"
                  >
                    Ignore &amp; Continue
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Muhammad Ali"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Mobile / Phone</label>
                  <input
                    type="text"
                    placeholder="0300-1234567"
                    value={newCustomer.phone}
                    onChange={handlePhoneChange}
                    className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Alternate Phone</label>
                  <input
                    type="text"
                    placeholder="Optional phone"
                    value={newCustomer.alternate_phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, alternate_phone: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Opening Udhaar / Balance (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Existing paper khata balance"
                    value={newCustomer.opening_balance}
                    onChange={(e) => setNewCustomer({ ...newCustomer, opening_balance: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-gray-500">From old manual register</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Credit Limit (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 = No limit"
                    value={newCustomer.credit_limit}
                    onChange={(e) => setNewCustomer({ ...newCustomer, credit_limit: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-gray-500">Max allowed debt</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Street / Shop / Sector"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notes / Shop Details</label>
                <textarea
                  rows="2"
                  placeholder="e.g. Pays every Friday, Neighbour shopkeeper"
                  value={newCustomer.notes || ""}
                  onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOMER PROFILE & FULL CHRONOLOGICAL AUDIT LEDGER */}
      {/* ========================================================================= */}
      {showProfileModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* PROFILE HEADER */}
            <div className="p-6 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold">{selectedCustomer.name}</h2>
                  {selectedCustomer.current_due > 0 ? (
                    <span className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-bold shadow">
                      DUES: Rs. {formatMoney(selectedCustomer.current_due)}
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-emerald-500 text-white rounded-full text-xs font-bold shadow">
                      ✓ ACCOUNT CLEARED
                    </span>
                  )}
                </div>
                <p className="text-blue-200 text-sm mt-1">
                  📞 {selectedCustomer.phone || "No phone"} {selectedCustomer.address ? `• 📍 ${selectedCustomer.address}` : ""}
                </p>
              </div>

              {/* ACTION BUTTONS IN PROFILE */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openPaymentModal(selectedCustomer)}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-sm shadow transition"
                >
                  💵 Receive Payment
                </button>
                <button
                  onClick={() => {
                    setShowProfileModal(false);
                    handleStartCreditSale(selectedCustomer);
                  }}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl text-sm shadow transition"
                >
                  🛒 + Credit Sale
                </button>
                <button
                  onClick={() => setShowAdjustModal(true)}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-xl text-sm transition"
                >
                  ⚙️ Adjust Balance
                </button>
                <button
                  onClick={handlePrintStatement}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-xl text-sm transition"
                >
                  🖨️ Statement
                </button>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="p-2 text-white/70 hover:text-white text-xl font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* BALANCE STATS BAR */}
            <div className="grid grid-cols-2 md:grid-cols-4 bg-gray-50 border-b border-gray-200 p-4 text-center">
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold">Total Credit Given</span>
                <p className="text-lg font-bold text-gray-800">Rs. {formatMoney(selectedCustomer.total_credit)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold">Total Payments Received</span>
                <p className="text-lg font-bold text-green-700">Rs. {formatMoney(selectedCustomer.total_paid)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold">Credit Limit</span>
                <p className="text-lg font-bold text-gray-700">
                  {selectedCustomer.credit_limit > 0 ? `Rs. ${formatMoney(selectedCustomer.credit_limit)}` : "No Limit"}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase font-semibold">Current Balance Due</span>
                <p className={`text-xl font-extrabold ${selectedCustomer.current_due > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  Rs. {formatMoney(selectedCustomer.current_due)}
                </p>
              </div>
            </div>

            {/* LEDGER TRANSACTIONS TABLE */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800">Chronological Account Ledger</h3>
                <span className="text-xs text-gray-500">Immutable financial audit record</span>
              </div>

              {customerLedger.length === 0 ? (
                <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border">
                  No transaction history recorded yet.
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-gray-100 text-gray-700 font-semibold text-xs uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Ref / Invoice</th>
                        <th className="p-3">Details / Note</th>
                        <th className="p-3 text-right">Debit (+)</th>
                        <th className="p-3 text-right">Credit (-)</th>
                        <th className="p-3 text-right pr-4">Balance After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {customerLedger.map((row) => {
                        const isSale = row.type === "CREDIT_SALE";
                        const isPayment = row.type === "PAYMENT";

                        return (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="p-3 text-gray-600 text-xs whitespace-nowrap">
                              {new Date(row.created_at).toLocaleString()}
                            </td>
                            <td className="p-3 font-semibold">
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${
                                  isSale
                                    ? "bg-blue-100 text-blue-800"
                                    : isPayment
                                    ? "bg-green-100 text-green-800"
                                    : "bg-purple-100 text-purple-800"
                                }`}
                              >
                                {row.type_label}
                              </span>
                            </td>
                            <td className="p-3 text-xs font-mono">
                              {isSale ? (
                                <button
                                  onClick={() => handleViewInvoice(row.reference_id)}
                                  className="text-blue-600 hover:underline font-bold"
                                  title="Click to view invoice items"
                                >
                                  {row.reference_id} 🔍
                                </button>
                              ) : (
                                row.reference_id || "-"
                              )}
                            </td>
                            <td className="p-3 text-gray-700 text-xs">{row.note || "-"}</td>
                            <td className="p-3 text-right font-medium text-red-600">
                              {row.debit > 0 ? `Rs. ${formatMoney(row.debit)}` : "-"}
                            </td>
                            <td className="p-3 text-right font-medium text-green-600">
                              {row.credit > 0 ? `Rs. ${formatMoney(row.credit)}` : "-"}
                            </td>
                            <td className="p-3 text-right pr-4 font-bold text-gray-900">
                              Rs. {formatMoney(row.balance_after)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* PROFILE FOOTER */}
            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button
                onClick={() => setShowProfileModal(false)}
                className="px-5 py-2 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RECEIVE PAYMENT MODAL */}
      {/* ========================================================================= */}
      {showPaymentModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-xl font-bold text-gray-900">Receive Khata Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border space-y-1">
              <div className="text-xs text-gray-500 uppercase font-semibold">Customer</div>
              <div className="text-base font-bold text-gray-900">{selectedCustomer.name}</div>
              <div className="text-xs text-gray-600">Phone: {selectedCustomer.phone || "-"}</div>
              <div className="pt-2 flex justify-between items-center text-sm border-t mt-2">
                <span>Current Outstanding Due:</span>
                <span className="font-extrabold text-red-600 text-base">
                  Rs. {formatMoney(selectedCustomer.current_due)}
                </span>
              </div>
            </div>

            {/* QUICK AMOUNT BUTTONS */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentAmount(String(selectedCustomer.current_due))}
                className="flex-1 py-1.5 px-3 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 hover:bg-blue-100"
              >
                Full Due (Rs. {formatMoney(selectedCustomer.current_due)})
              </button>
              {selectedCustomer.current_due > 100 && (
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(Math.floor(selectedCustomer.current_due / 2)))}
                  className="py-1.5 px-3 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200"
                >
                  Half (50%)
                </button>
              )}
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Amount (Rs.) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="Enter amount received"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border rounded-xl p-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer / JazzCash / EasyPaisa</option>
                  <option value="card">Card</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Note / Reference</label>
                <input
                  type="text"
                  placeholder="e.g. Paid in full / Cash in hand"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                  disabled={isSubmittingPayment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 shadow disabled:opacity-50"
                >
                  {isSubmittingPayment ? "Processing..." : "Confirm & Print Receipt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANUAL BALANCE ADJUSTMENT MODAL */}
      {/* ========================================================================= */}
      {showAdjustModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-xl font-bold text-gray-900">Manual Balance Adjustment</h2>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Use this to transfer an old paper Khata balance or apply an authorized correction. A mandatory audit log entry will be created.
            </p>

            <form onSubmit={handleSubmitAdjust} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType("debit")}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition ${
                      adjustType === "debit"
                        ? "bg-red-50 border-red-500 text-red-700 shadow-xs"
                        : "bg-white border-gray-200 text-gray-600"
                    }`}
                  >
                    Increase Due (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType("credit")}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition ${
                      adjustType === "credit"
                        ? "bg-green-50 border-green-500 text-green-700 shadow-xs"
                        : "bg-white border-gray-200 text-gray-600"
                    }`}
                  >
                    Reduce Due (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Amount (Rs.) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Enter adjustment amount"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Reason / Note *</label>
                <textarea
                  rows="2"
                  required
                  placeholder="e.g. Existing paper khata balance transferred / Store discount"
                  value={adjustNote || ""}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                  disabled={isSubmittingAdjust}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow disabled:opacity-50"
                >
                  {isSubmittingAdjust ? "Saving..." : "Apply Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INVOICE DETAILS MODAL */}
      {/* ========================================================================= */}
      {showSaleDetailsModal && selectedSaleDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-xl font-bold text-gray-900">
                Invoice Details — INV-{selectedSaleDetails.sale.id}
              </h2>
              <button
                onClick={() => setShowSaleDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded-xl">
              <div>
                <div><b>Customer:</b> {selectedSaleDetails.sale.customer_name}</div>
                <div><b>Date:</b> {new Date(selectedSaleDetails.sale.date).toLocaleString()}</div>
                <div><b>Payment Mode:</b> {String(selectedSaleDetails.sale.payment_type || "cash").toUpperCase()}</div>
              </div>
              <div className="text-right">
                <div><b>Total Bill:</b> Rs. {formatMoney(selectedSaleDetails.sale.discounted_total || selectedSaleDetails.sale.total)}</div>
                <div><b>Amount Paid:</b> Rs. {formatMoney(selectedSaleDetails.sale.amount_paid || selectedSaleDetails.sale.received || 0)}</div>
                <div><b>Amount Due:</b> Rs. {formatMoney(selectedSaleDetails.sale.amount_due || 0)}</div>
              </div>
            </div>

            <h4 className="font-bold text-sm text-gray-800">Purchased Items</h4>
            <div className="border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-100 font-semibold text-gray-700">
                  <tr>
                    <th className="p-2">Item Name</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedSaleDetails.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2">{item.product_name}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">Rs. {formatMoney(item.price)}</td>
                      <td className="p-2 text-right font-semibold">Rs. {formatMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={() => setShowSaleDetailsModal(false)}
                className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
