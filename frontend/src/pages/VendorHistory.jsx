import React, { useEffect, useState } from "react";

export default function VendorHistory({ vendor, setCurrentPage }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!vendor) return;
    window.api
      .getVendorHistory(vendor.id)
      .then(setHistory)
      .catch(console.error);
  }, [vendor]);

  if (!vendor)
    return (
      <div className="p-6">
        <p>No vendor selected.</p>
        <button
          onClick={() => setCurrentPage("vendors")}
          className="mt-4 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
        >
          Back
        </button>
      </div>
    );

  const formatMoney = (value) => Number(value || 0).toFixed(2);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Vendor History</h1>
        <button
          onClick={() => setCurrentPage("vendors")}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
        >
          Back
        </button>
      </div>

      <div className="mb-6 bg-white shadow rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-2">{vendor.name}</h2>
        <p>Shop: {vendor.shop_name || "N/A"}</p>
        <p>Contact: {vendor.contact || "N/A"}</p>
        <p>Address: {vendor.address || "N/A"}</p>
        <p className="mt-2">
          <strong>Opening Balance:</strong> Rs. {formatMoney(vendor.opening_balance)} |{" "}
          <strong>Purchases:</strong> Rs. {formatMoney(vendor.total_purchases)} |{" "}
          <strong>Payments:</strong> Rs. {formatMoney(vendor.total_payments)} |{" "}
          <strong>Balance:</strong> Rs. {formatMoney(vendor.balance)}
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Transaction History</h2>

        {history.length === 0 ? (
          <p className="text-gray-500">No history found.</p>
        ) : (
          <table className="min-w-full border border-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 border">Date</th>
                <th className="px-4 py-2 border">Type</th>
                <th className="px-4 py-2 border">Amount</th>
                <th className="px-4 py-2 border">Paid / Status</th>
                <th className="px-4 py-2 border">Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={`${entry.type}-${entry.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border">
                    {entry.date ? new Date(entry.date).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-2 border capitalize">{entry.type}</td>
                  <td className="px-4 py-2 border text-right">Rs. {formatMoney(entry.amount)}</td>
                  <td className="px-4 py-2 border">
                    {entry.type === "purchase"
                      ? `Paid: Rs. ${formatMoney(entry.paid_amount)} (${entry.payment_status || "-"})`
                      : "-"}
                  </td>
                  <td className="px-4 py-2 border">{entry.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
