import { useEffect, useState, useRef } from "react";

function Categories() {
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [toast, setToast] = useState(null); // custom toast message
  const [confirmDelete, setConfirmDelete] = useState(null); // category pending deletion
  const inputRef = useRef(null);

  // Load all categories from backend
  const loadCategories = async () => {
    try {
      const data = await window.api.getCategories();
      setCategories(data);
    } catch (err) {
      console.error("Error loading categories:", err);
    }
  };

  // Add new category
  const handleAdd = async () => {
    if (!newCategory.trim()) return;
    try {
      await window.api.addCategory(newCategory.trim());
      setNewCategory("");
      loadCategories();
      showToast("Category added successfully ✅");
    } catch (err) {
      showToast("Error adding category (might already exist)", true);
    }
  };

  // Save category edit
  const handleEdit = async (id) => {
    if (!editName.trim()) return;
    await window.api.updateCategory(id, editName.trim());
    setEditId(null);
    setEditName("");
    loadCategories();
    showToast("Category updated successfully ✅");
  };

  // Ask for delete confirmation (custom)
  const askDelete = (cat) => {
    setConfirmDelete(cat);
  };

  // Confirm deletion
  const handleDeleteConfirm = async (id) => {
    try {
      await window.api.deleteCategory(id);
      setConfirmDelete(null);
      loadCategories();
      showToast("Category deleted successfully 🗑️");
      setTimeout(() => inputRef.current?.focus(), 300);
    } catch (err) {
      showToast("Error deleting category", true);
    }
  };

  // Cancel deletion
  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  // Show toast
  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const handleShopDataUpdated = () => {
      loadCategories();
    };

    window.addEventListener("shop-data-updated", handleShopDataUpdated);
    return () => window.removeEventListener("shop-data-updated", handleShopDataUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative p-6">
      <h2 className="text-2xl font-bold mb-4">Manage Categories</h2>

      {/* Add Category */}
      <div className="flex space-x-2 mb-6">
        <input
          ref={inputRef}
          type="text"
          placeholder="Enter category name"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          className="border border-gray-300 rounded-lg p-2.5 flex-1 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs transition-colors"
        />
        <button
          onClick={handleAdd}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-xs"
        >
          Add
        </button>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left border-b border-gray-200">
            <tr>
              <th className="p-3 border-b text-gray-700 font-semibold">ID</th>
              <th className="p-3 border-b text-gray-700 font-semibold">Name</th>
              <th className="p-3 border-b text-right text-gray-700 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan="3" className="text-center p-4 text-gray-500">
                  No categories found.
                </td>
              </tr>
            ) : (
              categories.map((cat, index) => (
                <tr
                  key={cat.id}
                  className={`border-b transition-colors ${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                  } hover:bg-blue-50/40`}
                >
                  <td className="p-3">{cat.id}</td>
                  <td className="p-3">
                    {editId === cat.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    ) : (
                      cat.name
                    )}
                  </td>
                  <td className="p-3">
                    {editId === cat.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(cat.id)}
                          className="rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditId(cat.id);
                            setEditName(cat.name);
                          }}
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => askDelete(cat)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-2 rounded shadow-lg text-white transition-opacity duration-300 ${
            toast.isError ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Custom Confirm Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-80">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              Delete Category
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-red-500">
                {confirmDelete.name}
              </span>
              ?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(confirmDelete.id)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Categories;
