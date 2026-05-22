import { initApiClient } from "@bookdock/api-client";
import { AuthProvider, PremiumBadge, useAuth } from "@bookdock/auth";
import {
  BookOpen,
  Crown,
  Moon,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

// Pages
import Admin from "./pages/Admin";
import Library from "./pages/Library";
import Login from "./pages/Login";
import MemberBenefits from "./pages/MemberBenefits";
import MemberDetail from "./pages/MemberDetail";
import MemberLogin from "./pages/MemberLogin";
import MemberPaymentSuccess from "./pages/MemberPaymentSuccess";
import Membership from "./pages/Membership";
import Reader from "./pages/Reader";
import ReaderTTS from "./pages/Reader-TTS";
import Settings from "./pages/Settings";

// Stores
import { useAuthStore, useThemeStore } from "./stores/authStore";
import { getSavedApiBaseUrl } from "./utils/network";

import "./styles.css";

const defaultApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8088/api";

// ============ Route Wrappers ============

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function PremiumRoute({ children }: { children: React.ReactNode }) {
  const { membership, isLoading } = useAuth();
  const { isVip } = useAuthStore();
  const isPremium = membership === "premium" || isVip;
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }
  if (!isPremium) {
    return <Navigate to="/membership" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

// ============ Layout ============

function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated, membership } = useAuth();
  const isPremium = membership === "premium";
  const location = useLocation();
  const { theme, toggleTheme } = useThemeStore();
  const { isVip: isPlusVip, refreshVipStatus } = useAuthStore();
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const syncMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshVipStatus();
    const interval = setInterval(refreshVipStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshVipStatus]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        syncMenuRef.current &&
        !syncMenuRef.current.contains(event.target as Node)
      ) {
        setSyncMenuOpen(false);
      }
    }
    if (syncMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [syncMenuOpen]);

  const handleSync = async (type: "full" | "incremental") => {
    const title = type === "full" ? "全量更新" : "增量更新";
    const message =
      type === "full"
        ? "扫描所有本地书籍，新增数据库不存在的，标记已删除的，重新抓取所有现有书籍的元数据。"
        : "仅扫描新数据，现有数据不做处理。";

    if (!window.confirm(`${title}\n\n${message}\n\n确认开始更新吗？`)) {
      return;
    }

    setSyncing(type);
    try {
      const { getApiClient } = await import("@bookdock/api-client");
      const api = getApiClient();
      const res = await api.post(`/books/sync/${type}`);
      alert(res.data?.message || `${type === "full" ? "全量" : "增量"}更新成功`);
    } catch (e: any) {
      alert(e?.response?.data?.message || "同步失败");
    } finally {
      setSyncing(null);
      setSyncMenuOpen(false);
    }
  };

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Hide global header on reader and login pages
  const isReaderPage = location.pathname.startsWith("/book/");
  const isLoginPage =
    location.pathname === "/login" || location.pathname === "/member-login";

  const navItems = [
    { path: "/", label: "书库", icon: BookOpen },
    { path: "/settings", label: "设置", icon: SettingsIcon },
  ];

  if (user?.role === "admin") {
    navItems.push({ path: "/admin", label: "管理", icon: Wrench });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {!isReaderPage && !isLoginPage && (
        <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              {/* Left: Logo */}
              <div className="flex-shrink-0 w-48">
                <Link to="/" className="flex items-center space-x-2">
                  <BookOpen className="w-6 h-6 text-gray-900 dark:text-white" />
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    书仓
                  </span>
                </Link>
              </div>

              {/* Center: Navigation */}
              <nav className="flex-1 flex justify-center space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        location.pathname === item.path
                          ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-1" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Right: Actions */}
              <div className="flex-shrink-0 w-48 flex items-center justify-end space-x-3">
                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Sun className="w-5 h-5" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  )}
                </button>

                {/* User dropdown */}
                <div className="relative group">
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                      {user?.username}
                    </span>
                    {isPremium && <PremiumBadge />}
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Dropdown menu */}
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 py-1">
                    {/* Membership */}
                    <Link
                      to="/membership"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {isPlusVip ? (
                        <>
                          <Crown className="w-4 h-4 text-amber-500" />
                          <span>会员中心</span>
                        </>
                      ) : (
                        <>
                          <Crown className="w-4 h-4 text-gray-400" />
                          <span>开通会员</span>
                        </>
                      )}
                    </Link>

                    <button
                      onClick={() => handleSync("incremental")}
                      disabled={!!syncing}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>增量更新</span>
                    </button>
                    <button
                      onClick={() => handleSync("full")}
                      disabled={!!syncing}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>全量更新</span>
                    </button>

                    <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />

                    {/* Logout */}
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
                      </svg>
                      <span>退出登录</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}
      <main
        className={
          isReaderPage || isLoginPage
            ? ""
            : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        }
      >
        {children}
      </main>
    </div>
  );
}

// ============ App Routes ============

function AppRoutes() {
  const { token } = useAuth();

  useEffect(() => {
    initApiClient({
      baseURL: getSavedApiBaseUrl(defaultApiBaseUrl),
      getAuthToken: () => token || localStorage.getItem("bookdock_auth_token"),
      onAuthError: () => {
        localStorage.removeItem("bookdock_auth_token");
        localStorage.removeItem("bookdock_auth_user");
      },
    });
  }, [token]);

  return (
    <AppLayout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/member-login" element={<MemberLogin />} />
        <Route
          path="/member-benefits"
          element={
            <ProtectedRoute>
              <MemberBenefits />
            </ProtectedRoute>
          }
        />
        <Route
          path="/member-detail"
          element={
            <ProtectedRoute>
              <MemberDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/member-payment-success"
          element={
            <ProtectedRoute>
              <MemberPaymentSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/membership"
          element={
            <ProtectedRoute>
              <Membership />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Library />
            </ProtectedRoute>
          }
        />
        <Route
          path="/book/:id"
          element={
            <ProtectedRoute>
              <Reader />
            </ProtectedRoute>
          }
        />
        <Route
          path="/book/:id/tts"
          element={
            <ProtectedRoute>
              <ReaderTTS />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

// ============ Root App ============

function App() {
  const apiBaseUrl = getSavedApiBaseUrl(defaultApiBaseUrl);

  return (
    <BrowserRouter>
      <AuthProvider
        apiBaseUrl={apiBaseUrl}
        onAuthError={() => {
          localStorage.removeItem("bookdock_auth_token");
          localStorage.removeItem("bookdock_auth_user");
        }}
      >
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
