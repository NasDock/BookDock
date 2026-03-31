import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useDesktopEvents } from './hooks/useDesktopCommands';
import { LibraryScreen } from './screens/Library';
import { ReaderScreen } from './screens/Reader';
import { SettingsScreen } from './screens/Settings';
import { MemberLoginScreen } from './screens/MemberLoginScreen';
import { MemberBenefitsScreen } from './screens/MemberBenefitsScreen';
import { MemberDetailScreen } from './screens/MemberDetailScreen';
import { MemberPaymentSuccessScreen } from './screens/MemberPaymentSuccessScreen';
import { useDesktopStore } from './stores/desktopStore';
import './styles.css';

function getVipStatus() {
  try {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (stored) {
      const user = JSON.parse(stored);
      return { isVip: user.isVip === true, level: user.level || 'free' };
    }
  } catch {}
  return { isVip: false, level: 'free' };
}

function NoVipBlock() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full mb-4">
          <span className="text-2xl">👑</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">尊享会员专享</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-5 text-sm">当前功能仅对会员开放</p>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-5 text-left">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">会员特权</p>
          {['📚 无限书籍', '🎧 语音朗读', '⭐ 新功能抢先', '🚫 去除广告'].map(b => (
            <p key={b} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1.5 mb-1">
              <span className="text-green-500">✓</span> {b}
            </p>
          ))}
        </div>
        <div className="space-y-2">
          <a href="#/member-benefits" className="block w-full py-2 rounded-lg text-white font-medium text-center"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}>
            立即开通会员
          </a>
          <a href="#/" className="block w-full py-2 text-gray-500 text-center text-sm">返回书架</a>
        </div>
      </div>
    </div>
  );
}

function VipGuard({ children }: { children: React.ReactNode }) {
  const vip = getVipStatus();
  if (!vip.isVip) return <NoVipBlock />;
  return <>{children}</>;
}

function DesktopApp() {
  useDesktopEvents();
  const { settings } = useDesktopStore();
  const [isReady, setIsReady] = useState(false);
  const [vipStatus, setVipStatus] = useState({ isVip: false, level: 'free' });

  useEffect(() => {
    setVipStatus(getVipStatus());
    const interval = setInterval(() => setVipStatus(getVipStatus()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const effectiveTheme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        : settings.theme;
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setIsReady(true);
  }, [settings.theme]);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [settings.theme]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Desktop VIP status bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">📖 书仓</span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">桌面版</span>
        </div>
        <div className="flex items-center gap-3">
          {vipStatus.isVip ? (
            <a href="#/member-detail" className="px-2 py-0.5 text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full">
              👑 {vipStatus.level === 'lifetime' ? '永久' : '年卡'}
            </a>
          ) : (
            <a href="#/member-benefits" className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 rounded-full hover:bg-amber-100">
              开通会员
            </a>
          )}
        </div>
      </div>
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
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <DesktopApp />
    </BrowserRouter>
  );
}

export default App;
