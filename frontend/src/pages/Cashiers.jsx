import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

export default function Cashiers() {
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCashiers = async () => {
    const data = await window.api.getCashiers();
    setCashiers(data);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this cashier?")) {
      await window.api.deleteCashier(id);
      loadCashiers();
    }
  };

  useEffect(() => {
    loadCashiers();
  }, []);

  if (loading) return <p className="p-4 text-gray-500">Loading cashiers...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4 text-gray-800">Registered Cashiers</h2>
      {cashiers.length === 0 ? (
        <p className="text-gray-500">No cashiers registered yet.</p>
      ) : (
        <table className="w-full bg-white rounded-xl shadow-md overflow-hidden">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="p-3 text-left">Username</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cashiers.map((c) => {
              return (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">{c.username}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-red-500 hover:text-red-700"
                      title="Delete Cashier"
                    >
                      <Trash2 size={20} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
