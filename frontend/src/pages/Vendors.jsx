// frontend/src/pages/Vendors.jsx
import React, { useEffect, useState } from "react";

const emptyForm = {
  name: "",
  contact: "",
  shop_name: "",
  address: "",
  opening_balance: "",
};

export default function Vendors({ setCurrentPage, setSelectedVendor }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);

  const [editingVendor, setEditingVendor] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendorForPayment, setSelectedVendorForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [notification, setNotification] = useState({ show: false, message: "", type: "" });

  useEffect(() => {
    loadVendors();
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: "", type: "" });
    }, 3000);
  };

  const formatMoney = (value) => Number(value || 0).toFixed(2);

  async function loadVendors() {
    try {
      const data = await window.api.getVendors();
      setVendors(data || []);
    } catch (err) {
      console.error("Error loading vendors:", err);
      showNotification("Failed to load vendors.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleAddVendor(e) {
    e.preventDefault();

    if (!form.name) {
      showNotification("Vendor name is required.", "error");
      return;
    }

    try {
      await window.api.addVendor({
        ...form,
        opening_balance: form.opening_balance === "" ? 0 : Number(form.opening_balance),
      });

      showNotification("Vendor added successfully!", "success");
      setForm(emptyForm);
      await loadVendors();
    } catch (err) {
      console.error("Failed to add vendor:", err);
      showNotification("Failed to add vendor.", "error");
    }
  }

  function openEdit(vendor) {
    setEditingVendor({
      ...vendor,
      opening_balance: vendor.opening_balance ?? "",
    });
    setShowEditModal(true);
  }

  function handleEditChange(e) {
    const { name, value } = e.target;
    setEditingVendor((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleUpdateVendor(e) {
    e.preventDefault();

    if (!editingVendor.name) {
      showNotification("Name is required.", "error");
      return;
    }

    try {
      await window.api.updateVendor({
        id: editingVendor.id,
        name: editingVendor.name,
        contact: editingVendor.contact,
        shop_name: editingVendor.shop_name,
        address: editingVendor.address,
        opening_balance:
          editingVendor.opening_balance === ""
            ? 0
            : Number(editingVendor.opening_balance),
      });

      showNotification("Vendor updated successfully!", "success");
      setShowEditModal(false);
      setEditingVendor(null);
      await loadVendors();
    } catch (err) {
      console.error("Update failed:", err);
      showNotification("Failed to update vendor.", "error");
    }
  }

  function openPaymentModal(vendor) {
    setSelectedVendorForPayment(vendor);
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

    const balance = Number(selectedVendorForPayment?.balance || 0);
    if (balance > 0 && paymentValue > balance) {
      showNotification("Payment cannot exceed outstanding balance.", "error");
      return;
    }

    try {
      await window.api.addVendorPayment({
        vendor_id: selectedVendorForPayment.id,
        amount: paymentValue,
        note: paymentNote || "Payment",
      });

      showNotification("Payment added successfully!", "success");
      setShowPaymentModal(false);
      setSelectedVendorForPayment(null);
      setPaymentAmount("");
      setPaymentNote("");
      await loadVendors();
    } catch (err) {
      console.error("Failed to add payment:", err);
      showNotification("Failed to add payment.", "error");
    }
  }

  async function handleDeleteVendor(id) {
    if (!window.confirm("Are you sure you want to delete this vendor?")) return;

    try {
      await window.api.deleteVendor(id);
      showNotification("Vendor deleted successfully!", "success");
      await loadVendors();
    } catch (err) {
      console.error("Delete failed:", err);
      showNotification("Failed to delete vendor.", "error");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Vendors</h1>

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

      <form
        onSubmit={handleAddVendor}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-white p-4 rounded-lg shadow"
      >
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Vendor Name *"
          className="border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          name="contact"
          value={form.contact}
          onChange={handleChange}
          placeholder="Contact Number"
          className="border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          name="shop_name"
          value={form.shop_name}
          onChange={handleChange}
          placeholder="Shop Name"
          className="border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="text"
          name="address"
          value={form.address}
          onChange={handleChange}
          placeholder="Address"
          className="border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <input
          type="number"
          name="opening_balance"
          value={form.opening_balance}
          onChange={handleChange}
          placeholder="Opening Balance (optional)"
          className="border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded p-2 col-span-1 md:col-span-3 transition duration-200"
        >
          Add Vendor
        </button>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading vendors...</p>
      ) : vendors.length === 0 ? (
        <div className="text-center text-gray-500 bg-white rounded-lg shadow p-8">
          <p className="text-lg font-semibold">No vendors found.</p>
          <p className="mt-2">Add your first vendor to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3 text-left">Vendor</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Shop</th>
                <th className="p-3 text-right">Opening</th>
                <th className="p-3 text-right">Purchases</th>
                <th className="p-3 text-right">Payments</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-left">Last Activity</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendors.map((v) => {
                const hasBalance = Number(v.balance) > 0;
                return (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="p-3 font-medium">{v.name}</td>
                    <td className="p-3">{v.contact || "-"}</td>
                    <td className="p-3">{v.shop_name || "-"}</td>
                    <td className="p-3 text-right">Rs. {formatMoney(v.opening_balance)}</td>
                    <td className="p-3 text-right">Rs. {formatMoney(v.total_purchases)}</td>
                    <td className="p-3 text-right">Rs. {formatMoney(v.total_payments)}</td>
                    <td className="p-3 text-right font-semibold">
                      Rs. {formatMoney(v.balance)}
                    </td>
                    <td className="p-3">
                      {v.last_transaction_date
                        ? new Date(v.last_transaction_date).toLocaleString()
                        : "-"}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(v)}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition duration-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openPaymentModal(v)}
                          disabled={!hasBalance}
                          className={`px-3 py-1 rounded transition duration-200 ${
                            hasBalance
                              ? "bg-purple-500 hover:bg-purple-600 text-white"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          }`}
                        >
                          Pay
                        </button>
                        <button
                          onClick={() => {
                            setSelectedVendor(v);
                            setCurrentPage("vendorhistory");
                          }}
                          className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded transition duration-200"
                        >
                          History
                        </button>
                        <button
                          onClick={() => handleDeleteVendor(v.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition duration-200"
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
      )}

      {showEditModal && editingVendor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Edit Vendor</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-500 hover:text-gray-700 transition duration-150"
              >
                <span className="text-xl">x</span>
              </button>
            </div>

            <form onSubmit={handleUpdateVendor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name *</label>
                <input
                  type="text"
                  name="name"
                  value={editingVendor.name}
                  onChange={handleEditChange}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  name="contact"
                  value={editingVendor.contact || ""}
                  onChange={handleEditChange}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
                <input
                  type="text"
                  name="shop_name"
                  value={editingVendor.shop_name || ""}
                  onChange={handleEditChange}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  name="address"
                  value={editingVendor.address || ""}
                  onChange={handleEditChange}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance</label>
                <input
                  type="number"
                  name="opening_balance"
                  value={editingVendor.opening_balance ?? ""}
                  onChange={handleEditChange}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition duration-200"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && selectedVendorForPayment && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Add Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-500 hover:text-gray-700 transition duration-150"
              >
                <span className="text-xl">x</span>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-semibold">{selectedVendorForPayment.name}</p>
              <p>Balance: Rs. {formatMoney(selectedVendorForPayment.balance)}</p>
            </div>

            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount *</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter amount you're paying now"
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
                  Add Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
