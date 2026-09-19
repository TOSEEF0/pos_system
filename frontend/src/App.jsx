import { useState, useEffect, useRef } from "react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LicenseLockScreen from "./components/LicenseLockScreen";
import LicenseStatusBanner from "./components/LicenseStatusBanner";

import Dashboard from "./pages/Dashboard";
import ShopSettings from "./pages/ShopSettings";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Sales from "./pages/Sales";
import Cashier from "./pages/Cashier";
import RegisterCashier from "./pages/RegisterCashier";
import Cashiers from "./pages/Cashiers";
import Vendors from "./pages/Vendors";
import VendorHistory from "./pages/VendorHistory";
import Creditors from "./pages/Creditors";
import Purchases from "./pages/Purchases";
import Customers from "./pages/Customers";
import AuditLogs from "./pages/AuditLogs";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginType, setLoginType] = useState("admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [shopSettings, setShopSettings] = useState(null); // NEW

  // Software Licensing State
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(true);

  const fetchLicenseStatus = async () => {
    try {
      const getFn = window.api?.license?.getStatus || window.api?.getLicenseStatus;
      if (getFn) {
        const status = await getFn();
        setLicenseStatus(status);
      }
    } catch (err) {
      console.error("Failed to load license status:", err);
    } finally {
      setLicenseLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    // Re-check periodically every 60 seconds
    const timer = setInterval(fetchLicenseStatus, 60000);
    return () => clearInterval(timer);
  }, []);

  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedCustomerForSale, setSelectedCustomerForSale] = useState(null);

  // Forgot Password Recovery State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("admin");
  const [forgotPin, setForgotPin] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [showForgotPassToggle, setShowForgotPassToggle] = useState(false);

  const usernameInputRef = useRef(null);

  // Auto-focus username field whenever login view is mounted
  useEffect(() => {
    if (!isLoggedIn) {
      const timer = setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

  const handleResetPasswordWithPin = async (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");

    if (!forgotPin.trim()) {
      setForgotError("Please enter your Master Recovery PIN");
      return;
    }
    if (forgotNewPassword.length < 4) {
      setForgotError("New password must be at least 4 characters long");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("Passwords do not match");
      return;
    }

    setForgotLoading(true);
    try {
      const res = await window.api.resetAdminPasswordWithPin({
        username: forgotUsername.trim(),
        recoveryPin: forgotPin.trim(),
        newPassword: forgotNewPassword
      });

      if (res && res.success) {
        setForgotSuccess(res.message || "Password reset successfully!");
        setPassword(forgotNewPassword);
        setUsername(forgotUsername.trim());
        setTimeout(() => {
          setShowForgotModal(false);
          setForgotPin("");
          setForgotNewPassword("");
          setForgotConfirmPassword("");
          setForgotSuccess("");
        }, 1800);
      } else {
        setForgotError((res && res.message) || "Failed to reset password. Please check your PIN.");
      }
    } catch (err) {
      setForgotError("Error resetting password: " + err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  // ------------------ FETCH SHOP SETTINGS ON LOGIN ------------------
  useEffect(() => {
    if (!isLoggedIn) return;

    async function loadSettings() {
      const settings = await window.api.getShopSettings();
      setShopSettings(settings);
    }

    loadSettings();
  }, [isLoggedIn]);

  // ------------------ LOGIN HANDLER ------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (loginType === "admin") {
        const result = await window.api.loginAdmin(username.trim(), password);
        if (result && result.success) {
          setIsLoggedIn(true);
          setRole("admin");
          setError("");
        } else {
          setError((result && result.message) || "Invalid admin username or password");
        }
      } else {
        const user = await window.api.loginCashier({ username: username.trim(), password });
        if (user) {
          setIsLoggedIn(true);
          setRole("cashier");
          setUsername(user.username || username.trim());
          setCurrentPage("cashier");
          setError("");
        } else {
          setError("Invalid cashier credentials");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername("");
    setPassword("");
    setRole("");
    setError("");
    setLoading(false);
    setCurrentPage("dashboard");
  };

  // ------------------ PAGE RENDER HANDLER ------------------
  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <Dashboard shopSettings={shopSettings} setCurrentPage={setCurrentPage} />;

      case "shop-settings":
        return (
          <ShopSettings
            shopSettings={shopSettings}
            setShopSettings={setShopSettings}
            licenseStatus={licenseStatus}
            onLicenseUpdated={fetchLicenseStatus}
          />
        );

      case "products":
        return <Products />;

      case "categories":
        return <Categories />;

      case "sales":
        return <Sales />;

      case "customers":
        return (
          <Customers
            setCurrentPage={setCurrentPage}
            setSelectedCustomerForSale={setSelectedCustomerForSale}
          />
        );

      case "cashier":
        return (
          <Cashier
            preselectedCustomer={selectedCustomerForSale}
            onClearPreselectedCustomer={() => setSelectedCustomerForSale(null)}
          />
        );

      case "audit-logs":
        return <AuditLogs />;

      case "register-cashier":
        return <RegisterCashier />;

      case "managecashier":
        return <Cashiers />;

      // Vendors
      case "vendors":
        return (
          <Vendors
            setCurrentPage={setCurrentPage}
            setSelectedVendor={setSelectedVendor}
          />
        );

      case "vendorhistory":
        return (
          <VendorHistory
            vendor={selectedVendor}
            setCurrentPage={setCurrentPage}
          />
        );

      // Creditors
      case "creditors":
        return <Creditors />;

      case "purchases":
        return <Purchases />;

      default:
        return <Dashboard shopSettings={shopSettings} setCurrentPage={setCurrentPage} />;
    }
  };

  // ------------------ LICENSE LOCK ENFORCEMENT ------------------
  if (licenseStatus && licenseStatus.isLocked) {
    return (
      <LicenseLockScreen
        licenseStatus={licenseStatus}
        onLicenseActivated={fetchLicenseStatus}
        onRefreshStatus={fetchLicenseStatus}
      />
    );
  }

  // ------------------ LOGIN PAGE ------------------
  if (!isLoggedIn) {
    return (
      <div className="login-shell min-h-screen w-full flex items-center justify-center p-4 md:p-8">
        <div className="login-blob blob-1" />
        <div className="login-blob blob-2" />
        <div className="login-blob blob-3" />

        <div className="relative z-10 w-full max-w-4xl my-auto">
          <div className="login-card w-full grid md:grid-cols-[1.05fr_0.95fr] shadow-2xl">
            <div className="p-8 md:p-10 text-gray-800 flex flex-col justify-between gap-8">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-blue-600/10 border border-blue-200 flex items-center justify-center shadow-sm">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
                      <path d="M9 3h6v4H9z" />
                      <path d="M8 12h8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                      Premium POS
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight">POS</h1>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-lg text-gray-700">Cash &amp; Carry</p>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                Smart checkout, realtime inventory, and confident sales in one place.
              </div>
            </div>

            <div className="p-8 md:p-10 bg-white/70 border-t md:border-t-0 md:border-l border-white/60 text-gray-800 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold">Welcome back</h2>
                  <p className="text-sm text-gray-500">Sign in to continue.</p>
                </div>
                <span className="text-xs uppercase tracking-[0.2em] text-gray-400">
                  Secure
                </span>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="login-role" className="text-xs uppercase tracking-[0.2em] text-gray-500 cursor-pointer">
                    Role
                  </label>
                  <select
                    id="login-role"
                    value={loginType}
                    onChange={(e) => {
                      setLoginType(e.target.value);
                      setUsername("");
                      setPassword("");
                      setError("");
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option className="text-gray-900" value="admin">
                      Admin
                    </option>
                    <option className="text-gray-900" value="cashier">
                      Cashier
                    </option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="login-username" className="text-xs uppercase tracking-[0.2em] text-gray-500 cursor-pointer">
                    Username
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 pointer-events-none"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 21a8 8 0 1 0-16 0" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      ref={usernameInputRef}
                      id="login-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      placeholder="Enter username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-4 text-sm text-gray-800 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="login-password" className="text-xs uppercase tracking-[0.2em] text-gray-500 cursor-pointer">
                    Password
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 pointer-events-none"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="4" y="11" width="16" height="9" rx="2" />
                        <path d="M8 11V7a4 4 0 1 1 8 0v4" />
                      </svg>
                    </span>
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-12 text-sm text-gray-800 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition hover:text-gray-700"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                          <path d="M9.88 4.24A9.77 9.77 0 0 1 12 4c6.5 0 10 8 10 8a18.31 18.31 0 0 1-4.28 5.44" />
                          <path d="M6.15 6.15A18.72 18.72 0 0 0 2 12s3.5 8 10 8a9.77 9.77 0 0 0 4.12-.88" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 bg-white text-blue-600 accent-blue-600"
                    />
                    Remember me
                  </label>
                  {loginType === "admin" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotModal(true);
                        setForgotError("");
                        setForgotSuccess("");
                        setForgotUsername(username || "admin");
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  ) : (
                    <span className="text-gray-400">v1.0</span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-300 via-sky-300 to-blue-400 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/40 border-t-slate-900" />
                      Logging in...
                    </span>
                  ) : (
                    "Login"
                  )}
                </button>

                <p className="text-center text-xs text-gray-400">
                  Powered by Cash &amp; Carry POS
                </p>
              </form>
            </div>
          </div>
        </div>

        {/* FLOATING ZOOM CONTROLS (RESET / IN / OUT) */}
        <div className="fixed bottom-3 right-4 z-20 flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-gray-200 px-3 py-1.5 rounded-full shadow-md text-xs text-gray-600">
          <span className="font-medium text-gray-500">Zoom:</span>
          <button
            type="button"
            onClick={() => window.api?.zoomOut?.()}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 active:bg-gray-200 text-gray-700 font-bold"
            title="Zoom Out (Ctrl + -)"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => window.api?.zoomReset?.()}
            className="px-2 py-0.5 rounded-md hover:bg-blue-50 text-blue-600 font-semibold active:bg-blue-100"
            title="Reset Zoom to 100% (Ctrl + 0)"
          >
            100% (Reset)
          </button>
          <button
            type="button"
            onClick={() => window.api?.zoomIn?.()}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 active:bg-gray-200 text-gray-700 font-bold"
            title="Zoom In (Ctrl + +)"
          >
            +
          </button>
        </div>

        {/* ========================================================================= */}
        {/* FORGOT PASSWORD RECOVERY MODAL */}
        {/* ========================================================================= */}
        {showForgotModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-100">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  <h3 className="font-bold text-gray-900 text-lg">Reset Admin Password</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-gray-500">
                Enter your secret Master Recovery PIN to reset your admin password without contacting technical support.
              </p>

              {forgotError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {forgotError}
                </div>
              )}

              {forgotSuccess && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-700 font-medium">
                  ✅ {forgotSuccess}
                </div>
              )}

              <form onSubmit={handleResetPasswordWithPin} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Admin Username</label>
                  <input
                    type="text"
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-sm bg-gray-50 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Secret Master Recovery PIN *</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Enter your 4–6 digit secret PIN"
                    value={forgotPin}
                    onChange={(e) => setForgotPin(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 font-mono tracking-widest"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">New Password (Min 4 chars) *</label>
                  <div className="relative">
                    <input
                      type={showForgotPassToggle ? "text" : "password"}
                      placeholder="Enter new password"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      className="w-full border rounded-xl p-2.5 pr-12 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotPassToggle(!showForgotPassToggle)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      {showForgotPassToggle ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Confirm New Password *</label>
                  <input
                    type={showForgotPassToggle ? "text" : "password"}
                    placeholder="Re-enter new password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    className="w-full border rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-5 py-2 bg-gradient-to-r from-purple-700 to-indigo-700 text-white font-semibold rounded-xl text-sm shadow hover:from-purple-800 hover:to-indigo-800 transition disabled:opacity-50"
                  >
                    {forgotLoading ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ------------------ ADMIN VIEW ------------------
  if (role === "admin") {
    return (
      <div className="flex h-screen overflow-hidden 
      bg-gradient-to-br from-[#dbeafe] via-white to-[#c7d2fe]">

        {/* Sidebar */}
        <Sidebar
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onLogout={handleLogout}
          shopSettings={shopSettings}
        />

        {/* HEADER + CONTENT */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* TOP LICENSE COUNTDOWN BANNER (WHEN TRIAL ACTIVE) */}
          <LicenseStatusBanner
            licenseStatus={licenseStatus}
            onOpenSettings={() => setCurrentPage("shop-settings")}
          />

          {/* HEADER */}
          <Header
            title={currentPage.charAt(0).toUpperCase() + currentPage.slice(1)}
            username={username}
            role={role}
            shopSettings={shopSettings}
            licenseStatus={licenseStatus}
            onOpenSettings={() => setCurrentPage("shop-settings")}
          />

          {/* MAIN CONTENT */}
          <main className="flex-1 p-6 overflow-auto">
            {renderPage()}
          </main>
        </div>
      </div>
    );
  }

  // ------------------ CASHIER VIEW ------------------
  if (role === "cashier") {
    return (
      <div className="min-h-screen flex flex-col
      bg-gradient-to-br from-blue-100 via-white to-blue-200">

        {/* TOP LICENSE COUNTDOWN BANNER */}
        <LicenseStatusBanner
          licenseStatus={licenseStatus}
          onOpenSettings={() => {}}
        />

        <Header 
          title="Cashier Panel" 
          username={username} 
          role={role} 
          shopSettings={shopSettings}
          licenseStatus={licenseStatus}
          onOpenSettings={() => {}}
        />

        <main className="flex-1 p-6 overflow-auto">
          <Cashier />
        </main>

        <div className="bg-blue-600 text-white px-6 py-3 flex justify-end">
          <button
            onClick={handleLogout}
            className="bg-red-500 px-3 py-1 rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
