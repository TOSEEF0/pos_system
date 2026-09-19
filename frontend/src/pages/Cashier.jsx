// frontend/src/pages/Cashier.jsx
import { useState, useEffect, useRef } from "react";
import toast, { Toaster } from "react-hot-toast";
import "../receipt.css";

function Cashier({ preselectedCustomer = null, onClearPreselectedCustomer = null }) {
  const [input, setInput] = useState("");
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [discountedTotal, setDiscountedTotal] = useState(0);
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [received, setReceived] = useState("");
  const [change, setChange] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  // Payment method: 'cash', 'card', 'credit'
  const [paymentType, setPaymentType] = useState("cash");

  // Customer selection for Credit / Khata
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [newCustLimit, setNewCustLimit] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);

  const barcodeBuffer = useRef("");
  const barcodeTimer = useRef(null);

  // Load products
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const products = await window.api.getProducts();
        setAllProducts(products || []);
      } catch {
        toast.error("Failed to load products");
      }
    };
    loadProducts();
  }, []);

  // Pre-selected customer from Khata page
  useEffect(() => {
    if (preselectedCustomer) {
      setSelectedCustomer(preselectedCustomer);
      setPaymentType("credit");
      setCustomerSearch(preselectedCustomer.name);
      toast(`Khata active for ${preselectedCustomer.name}`);
      if (onClearPreselectedCustomer) {
        onClearPreselectedCustomer();
      }
    }
  }, [preselectedCustomer]);

  // Product Search suggestions
  useEffect(() => {
    if (!input.trim()) return setSuggestions([]);

    const search = input.toLowerCase();
    const filtered = allProducts.filter((p) =>
      String(p.name).toLowerCase().startsWith(search) ||
      String(p.barcode || "").startsWith(search)
    );

    setSuggestions(filtered.slice(0, 8));
  }, [input, allProducts]);

  // Customer Search suggestions for Khata
  useEffect(() => {
    if (!customerSearch.trim() || selectedCustomer) {
      setCustomerSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        if (window.api?.getCustomers) {
          const res = await window.api.getCustomers({ search: customerSearch, filter: "all" });
          setCustomerSuggestions(res.slice(0, 6));
        }
      } catch (err) {
        console.error(err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearch, selectedCustomer]);

  // Add item
  const addItem = async (product = null) => {
    if (!product) {
      const query = input.trim();
      if (!query) {
        toast.error("Enter product name or scan barcode");
        return;
      }

      product =
        allProducts.find(
          (p) =>
            String(p.barcode) === query ||
            String(p.name).toLowerCase() === query.toLowerCase()
        ) || (await window.api.getProduct(query));
    }

    if (!product) return toast.error("Product not found");

    if (Number(product.quantity) <= 0) {
      toast.error(`Out of stock: ${product.name}`);
      return;
    }

    const unit = product.unit || "pcs";
    const initialQty = 1;
    const initialPrice = Number(product.selling_price) || 0;
    const initialTotal = Math.round(initialQty * initialPrice * 100) / 100;

    setCart((prev) => {
      const exists = prev.find((i) => i.id === product.id);
      if (exists) {
        const nextQty = Math.round((Number(exists.quantity) + 1) * 1000) / 1000;
        if (nextQty > Number(product.quantity)) {
          toast.error(`Only ${product.quantity} ${unit} in stock!`);
          return prev;
        }
        const nextTotal = Math.round(nextQty * Number(exists.selling_price) * 100) / 100;
        return prev.map((i) =>
          i.id === product.id ? { ...i, quantity: nextQty, line_total: nextTotal } : i
        );
      }
      return [
        ...prev,
        {
          ...product,
          unit,
          quantity: initialQty,
          line_total: initialTotal
        }
      ];
    });

    toast.success(`${product.name} added (${unit})`);
    setInput("");
    setSuggestions([]);
  };

  // Update item quantity directly (handles decimals like 0.5 kg, 3.5 kg, etc.)
  const updateItemQuantity = (productId, rawVal) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        if (rawVal === "") {
          return { ...item, quantity: "", line_total: 0 };
        }
        const numVal = Math.max(0.001, Number(rawVal) || 0);
        const lineTotal = Math.round(numVal * Number(item.selling_price || 0) * 100) / 100;
        return {
          ...item,
          quantity: numVal,
          line_total: lineTotal
        };
      })
    );
  };

  // Update item total amount directly (e.g. customer wants Rs. 100 daal / sugar)
  const updateItemAmount = (productId, rawAmount) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        if (rawAmount === "") {
          return { ...item, quantity: 0, line_total: "" };
        }
        const numAmount = Math.max(0, Number(rawAmount) || 0);
        const rate = Number(item.selling_price) || 0;
        // Calculate weight in kg/units to 3 decimal places (grams)
        const computedQty = rate > 0 ? Math.round((numAmount / rate) * 1000) / 1000 : 0;
        return {
          ...item,
          quantity: computedQty,
          line_total: numAmount
        };
      })
    );
  };

  // Barcode listener
  useEffect(() => {
    const handler = (e) => {
      // Don't capture keystrokes if user is typing in any input, textarea, or editable element
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }

      if (e.key === "Enter") {
        const code = barcodeBuffer.current.trim();
        barcodeBuffer.current = "";
        clearTimeout(barcodeTimer.current);

        if (code) {
          const product = allProducts.find((p) => String(p.barcode) === code);
          if (product) addItem(product);
          else
            window.api.getProduct(code).then((res) =>
              res ? addItem(res) : toast.error("Invalid barcode")
            );
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = "";
        }, 300);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [allProducts]);

  // Totals
  useEffect(() => {
    const sub = cart.reduce(
      (sum, i) =>
        sum +
        Number(
          i.line_total !== undefined
            ? i.line_total
            : Math.round(Number(i.selling_price || 0) * Number(i.quantity || 0) * 100) / 100
        ),
      0
    );
    const d = Number(discount) || 0;
    const dAmt = Math.round(sub * (d / 100) * 100) / 100;
    setTotal(Math.round(sub * 100) / 100);
    setDiscountedTotal(Math.round((sub - dAmt) * 100) / 100);
  }, [cart, discount]);

  // Format currency
  const formatMoney = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // Create New Customer from POS Modal
  const handleCreateFastCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      toast.error("Please enter customer name");
      return;
    }

    try {
      const created = await window.api.addCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        address: newCustAddress.trim(),
        credit_limit: Number(newCustLimit) || 0,
        opening_balance: 0
      });

      setSelectedCustomer(created);
      setCustomerSearch(created.name);
      setShowNewCustomerModal(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      setNewCustLimit("");
      toast.success(`Customer "${created.name}" created and selected!`);
    } catch (err) {
      toast.error(err.message || "Failed to create customer");
    }
  };

  // Checkout Handler
  const handleCheckout = async () => {
    if (isProcessing) return; // double-click protection
    if (!cart.length) return toast.error("Cart is empty");

    const d = Number(discount) || 0;
    const dAmt = total * (d / 100);
    const finalTotal = total - dAmt;

    // Credit validation
    if (paymentType === "credit") {
      if (!selectedCustomer) {
        toast.error("Please search and select a customer for Credit / Khata sale");
        return;
      }

      const projectedBalance = Number(selectedCustomer.current_due || 0) + finalTotal - (Number(received) || 0);
      if (selectedCustomer.credit_limit > 0 && projectedBalance > selectedCustomer.credit_limit) {
        // Warning or blocking based on settings handled in backend
      }
    } else {
      // Cash / Card validation
      if (Number(received || 0) < finalTotal && paymentType === "cash") {
        return toast.error(`Received amount (Rs. ${received || 0}) is less than total bill (Rs. ${finalTotal})`);
      }
    }

    const chg = paymentType === "cash" ? Math.max(0, Number(received || 0) - finalTotal) : 0;
    setChange(chg);

    setIsProcessing(true);
    try {
      const saleResult = await window.api.saveSale({
        cart,
        total,
        discount: d,
        discountAmount: dAmt,
        discountedTotal: finalTotal,
        received: Number(received) || 0,
        change: chg,
        customer: selectedCustomer ? selectedCustomer.name : "Walk-in Customer",
        customer_id: selectedCustomer ? selectedCustomer.id : null,
        payment_type: paymentType,
        cashier_name: "Cashier",
        note,
      });

      toast.success("Sale completed! Printing receipt...");

      const prevDue = selectedCustomer ? Number(selectedCustomer.current_due || 0) : 0;
      const upfront = Number(received) || 0;
      const newDue = paymentType === "credit" ? Math.max(0, prevDue + finalTotal - upfront) : 0;

      setTimeout(async () => {
        await window.api.printReceipt({
          date: new Date().toLocaleString(),
          invoice_number: saleResult.invoiceNumber,
          cart: cart.map((i) => {
            const itemTotal = Number(
              i.line_total !== undefined
                ? i.line_total
                : Math.round(Number(i.selling_price || 0) * Number(i.quantity || 0) * 100) / 100
            );
            return {
              name: i.name,
              qty: i.quantity,
              quantity: i.quantity,
              unit: i.unit || "pcs",
              price: i.selling_price,
              selling_price: i.selling_price,
              total: itemTotal.toFixed(2),
              line_total: itemTotal
            };
          }),
          total: total.toFixed(2),
          discount: d,
          discountAmount: dAmt.toFixed(2),
          discountedTotal: finalTotal.toFixed(2),
          received: upfront.toFixed(2),
          change: chg.toFixed(2),
          note,
          customer: selectedCustomer ? selectedCustomer.name : "Walk-in Customer",
          customer_phone: selectedCustomer?.phone || "",
          payment_type: paymentType,
          previous_due: prevDue,
          new_due: newDue
        });

        // Reset POS sale
        handleNewSale();
      }, 400);

    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error processing sale");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewSale = () => {
    setInput("");
    setCart([]);
    setDiscount("");
    setNote("");
    setReceived("");
    setChange(0);
    setSuggestions([]);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setPaymentType("cash");
    toast("New checkout started");
  };

  // Calculate projected balance for credit view
  const projectedBalance = selectedCustomer
    ? Number(selectedCustomer.current_due || 0) + discountedTotal - (Number(received) || 0)
    : 0;

  const isLimitExceeded = selectedCustomer?.credit_limit > 0 && projectedBalance > selectedCustomer.credit_limit;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <Toaster position="top-right" />

      {/* TOP BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 backdrop-blur-md p-4 rounded-2xl border shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>🛒</span> POS Cashier Billing
          </h2>
          <p className="text-xs text-gray-500">Scan barcode or search products to begin billing</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNewSale}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-sm transition"
          >
            🔄 New Sale
          </button>
        </div>
      </div>

      {/* SEARCH PRODUCT INPUT */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
            <input
              className="border border-gray-300 pl-11 pr-4 py-3 w-full rounded-xl text-sm text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              placeholder="Scan barcode or type product name / SKU (Press Enter to add)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              autoFocus
            />
          </div>

          <button
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 text-white font-semibold rounded-xl text-sm shadow transition"
            onClick={() => addItem()}
          >
            + Add Product
          </button>
        </div>

        {/* Product Autocomplete Dropdown */}
        {suggestions.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-auto divide-y">
            {suggestions.map((p) => (
              <li
                key={p.id}
                className="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center transition"
                onClick={() => addItem(p)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                      p.unit === "kg" ? "bg-amber-100 text-amber-800" :
                      p.unit === "ltr" ? "bg-sky-100 text-sky-800" :
                      p.unit === "g" ? "bg-purple-100 text-purple-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {p.unit || "pcs"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">Barcode: {p.barcode || "No Barcode"} | Stock: {p.quantity} {p.unit || "pcs"}</div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-blue-600 text-sm">Rs. {formatMoney(p.selling_price)}</span>
                  <span className="text-[11px] text-gray-400 block font-normal">/{p.unit || "pc"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* MAIN TWO-COLUMN LAYOUT: CART (LEFT) & CHECKOUT (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT COLUMN: CART TABLE (2 COLS) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center border-b pb-3 mb-3">
            <h3 className="font-bold text-gray-800 text-base">Items in Cart ({cart.length})</h3>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-red-600 hover:underline font-medium"
              >
                Clear Cart
              </button>
            )}
          </div>

          <div className="flex-1 overflow-x-auto min-h-[260px]">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">Rate</th>
                  <th className="p-3 text-center">Qty / Weight</th>
                  <th className="p-3 text-right">Amount (Rs.)</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-16 text-gray-400">
                      <div className="text-3xl mb-1">🛒</div>
                      Cart is empty. Scan an item or search above.
                    </td>
                  </tr>
                ) : (
                  cart.map((i) => (
                    <tr key={i.id} className="hover:bg-gray-50/80">
                      <td className="p-3 font-medium text-gray-900">
                        <div className="flex items-center gap-1.5">
                          <span>{i.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            i.unit === "kg" ? "bg-amber-100 text-amber-800 border border-amber-300" :
                            i.unit === "ltr" ? "bg-sky-100 text-sky-800 border border-sky-300" :
                            i.unit === "g" ? "bg-purple-100 text-purple-800 border border-purple-300" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {i.unit || "pcs"}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">{i.barcode || "No Barcode"}</div>
                      </td>

                      <td className="p-3 text-right text-gray-700">
                        <div className="font-semibold text-gray-800">Rs. {formatMoney(i.selling_price)}</div>
                        <div className="text-[10px] text-gray-400">per {i.unit || "pc"}</div>
                      </td>

                      <td className="p-3 text-center">
                        {i.unit === "kg" || i.unit === "ltr" || i.unit === "g" ? (
                          <div className="flex flex-col items-center gap-1.5 py-1">
                            <div className="inline-flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white shadow-xs">
                              <button
                                type="button"
                                onClick={() => updateItemQuantity(i.id, Math.max(0.1, Math.round((Number(i.quantity) - 0.5) * 10) / 10))}
                                className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold"
                                title="Minus 0.5"
                              >
                                -0.5
                              </button>
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                value={i.quantity}
                                className="w-16 text-center text-sm font-bold text-gray-800 outline-none px-1 border-x border-gray-200"
                                onChange={(e) => updateItemQuantity(i.id, e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => updateItemQuantity(i.id, Math.round((Number(i.quantity) + 0.5) * 10) / 10)}
                                className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold"
                                title="Plus 0.5"
                              >
                                +0.5
                              </button>
                            </div>

                            {i.unit === "kg" && (
                              <div className="flex items-center gap-1 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(i.id, 0.25)}
                                  className={`px-1.5 py-0.5 rounded border transition-colors ${Number(i.quantity) === 0.25 ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'}`}
                                  title="250 grams (1 Pao)"
                                >
                                  250g
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(i.id, 0.5)}
                                  className={`px-1.5 py-0.5 rounded border transition-colors ${Number(i.quantity) === 0.5 ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'}`}
                                  title="500 grams (Half Kg)"
                                >
                                  500g
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(i.id, 1)}
                                  className={`px-1.5 py-0.5 rounded border transition-colors ${Number(i.quantity) === 1 ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'}`}
                                  title="1 kg"
                                >
                                  1kg
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(i.id, 2)}
                                  className={`px-1.5 py-0.5 rounded border transition-colors ${Number(i.quantity) === 2 ? 'bg-blue-600 text-white border-blue-600 font-bold' : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'}`}
                                  title="2 kg"
                                >
                                  2kg
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white shadow-xs">
                            <button
                              type="button"
                              onClick={() => updateItemQuantity(i.id, Math.max(1, Number(i.quantity) - 1))}
                              className="px-2.5 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={i.quantity}
                              className="w-12 text-center text-sm font-bold text-gray-800 outline-none border-x border-gray-200"
                              onChange={(e) => updateItemQuantity(i.id, e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQuantity(i.id, Number(i.quantity) + 1)}
                              className="px-2.5 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <div className="inline-flex items-center justify-end">
                          <span className="text-xs font-semibold text-gray-400 mr-1">Rs.</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              i.line_total !== undefined
                                ? i.line_total
                                : Math.round(Number(i.quantity || 0) * Number(i.selling_price || 0) * 100) / 100
                            }
                            onChange={(e) => updateItemAmount(i.id, e.target.value)}
                            className="w-24 text-right font-bold text-blue-700 border border-gray-200 rounded-lg px-2 py-1 text-sm bg-blue-50/20 focus:bg-white focus:border-blue-400 outline-none transition-colors"
                            title="Type target amount (e.g. 100 Rs) to auto-calculate weight"
                          />
                        </div>
                        {i.unit === "kg" && (
                          <div className="text-[10px] text-gray-400 text-right mt-0.5">
                            Editable target Rs.
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => setCart((prev) => prev.filter((x) => x.id !== i.id))}
                          className="text-red-500 hover:text-red-700 p-1 font-bold"
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Cart Footer / Discount & Notes */}
          <div className="pt-3 border-t grid grid-cols-2 gap-3 mt-2">
            <div>
              <label className="text-xs font-semibold text-gray-600">Discount Percentage (%):</label>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                className="border rounded-xl p-2 w-full text-sm mt-1"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Sale Note / Remarks:</label>
              <input
                type="text"
                placeholder="e.g. Regular customer discount"
                className="border rounded-xl p-2 w-full text-sm mt-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PAYMENT & KHATA CHECKOUT PANEL (1 COL) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900 text-base border-b pb-2">Payment &amp; Checkout</h3>

            {/* PAYMENT MODE SELECTOR (CASH, CARD, CREDIT / KHATA) */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Payment Method</label>
              <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType("cash");
                    setSelectedCustomer(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    paymentType === "cash"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType("card");
                    setSelectedCustomer(null);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    paymentType === "card"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  💳 Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType("credit")}
                  className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${
                    paymentType === "credit"
                      ? "bg-purple-700 text-white shadow-sm"
                      : "text-purple-700 hover:text-purple-900"
                  }`}
                >
                  <span>📒</span> Khata
                </button>
              </div>
            </div>

            {/* IF CREDIT / KHATA IS SELECTED: CUSTOMER SEARCH & DETAILS */}
            {paymentType === "credit" && (
              <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-purple-900 uppercase">Khata Customer *</label>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerModal(true)}
                    className="text-xs text-purple-700 font-bold hover:underline"
                  >
                    + New Customer
                  </button>
                </div>

                {selectedCustomer ? (
                  <div className="bg-white p-3 rounded-lg border border-purple-200 space-y-1 relative">
                    <button
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch("");
                      }}
                      className="absolute right-2 top-2 text-xs text-red-500 hover:underline"
                    >
                      Change
                    </button>
                    <div className="font-bold text-gray-900 text-sm">{selectedCustomer.name}</div>
                    <div className="text-xs text-gray-500">📞 {selectedCustomer.phone || "No phone"}</div>
                    <div className="pt-2 border-t mt-2 flex justify-between items-center text-xs">
                      <span className="text-gray-600">Current Due:</span>
                      <span className="font-bold text-red-600">Rs. {formatMoney(selectedCustomer.current_due)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type name or phone (e.g. Ali, 0300...)"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full border rounded-xl p-2.5 text-xs outline-none bg-white focus:ring-2 focus:ring-purple-500"
                    />

                    {customerSuggestions.length > 0 && (
                      <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl max-h-48 overflow-auto divide-y text-xs">
                        {customerSuggestions.map((c) => (
                          <li
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setCustomerSuggestions([]);
                              setCustomerSearch(c.name);
                            }}
                            className="p-2.5 hover:bg-purple-50 cursor-pointer flex justify-between items-center"
                          >
                            <div>
                              <span className="font-bold text-gray-900">{c.name}</span>
                              <span className="text-gray-500 ml-1">({c.phone || "No phone"})</span>
                            </div>
                            <span className="font-semibold text-red-600">
                              Due: Rs. {formatMoney(c.current_due)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* CREDIT PROJECTION SUMMARY */}
                {selectedCustomer && (
                  <div className="space-y-1.5 pt-1 text-xs border-t border-purple-200">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sale Total:</span>
                      <span className="font-semibold">Rs. {formatMoney(discountedTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Projected New Due:</span>
                      <span className={`font-bold ${isLimitExceeded ? "text-amber-700" : "text-purple-900"}`}>
                        Rs. {formatMoney(projectedBalance)}
                      </span>
                    </div>

                    {isLimitExceeded && (
                      <div className="p-2 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-medium">
                        ⚠️ Will exceed credit limit of Rs. {formatMoney(selectedCustomer.credit_limit)}!
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* BILL SUMMARY AMOUNTS */}
            <div className="bg-gray-50 p-4 rounded-xl space-y-2 border">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal:</span>
                <span>Rs. {formatMoney(total)}</span>
              </div>

              {Number(discount) > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Discount ({discount}%):</span>
                  <span>-Rs. {formatMoney(total * (Number(discount) / 100))}</span>
                </div>
              )}

              <div className="flex justify-between text-xl font-extrabold text-gray-900 pt-2 border-t">
                <span>Net Total:</span>
                <span className="text-blue-700">Rs. {formatMoney(discountedTotal)}</span>
              </div>
            </div>

            {/* AMOUNT RECEIVED / UPFRONT CASH */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 uppercase">
                {paymentType === "credit" ? "Upfront Cash Paid (Optional):" : "Cash Received (Rs.):"}
              </label>
              <input
                type="number"
                min="0"
                placeholder={paymentType === "credit" ? "0 (Full Udhaar)" : "Enter amount"}
                className="w-full border rounded-xl p-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />

              {paymentType === "cash" && (
                <div className="flex justify-between text-sm font-semibold text-gray-700 pt-1">
                  <span>Change Return:</span>
                  <span className="text-green-700 font-bold">
                    Rs. {formatMoney(Math.max(0, (Number(received) || 0) - discountedTotal))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* CHECKOUT / PRINT BUTTON */}
          <button
            onClick={handleCheckout}
            disabled={isProcessing || cart.length === 0}
            className={`w-full py-3.5 rounded-xl font-bold text-base shadow-lg transition flex items-center justify-center gap-2 ${
              paymentType === "credit"
                ? "bg-purple-700 hover:bg-purple-800 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isProcessing ? (
              <span>Saving Sale...</span>
            ) : paymentType === "credit" ? (
              <span>🖨️ Complete Credit Sale &amp; Print</span>
            ) : (
              <span>🖨️ Complete Sale &amp; Print Receipt</span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FAST NEW CUSTOMER MODAL (INSIDE POS) */}
      {/* ========================================================================= */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-lg">Quick Add Khata Customer</h3>
              <button
                onClick={() => setShowNewCustomerModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFastCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tariq Mehmood"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="0300-XXXXXXX"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Address / Shop</label>
                <input
                  type="text"
                  placeholder="Street / Shop info"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Credit Limit (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0 = No limit"
                  value={newCustLimit}
                  onChange={(e) => setNewCustLimit(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-700 text-white rounded-xl text-sm font-semibold hover:bg-purple-800 shadow"
                >
                  Save &amp; Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cashier;
