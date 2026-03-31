import React, { useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth, PremiumBadge } from '@bookdock/auth';
import { initApiClient } from '@bookdock/api-client';
import { Button } from '@bookdock/ui';

// Pages
import Library from './pages/Library';
import Reader from './pages/Reader';
import ReaderTTS from './pages/Reader-TTS';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import Membership from './pages/Membership';

// Stores
import { useThemeStore } from './stores/authStore';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

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

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Premium gate - non-premium users redirected to membership page
function PremiumRoute({ children }: { children: React.ReactNode }) {
  const { isPremium, isLoading } = useAuth();
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

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated, isPremium, subscription } = useAuth();
  const location = useLocation();
  const { theme, toggleTheme } = useThemeStore();

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const navItems = [
    { path: '/', label: '书库', icon: '📚' },
    { path: '/membership', label: '会员', icon: '👑' },
    { path: '/settings', label: '设置', icon: '⚙️' },
  ];

  if (user?.role === 'admin') {
    navItems.push({ path: '/admin', label: '管理', icon: '🔧' });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2">
                <span className="text-2xl">📖</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">书仓</span>
              </Link>
              <nav className="flex space-x-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === item.path
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="mr-1">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <div className="flex items-center space-x-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {user?.username}
                  </span>
                  {isPremium && <PremiumBadge />}
                  {!isPremium && (
                    <Link
                      to="/membership"
                      className="ml-1 px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors font-medium"
                    >
                      开通会员
                    </Link>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={logout}>
                  退出
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

// ============ App Routes ============

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/membership" element={<Membership />} />

        {/* Protected routes */}
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
              <PremiumRoute>
                <ReaderTTS />
              </PremiumRoute>
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
    </Layout>
  );
}

function App() {
  const { token } = useAuth();

  useEffect(() => {
    initApiClient({
      baseURL: apiBaseUrl,
      getAuthToken: () => token || localStorage.getItem('bookdock_auth_token'),
      onAuthError: () => {
        localStorage.removeItem('bookdock_auth_token');
        localStorage.removeItem('bookdock_auth_user');
      },
    });
  }, [token]);

  return (
    <AuthProvider
      apiBaseUrl={apiBaseUrl}
      onAuthError={() => {
        localStorage.removeItem('bookdock_auth_token');
        localStorage.removeItem('bookdock_auth_user');
      }}
    >
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
