// frontend/src/pages/Purchases.jsx
import React, { useEffect, useMemo, useState } from "react";

const createEmptyItem = () => ({ product_id: "", quantity: "", purchase_price: "" });

export default function Purchases() {
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    vendor_id: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    paid_amount: "",
    note: "",
  });
  const [items, setItems] = useState([createEmptyItem()]);

  const [notification, setNotification] = useState({ show: false, message: "", type: "" });

  const [showItemsModal, setShowItemsModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: "", type: "" });
    }, 3000);
  };

  async function loadData() {
    try {
      const [vendorsData, productsData, purchasesData] = await Promise.all([
        window.api.getVendors(),
        window.api.getProducts(),
        window.api.getPurchases(),
      ]);

      setVendors(vendorsData || []);
      setProducts(productsData || []);
      setPurchases(purchasesData || []);
    } catch (err) {
      console.error("Failed to load purchases data:", err);
      showNotification("Failed to load purchases data.", "error");
    } finally {
      setLoading(false);
    }
  }

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.purchase_price) || 0;
      return sum + qty * price;
    }, 0);
  }, [items]);

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleItemChange(index, field, value) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function addItemRow() {
    setItems((prev) => [...prev, createEmptyItem()]);
  }

  function removeItemRow(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.vendor_id) {
      showNotification("Please select a vendor.", "error");
      return;
    }

    const validItems = items.filter((item) => item.product_id && Number(item.quantity) > 0);
    if (validItems.length === 0) {
      showNotification("Add at least one product item.", "error");
      return;
    }

    const paidAmount = Number(form.paid_amount) || 0;
    if (paidAmount < 0 || paidAmount > totalAmount) {
      showNotification("Paid amount must be between 0 and total amount.", "error");
      return;
    }

    try {
      const purchaseDateIso = form.purchase_date
        ? new Date(form.purchase_date).toISOString()
        : new Date().toISOString();

      await window.api.addPurchase({
        vendor_id: Number(form.vendor_id),
        purchase_date: purchaseDateIso,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        note: form.note,
        items: validItems.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity) || 0,
          purchase_price: Number(item.purchase_price) || 0,
        })),
      });

      showNotification("Purchase recorded successfully!", "success");
      setForm({
        vendor_id: "",
        purchase_date: new Date().toISOString().slice(0, 10),
        paid_amount: "",
        note: "",
      });
      setItems([createEmptyItem()]);
      await loadData();
    } catch (err) {
      console.error("Failed to add purchase:", err);
      showNotification(err.message || "Failed to add purchase.", "error");
    }
  }

  async function openItemsModal(purchaseId) {
    try {
      const itemsData = await window.api.getPurchaseItems(purchaseId);
      setSelectedItems(itemsData || []);
      setShowItemsModal(true);
    } catch (err) {
      console.error("Failed to load purchase items:", err);
      showNotification("Failed to load purchase items.", "error");
    }
  }

  const formatMoney = (value) => Number(value || 0).toFixed(2);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Purchases</h1>

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
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow p-4 mb-6 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <select
              name="vendor_id"
              value={form.vendor_id}
              onChange={handleFormChange}
              className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
            <input
              type="date"
              name="purchase_date"
              value={form.purchase_date}
              onChange={handleFormChange}
              className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount</label>
            <input
              type="number"
              name="paid_amount"
              value={form.paid_amount}
              onChange={handleFormChange}
              className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter paid amount"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Items</label>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={`item-${index}`}
                className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center"
              >
                <select
                  value={item.product_id}
                  onChange={(e) => handleItemChange(index, "product_id", e.target.value)}
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                  placeholder="Qty"
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="number"
                  value={item.purchase_price}
                  onChange={(e) => handleItemChange(index, "purchase_price", e.target.value)}
                  placeholder="Cost"
                  className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => removeItemRow(index)}
                  className="px-3 py-2 text-red-600 hover:text-red-700"
                  disabled={items.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItemRow}
            className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add Item
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
          <input
            type="text"
            name="note"
            value={form.note}
            onChange={handleFormChange}
            className="border p-2 rounded w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Optional note"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">Total: Rs. {formatMoney(totalAmount)}</p>
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded px-6 py-2 transition duration-200"
          >
            Record Purchase
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading purchases...</p>
      ) : purchases.length === 0 ? (
        <div className="text-center text-gray-500 bg-white rounded-lg shadow p-8">
          <p className="text-lg font-semibold">No purchases recorded.</p>
          <p className="mt-2">Start by adding your first purchase.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="p-3 text-left">Vendor</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">Items</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="p-3 font-medium">{p.vendor_name || "-"}</td>
                  <td className="p-3">
                    {p.purchase_date ? new Date(p.purchase_date).toLocaleDateString() : "-"}
                  </td>
                  <td className="p-3 text-right">Rs. {formatMoney(p.total_amount)}</td>
                  <td className="p-3 text-right">Rs. {formatMoney(p.paid_amount)}</td>
                  <td className="p-3 capitalize">{p.payment_status || "-"}</td>
                  <td className="p-3 text-right">{p.total_items || 0}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => openItemsModal(p.id)}
                      className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition duration-200"
                    >
                      View Items
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showItemsModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Purchase Items</h2>
              <button
                onClick={() => setShowItemsModal(false)}
                className="text-gray-500 hover:text-gray-700 transition duration-150"
              >
                <span className="text-xl">x</span>
              </button>
            </div>
            {selectedItems.length === 0 ? (
              <p className="text-gray-500">No items found.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="p-2 text-left">Product</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="p-2">{item.product_name || "-"}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2 text-right">Rs. {formatMoney(item.purchase_price)}</td>
                      <td className="p-2 text-right">Rs. {formatMoney(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
