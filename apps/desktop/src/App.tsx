import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, PremiumBadge } from '@bookdock/auth';
import { initApiClient } from '@bookdock/api-client';
import { Button } from '@bookdock/ui';
import {
  BookOpen,
  Crown,
  Settings as SettingsIcon,
  Wrench,
  Sun,
  Moon,
  ArrowLeft,
} from 'lucide-react';

// Tauri imports (safe to import even in browser, just won't be used)
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// Web Pages
import Library from './pages/Library';
import Reader from './pages/Reader';
import ReaderTTS from './pages/Reader-TTS';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Admin from './pages/Admin';
import AdminUsers from './pages/AdminUsers';
import Membership from './pages/Membership';
import MemberLogin from './pages/MemberLogin';
import MemberBenefits from './pages/MemberBenefits';
import MemberDetail from './pages/MemberDetail';
import MemberPaymentSuccess from './pages/MemberPaymentSuccess';

// Desktop Screens
import { LibraryScreen } from './screens/Library';
import { ReaderScreen } from './screens/Reader';
import { SettingsScreen } from './screens/Settings';
import { MemberLoginScreen } from './screens/MemberLoginScreen';
import { MemberBenefitsScreen } from './screens/MemberBenefitsScreen';
import { MemberDetailScreen } from './screens/MemberDetailScreen';
import { MemberPaymentSuccessScreen } from './screens/MemberPaymentSuccessScreen';

// Stores
import { useDesktopStore } from './stores/desktopStore';
import { useThemeStore } from './stores/authStore';
import { useDesktopEvents } from './hooks/useDesktopCommands';
import { getSavedApiBaseUrl } from './utils/network';

import type { Book } from '@bookdock/api-client';
import './styles.css';

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8088/api';

const isTauri = !!(window as any).__TAURI_IPC__;

// ============ Web Route Wrappers ============

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

function PremiumRoute({ children }: { children: React.ReactNode }) {
  const { membership, isLoading } = useAuth();
  const isPremium = membership === 'premium';
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

// ============ Web Layout ============

function WebLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated, membership } = useAuth();
  const isPremium = membership === 'premium';
  const location = useLocation();
  const { theme, toggleTheme } = useThemeStore();

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const navItems = [
    { path: '/', label: '书库', icon: BookOpen },
    { path: '/membership', label: '会员', icon: Crown },
    { path: '/settings', label: '设置', icon: SettingsIcon },
  ];

  if (user?.role === 'admin') {
    navItems.push({ path: '/admin', label: '管理', icon: Wrench });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2">
                <BookOpen className="w-6 h-6 text-gray-900 dark:text-white" />
                <span className="text-xl font-bold text-gray-900 dark:text-white">书仓</span>
              </Link>
              <nav className="flex space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        location.pathname === item.path
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-1" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              <div className="flex items-center space-x-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{user?.username}</span>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}

// ============ Web App Routes ============

function WebAppRoutes() {
  const { token } = useAuth();

  useEffect(() => {
    initApiClient({
      baseURL: getSavedApiBaseUrl(defaultApiBaseUrl),
      getAuthToken: () => token || localStorage.getItem('bookdock_auth_token'),
      onAuthError: () => {
        localStorage.removeItem('bookdock_auth_token');
        localStorage.removeItem('bookdock_auth_user');
      },
    });
  }, [token]);

  return (
    <WebLayout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/member-login" element={<MemberLogin />} />
        <Route path="/member-benefits" element={<MemberBenefits />} />
        <Route path="/member-detail" element={<MemberDetail />} />
        <Route path="/member-payment-success" element={<MemberPaymentSuccess />} />
        <Route path="/membership" element={<Membership />} />
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
    </WebLayout>
  );
}

// ============ Desktop App Routes ============

function DesktopAppRoutes() {
  useDesktopEvents();

  const { settings, selectedBook, selectBook, setBooks } = useDesktopStore();
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Apply theme
  useEffect(() => {
    const effectiveTheme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : settings.theme;

    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setIsReady(true);
  }, [settings.theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [settings.theme]);

  // Load books from Tauri backend
  useEffect(() => {
    const loadBooks = async () => {
      setIsLoading(true);
      try {
        const result = await invoke<Book[]>('get_books');
        setBooks(result);
      } catch (error) {
        console.error('Failed to load books:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadBooks();

    const unlisten = listen<{ type: string; payload: unknown }>('book-event', (event) => {
      console.log('Received book event:', event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (!isReady || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/reader/:id" element={<ReaderScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/member-login" element={<MemberLoginScreen />} />
        <Route path="/member-benefits" element={<MemberBenefitsScreen />} />
        <Route path="/member-detail" element={<MemberDetailScreen />} />
        <Route path="/member-payment-success" element={<MemberPaymentSuccessScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {selectedBook && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
          <div className="h-full flex flex-col">
            <header className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
              <button
                onClick={() => selectBook(null)}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </button>
              <span className="font-medium text-gray-900 dark:text-white">{selectedBook.title}</span>
              <div className="w-20"></div>
            </header>
            <main className="flex-1 overflow-hidden">
              <ReaderScreen />
            </main>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Root App ============

function App() {
  const apiBaseUrl = getSavedApiBaseUrl(defaultApiBaseUrl);

  return (
    <BrowserRouter>
      {isTauri ? (
        <DesktopAppRoutes />
      ) : (
        <AuthProvider
          apiBaseUrl={apiBaseUrl}
          onAuthError={() => {
            localStorage.removeItem('bookdock_auth_token');
            localStorage.removeItem('bookdock_auth_user');
          }}
        >
          <WebAppRoutes />
        </AuthProvider>
      )}
    </BrowserRouter>
  );
}

export default App;
<div className="hover:bg-blue-700 dark:bg-blue-500"></div>
