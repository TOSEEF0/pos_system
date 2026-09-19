import { useState } from "react";

function RegisterCashier() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const register = async (e) => {
    if (e) e.preventDefault();
    if (!username || !password) return alert("Fill all fields!");
    
    setIsLoading(true);
    try {
      await window.api.registerCashier({ username, password });
      alert("Cashier registered successfully!");
      setUsername("");
      setPassword("");
    } catch (error) {
      alert("Error: " + (error.message || "Failed to register"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Register New Cashier</h2>
      <form onSubmit={register} className="max-w-sm space-y-4">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="border p-2 w-full rounded"
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 w-full rounded"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
        >
          {isLoading ? "Registering..." : "Register"}
        </button>
      </form>
    </div>
  );
}

export default RegisterCashier;