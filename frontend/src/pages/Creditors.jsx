// frontend/src/pages/Creditors.jsx
import React, { useEffect, useState } from "react";

export default function Creditors() {
  const [creditors, setCreditors] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCreditorForPayment, setSelectedCreditorForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [notification, setNotification] = useState({ show: false, message: "", type: "" });

  useEffect(() => {
    loadCreditors();
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: "", type: "" });
    }, 3000);
  };

  const formatMoney = (value) => Number(value || 0).toFixed(2);

  async function loadCreditors() {
    try {
      const data = await window.api.getCreditors();
      setCreditors(data || []);
    } catch (err) {
      console.error("Error loading creditors:", err);
      showNotification("Failed to load creditors.", "error");
    } finally {
      setLoading(false);
    }
  }

  function openPaymentModal(creditor) {
    setSelectedCreditorForPayment(creditor);
    setPaymentAmount("");
    setPaymentNote("");
    setShowPaymentModal(true);
  }

  async function handleAddPayment(e) {
    e.preventDefault();

    const paymentValue = Number(paymentAmount);
    if (!paymentValue || paymentValue <= 0) {
      showNotification("Please enter a valid payment amount.", "error");
      return;
    }

    const balance = Number(selectedCreditorForPayment?.balance || 0);
    if (paymentValue > balance) {
      showNotification("Payment cannot exceed outstanding balance.", "error");
      return;
    }

    try {
      await window.api.addVendorPayment({
        vendor_id: selectedCreditorForPayment.id,
        amount: paymentValue,
        note: paymentNote || "Clear due",
      });

      showNotification("Payment recorded successfully!", "success");
      setShowPaymentModal(false);
      setSelectedCreditorForPayment(null);
      setPaymentAmount("");
      setPaymentNote("");
      await loadCreditors();
    } catch (err) {
      console.error("Failed to add payment:", err);
      showNotification("Failed to record payment.", "error");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Creditors</h1>

      {notification.show && (
        <div
          className={`fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transform transition-all duration-300 ${
            notification.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          <div className="flex items-center">{notification.message}</div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading creditors...</p>
      ) : creditors.length === 0 ? (
        <div className="text-center text-gray-500 bg-white rounded-lg shadow p-8">
          <p className="text-lg font-semibold">No outstanding balances.</p>
          <p className="mt-2">Vendors appear here when their balance is greater than zero.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3 text-left">Vendor</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3 text-left">Last Activity</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {creditors.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.contact || "-"}</td>
                  <td className="p-3 text-right font-semibold">Rs. {formatMoney(c.balance)}</td>
                  <td className="p-3">
                    {c.last_transaction_date
                      ? new Date(c.last_transaction_date).toLocaleString()
                      : "-"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => openPaymentModal(c)}
                      className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded transition duration-200"
                    >
                      Pay Now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPaymentModal && selectedCreditorForPayment && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Clear Due</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-500 hover:text-gray-700 transition duration-150"
              >
                <span className="text-xl">x</span>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-semibold">{selectedCreditorForPayment.name}</p>
              <p>Outstanding: Rs. {formatMoney(selectedCreditorForPayment.balance)}</p>
            </div>

            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount *</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter amount to pay"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (Optional)</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Payment note"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition duration-200"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
