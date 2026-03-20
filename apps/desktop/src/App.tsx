<<<<<<< HEAD
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LibraryScreen } from './screens/Library';
import { ReaderScreen } from './screens/Reader';
import { SettingsScreen } from './screens/Settings';
import { useDesktopStore } from './stores/desktopStore';
import { useDesktopEvents } from './hooks/useDesktopCommands';
=======
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useState } from 'react';
>>>>>>> da738d0 (feat: 修改启动问题)
import './styles.css';

// Wrapper component for desktop events
function DesktopApp() {
  useDesktopEvents();

  const { theme, settings, setTheme } = useDesktopStore();
  const [isReady, setIsReady] = useState(false);

<<<<<<< HEAD
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }
=======
  const isTauri = !!(window as any).__TAURI_IPC__;

  useEffect(() => {
    if (isTauri) {
      loadBooks();

      // Listen for events from Rust backend
      const unlisten = listen<{ type: string; payload: unknown }>('book-event', (event) => {
        console.log('Received book event:', event.payload);
        if (event.payload) {
          // Handle book events
        }
      });

      return () => {
        unlisten.then((fn) => fn());
      };
    } else {
      setIsLoading(false);
      console.warn('Tauri IPC not detected. This app must be run as a Tauri desktop application.');
    }
  }, [isTauri]);

  const loadBooks = async () => {
    if (!isTauri) return;
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

  const openBook = async (book: Book) => {
    if (!isTauri) return;
    try {
      await invoke('open_book', { bookId: book.id });
      setSelectedBook(book);
    } catch (error) {
      console.error('Failed to open book:', error);
    }
  };

  const updateProgress = async (progress: number) => {
    if (!selectedBook) return;
    try {
      await invoke('update_reading_progress', {
        bookId: selectedBook.id,
        progress,
      });
    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  };
>>>>>>> da738d0 (feat: 修改启动问题)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Routes>
        {/* Main library */}
        <Route path="/" element={<LibraryScreen />} />

        {/* Reader - may open in new window or inline */}
        <Route path="/reader/:id" element={<ReaderScreen />} />

<<<<<<< HEAD
        {/* Settings */}
        <Route path="/settings" element={<SettingsScreen />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
=======
      {/* Selected book reader area */}
      {selectedBook && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
          <div className="h-full flex flex-col">
            <header className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
              <button
                onClick={() => setSelectedBook(null)}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                ← 返回
              </button>
              <span className="font-medium text-gray-900 dark:text-white">
                {selectedBook.title}
              </span>
              <div className="w-20"></div>
            </header>
            <main className="flex-1 overflow-hidden">
              {/* Reader content would go here */}
              <div className="h-full flex items-center justify-center text-gray-400">
                阅读器视图
              </div>
            </main>
          </div>
        </div>
      )}

      {/* Non-Tauri Warning Overlay */}
      {!isTauri && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl max-w-md text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              运行环境错误
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              检测到当前在普通浏览器中运行。桌面端应用的功能需要通过 Tauri 环境启动。
            </p>
            <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg font-mono text-sm text-left mb-6">
              <p className="text-blue-500">$ pnpm dev:desktop</p>
            </div>
            <p className="text-sm text-gray-500">
              请在终端运行上述命令启动桌面程序。
            </p>
          </div>
        </div>
      )}
>>>>>>> da738d0 (feat: 修改启动问题)
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
