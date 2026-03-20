import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useDesktopEvents } from './hooks/useDesktopCommands';
import { LibraryScreen } from './screens/Library';
import { ReaderScreen } from './screens/Reader';
import { SettingsScreen } from './screens/Settings';
import { useDesktopStore } from './stores/desktopStore';
import './styles.css';

// Wrapper component for desktop events
function DesktopApp() {
  useDesktopEvents();

  const { settings } = useDesktopStore();
  const [isReady, setIsReady] = useState(false);


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

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Routes>
        {/* Main library */}
        <Route path="/" element={<LibraryScreen />} />

        {/* Reader - may open in new window or inline */}
        <Route path="/reader/:id" element={<ReaderScreen />} />

        {/* Settings */}
        <Route path="/settings" element={<SettingsScreen />} />

        {/* Fallback */}
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
