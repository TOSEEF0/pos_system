import React, { useEffect, useState, useRef } from "react";

function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    barcode: "",
    name: "",
    category_id: "",
    quantity: "",
    unit: "pcs",
    purchase_price: "",
    selling_price: "",
    description: "",
  });
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ show: false, id: null });
  const [isLoading, setIsLoading] = useState(false);

  // simple toast (non-blocking)
  const [toast, setToast] = useState({ show: false, text: "", type: "success" });
  const toastTimerRef = useRef(null);

  // refs for focus
  const nameRef = useRef(null);

  // --- Search functionality (from Cashier) ---
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  // --- Helpers ---
  const showToast = (text, type = "success", duration = 2200) => {
    clearTimeout(toastTimerRef.current);
    setToast({ show: true, text, type });
    toastTimerRef.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), duration);
  };

  const safeValue = (v) => (v === null || v === undefined ? "" : v);

  // --- Loaders ---
  const loadProducts = async () => {
    try {
      const data = await window.api.getProducts();
      setProducts(Array.isArray(data) ? data : []);
      setAllProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading products:", err);
      showToast("Error loading products", "error");
    }
  };

  const loadCategories = async () => {
    try {
      const data = await window.api.getCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading categories:", err);
      showToast("Error loading categories", "error");
    }
  };

  // --- Improved Live Search: startsWith only (from Cashier) ---
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }

    const searchTerm = input.toLowerCase().trim();
    const filtered = allProducts.filter((p) => {
      if (!p || !p.name) return false;
      const name = String(p.name).toLowerCase();
      const barcode = p.barcode ? String(p.barcode).toLowerCase() : "";
      return name.startsWith(searchTerm) || barcode.startsWith(searchTerm);
    });

    setSuggestions(filtered.slice(0, 8));
  }, [input, allProducts]);

  // --- Reset Form ---
  const resetForm = (focus = true) => {
    setForm({
      barcode: "",
      name: "",
      category_id: "",
      quantity: "",
      unit: "pcs",
      purchase_price: "",
      selling_price: "",
      description: "",
    });
    setEditId(null);
    if (focus) {
      // give the DOM a tick so focus works after re-render
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  };

  // --- Controlled change handler ---
  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // --- Add New Product ---
  const handleAdd = async () => {
    if (!form.name || !form.name.trim()) {
      showToast("Product name is required", "error");
      return;
    }
    if (form.selling_price === "" || form.selling_price === null) {
      showToast("Selling price is required", "error");
      return;
    }
    // prepare payload (keep internal state strings - convert here)
    const productData = {
      ...form,
      barcode: form.barcode?.trim() || null,
      category_id: form.category_id || null,
      unit: form.unit || "pcs",
      purchase_price: form.purchase_price === "" ? 0 : Number(form.purchase_price),
      selling_price: form.selling_price === "" ? 0 : Number(form.selling_price),
      quantity: form.quantity === "" ? 0 : Number(form.quantity),
    };

    setIsLoading(true);
    try {
      await window.api.addProduct(productData);
      showToast("Product added successfully", "success");
      await loadProducts();
      resetForm();
    } catch (err) {
      console.error("addProduct error", err);
      if (err?.message?.toLowerCase().includes("exists")) {
        showToast("Barcode already exists — leave blank to auto-assign", "error");
      } else {
        showToast(err?.message || "Error adding product", "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- Edit Product (populate form) ---
  const handleEdit = (p) => {
    setEditId(p.id);
    setForm({
      barcode: p.barcode ?? "",
      name: p.name ?? "",
      category_id: p.category_id ?? "",
      unit: p.unit ?? "pcs",
      // keep numeric fields as strings for controlled inputs
      quantity: p.quantity !== undefined && p.quantity !== null ? String(p.quantity) : "",
      purchase_price:
        p.purchase_price !== undefined && p.purchase_price !== null ? String(p.purchase_price) : "",
      selling_price:
        p.selling_price !== undefined && p.selling_price !== null ? String(p.selling_price) : "",
      description: p.description ?? "",
    });

    // focus product name quickly
    setTimeout(() => nameRef.current?.focus(), 40);
  };

  // --- Update Product ---
  const handleUpdate = async () => {
    if (!form.name || !form.name.trim()) {
      showToast("Product name is required", "error");
      return;
    }
    if (form.selling_price === "" || form.selling_price === null) {
      showToast("Selling price is required", "error");
      return;
    }
    if (!editId) {
      showToast("No product selected for update", "error");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        ...form,
        id: editId,
        barcode: form.barcode?.trim() || null,
        category_id: form.category_id || null,
        unit: form.unit || "pcs",
        purchase_price: form.purchase_price === "" ? 0 : Number(form.purchase_price),
        selling_price: form.selling_price === "" ? 0 : Number(form.selling_price),
        quantity: form.quantity === "" ? 0 : Number(form.quantity),
      };

      await window.api.updateProduct(payload);
      showToast("Product updated successfully", "success");
      await loadProducts();
      // ensure deletion modal is closed if it was open for some reason
      setConfirmDelete({ show: false, id: null });
      resetForm();
    } catch (err) {
      console.error("updateProduct error", err);
      showToast(err?.message || "Error updating product", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // --- Delete (open modal) ---
  const handleDelete = (id) => {
    setConfirmDelete({ show: true, id });
  };

  // --- Confirm Deletion ---
  const confirmDeletion = async () => {
    setIsLoading(true);
    try {
      await window.api.deleteProduct(confirmDelete.id);
      showToast("Product deleted", "success");
      await loadProducts();
      resetForm();
    } catch (err) {
      console.error("deleteProduct error", err);
      showToast(err?.message || "Error deleting product", "error");
    } finally {
      setIsLoading(false);
      setConfirmDelete({ show: false, id: null });
    }
  };

  // debug watcher: logs modal state changes (helps if it gets stuck)
  useEffect(() => {
    console.debug("confirmDelete changed:", confirmDelete);
  }, [confirmDelete]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    // focus first input on mount only if user hasn't clicked another element
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body) {
        nameRef.current?.focus();
      }
    }, 100);
    return () => {
      clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleShopDataUpdated = () => {
      loadProducts();
      loadCategories();
    };

    window.addEventListener("shop-data-updated", handleShopDataUpdated);
    return () => window.removeEventListener("shop-data-updated", handleShopDataUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6 relative">
      {/* toast */}
      {toast.show && (
        <div
          role="status"
          className={`fixed top-6 right-6 z-60 rounded px-4 py-2 shadow ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Manage Products</h2>
          <p className="text-sm text-gray-500">
            Add new inventory or fine-tune existing items.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Add/Edit Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              {editId ? "Edit Product" : "Add Product"}
            </h3>
            <p className="text-xs text-gray-500">
              Keep details concise for faster checkout.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <input
              placeholder="Barcode (Scan or Leave Blank)"
              value={safeValue(form.barcode)}
              onChange={(e) => handleChange("barcode", e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/80 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              placeholder="Product Name"
              ref={nameRef}
              value={safeValue(form.name)}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/80 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={safeValue(form.category_id)}
                onChange={(e) => handleChange("category_id", e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white/80 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={safeValue(form.unit || "pcs")}
                onChange={(e) => handleChange("unit", e.target.value)}
                className="w-full rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                title="Select unit of measurement for this product"
              >
                <option value="pcs">Unit: Pieces (pcs)</option>
                <option value="kg">Unit: Kilograms (kg) — Loose/Sugar/Flour</option>
                <option value="g">Unit: Grams (g) — Spices/Dry Fruits</option>
                <option value="ltr">Unit: Litres (ltr) — Oil/Milk</option>
                <option value="pack">Unit: Pack / Dabba</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                  Stock ({form.unit || "pcs"})
                </label>
                <input
                  type="number"
                  step={form.unit === "kg" || form.unit === "ltr" ? "0.001" : "1"}
                  placeholder={`Qty (${form.unit || "pcs"})`}
                  value={safeValue(form.quantity)}
                  onChange={(e) => handleChange("quantity", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white/80 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                  Cost (Rs/{form.unit || "pcs"})
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Cost`}
                  value={safeValue(form.purchase_price)}
                  onChange={(e) => handleChange("purchase_price", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white/80 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                  Selling (Rs/{form.unit || "pcs"})
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={`Rate`}
                  value={safeValue(form.selling_price)}
                  onChange={(e) => handleChange("selling_price", e.target.value)}
                  className="w-full rounded-lg border border-blue-300 bg-white p-2.5 text-sm font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-xs"
                />
              </div>
            </div>

            {form.unit === "kg" && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-800">
                💡 <b>Kg / Gram System Active</b>: Rate is per 1 kg. Cashier can sell in decimals (e.g. 0.5 kg, 3.5 kg) or enter exact cash amount (e.g. Rs 100 daal).
              </div>
            )}
            <textarea
              placeholder="Description"
              value={safeValue(form.description)}
              onChange={(e) => handleChange("description", e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/80 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows="3"
            />

            {editId ? (
              <div className="flex gap-3 pt-2">
                <button
                  disabled={isLoading}
                  onClick={handleUpdate}
                  className="flex-1 rounded-lg bg-emerald-500 text-white py-2.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-60"
                >
                  {isLoading ? "Updating..." : "Update Product"}
                </button>
                <button
                  onClick={() => resetForm()}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                disabled={isLoading}
                onClick={handleAdd}
                className="rounded-lg bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {isLoading ? "Adding..." : "Add Product"}
              </button>
            )}
          </div>
        </div>

        {/* Product List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col min-h-[420px]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Product List</h3>
              <p className="text-xs text-gray-500">Search by name or barcode.</p>
            </div>

            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search products..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />

              {suggestions.length > 0 && (
                <ul className="absolute z-10 bg-white border border-gray-200 rounded-lg mt-2 w-full shadow-lg max-h-52 overflow-auto">
                  {suggestions.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => {
                        handleEdit(p);
                        setInput("");
                        setSuggestions([]);
                      }}
                      className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-b-0"
                    >
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-600">
                        Rs. {p.selling_price} {p.barcode && `- ${p.barcode}`} - {p.category_name}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto rounded-xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left border-b border-gray-200">
                <tr>
                  <th className="p-3 border-b">Barcode</th>
                  <th className="p-3 border-b">Name</th>
                  <th className="p-3 border-b">Category</th>
                  <th className="p-3 border-b text-right">Qty</th>
                  <th className="p-3 border-b text-right">Purchase</th>
                  <th className="p-3 border-b text-right">Selling</th>
                  <th className="p-3 border-b text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center p-6 text-gray-500">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  products.map((p, index) => (
                    <tr
                      key={p.id}
                      className={`border-b transition ${
                        index % 2 === 0 ? "bg-white/60" : "bg-white/40"
                      } hover:bg-blue-50/40`}
                    >
                      <td className="p-3">{p.barcode || "-"}</td>
                      <td className="p-3 font-medium text-gray-800">{p.name}</td>
                      <td className="p-3 text-gray-600">{p.category_name || "-"}</td>
                      <td className="p-3 text-right font-medium">
                        {p.quantity}{" "}
                        <span className="text-xs text-gray-500 font-normal">
                          {p.unit || "pcs"}
                        </span>
                      </td>
                      <td className="p-3 text-right text-gray-600">Rs. {p.purchase_price}</td>
                      <td className="p-3 text-right font-bold text-gray-900">
                        Rs. {p.selling_price}{" "}
                        <span className="text-xs font-normal text-gray-500">
                          /{p.unit || "pcs"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEdit(p)}
                            className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {confirmDelete.show && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80 text-center">
            <h3 className="text-lg font-semibold mb-3">Confirm Deletion</h3>
            <p className="text-gray-600 mb-5">Are you sure you want to delete this product?</p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={confirmDeletion}
                disabled={isLoading}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-60"
              >
                {isLoading ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={() => setConfirmDelete({ show: false, id: null })}
                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
