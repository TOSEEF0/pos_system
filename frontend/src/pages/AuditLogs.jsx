// frontend/src/pages/AuditLogs.jsx
import React, { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("all");

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      if (window.api?.getAuditLogs) {
        const data = await window.api.getAuditLogs(200);
        setLogs(data || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAction === "all") return true;
    return log.action === filterAction;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <Toaster position="top-right" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>🛡️</span> Financial &amp; Activity Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Immutable tracking of financial events, credit sales, payment collections, and balance adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white text-gray-800 outline-none"
          >
            <option value="all">All Actions</option>
            <option value="CREDIT_SALE">Credit Sales</option>
            <option value="PAYMENT_RECEIVED">Payments Received</option>
            <option value="BALANCE_ADJUSTED">Balance Adjustments</option>
            <option value="CUSTOMER_CREATED">Customer Created</option>
            <option value="SALE_DELETED">Deleted Sales</option>
            <option value="BACKUP_CREATED">Backups Created</option>
          </select>

          <button
            onClick={loadLogs}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading audit trail...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No audit records recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 text-gray-600 font-semibold text-xs uppercase border-b">
                <tr>
                  <th className="p-3.5 pl-5">Timestamp</th>
                  <th className="p-3.5">User</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5 pr-5">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLogs.map((log) => {
                  let badgeClass = "bg-gray-100 text-gray-800";
                  if (log.action.includes("PAYMENT")) badgeClass = "bg-green-100 text-green-800";
                  else if (log.action.includes("CREDIT")) badgeClass = "bg-blue-100 text-blue-800";
                  else if (log.action.includes("ADJUST")) badgeClass = "bg-amber-100 text-amber-800";
                  else if (log.action.includes("DELETED")) badgeClass = "bg-red-100 text-red-800";

                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="p-3.5 pl-5 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3.5 font-semibold text-gray-700">{log.user || "System"}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${badgeClass}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3.5 pr-5 text-gray-800 text-xs">{log.details}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
