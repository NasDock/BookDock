import React from 'react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import './styles.css';

interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  readingProgress?: number;
}

function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
  }, []);

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

  const openBook = async (book: Book) => {
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📖</span>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">BookDock 书仓</h1>
            </div>
            <button
              onClick={() => invoke('open_settings')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              您的书库是空的
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              添加一些电子书开始阅读吧
            </p>
            <button
              onClick={() => invoke('add_book')}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              添加书籍
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {books.map((book) => (
              <div
                key={book.id}
                onClick={() => openBook(book)}
                className="group cursor-pointer"
              >
                <div className="aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden relative shadow-lg group-hover:shadow-xl transition-shadow">
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                      <span className="text-4xl text-white font-bold">{book.title.charAt(0)}</span>
                    </div>
                  )}
                  {book.readingProgress !== undefined && book.readingProgress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300 dark:bg-gray-600">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${book.readingProgress}%` }}
                      />
                    </div>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">
                  {book.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {book.author || '未知作者'}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

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
    </div>
  );
}

export default App;
