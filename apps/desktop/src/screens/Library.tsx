import { useEffect, useState } from 'react';
import { FileBrowser } from '../components/FileBrowser';
import { TTSControls } from '../components/TTSControls';
import {
  addBook,
  checkIsDesktop,
  getBooks,
  importLocalBook,
  minimizeToTray,
  openFileDialog,
  openFolderDialog,
  openReaderWindow,
  useDesktopEvents,
  useFileBrowser,
  useWindowState
} from '../hooks/useDesktopCommands';
import { useDesktopStore } from '../stores/desktopStore';


export function LibraryScreen() {
  useDesktopEvents();
  useWindowState('main');
  const isDesktop = checkIsDesktop();

  const {
    books,
    setBooks,
    selectedBook,
    selectBook,
    setIsReaderOpen,
    ttsState,
    isTtsMode,
    setIsTtsMode,
    settings,
    updateSettings,
  } = useDesktopStore();

  const [activeTab, setActiveTab] = useState<'library' | 'local'>('library');
  const [searchQuery, setSearchQuery] = useState('');

  const { openPath } = useFileBrowser();

  useEffect(() => {
    // Load books from Rust backend
    getBooks()
      .then((rustBooks) => {
        // Convert Rust Book to API Book format
        const converted = rustBooks.map((b: any) => ({
          id: b.id,
          title: b.title,
          author: b.author,
          coverUrl: b.cover_url,
          filePath: b.file_path,
          fileType: b.file_type as any,
          readingProgress: b.reading_progress,
          totalPages: b.total_pages,
          currentPage: b.current_page,
          addedAt: b.added_at,
          lastReadAt: b.last_read_at,
          fileSize: b.file_size ?? 0,
        }));
        setBooks(converted);
      })
      .catch(console.error);
  }, [setBooks]);

  const handleImportFile = async () => {
    const filePath = await openFileDialog();
    if (filePath) {
      try {
        const book = await importLocalBook(filePath);
        const apiBook = {
          id: book.id,
          title: book.title,
          author: book.author,
          coverUrl: book.cover_url,
          filePath: book.file_path,
          fileType: book.file_type as any,
          readingProgress: book.reading_progress,
          totalPages: book.total_pages,
          currentPage: book.current_page,
          addedAt: book.added_at,
          lastReadAt: book.last_read_at,
          fileSize: (book as any).file_size ?? 0,
        };
        setBooks([apiBook, ...books]);
        await addBook(book);
      } catch (error) {
        console.error('Failed to import book:', error);
      }
    }
  };

  const handleImportFolder = async () => {
    const folderPath = await openFolderDialog();
    if (folderPath) {
      updateSettings({ lastOpenedPath: folderPath });
      setActiveTab('local');
      openPath(folderPath);
    }
  };

  const handleOpenBook = async (book: any) => {
    try {
      await openReaderWindow(book.id, book.title);
    } catch (error) {
      console.error('Failed to open reader window:', error);
      // Fallback to inline reader
      selectBook(book);
    }
  };


  const filteredBooks = books.filter(
    (book) =>
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const recentBooks = books
    .filter((b) => b.lastReadAt)
    .sort((a, b) => {
      const dateA = new Date(a.lastReadAt!).getTime();
      const dateB = new Date(b.lastReadAt!).getTime();
      return dateB - dateA;
    })
    .slice(0, 5);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-3xl">📖</span>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">BookDock</h1>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full ${
                isDesktop 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              }`}>
                {isDesktop ? '桌面版' : '网页版'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索书籍..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  🔍
                </span>
              </div>

              {/* TTS toggle */}
              <button
                onClick={() => setIsTtsMode(!isTtsMode)}
                className={`p-2 rounded-lg transition-colors ${
                  isTtsMode
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
                title="听书模式"
              >
                🔊
              </button>

              {/* Minimize to tray - only show on desktop */}
              {isDesktop && (
                <button
                  onClick={() => minimizeToTray().catch(console.error)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  title="最小化到托盘"
                >
                  ⬇️
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'library'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              📚 我的书库
            </button>
            <button
              onClick={() => setActiveTab('local')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'local'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              📂 本地文件
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'library' ? (
          <>
            {/* Recent books */}
            {recentBooks.length > 0 && !searchQuery && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  最近阅读
                </h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {recentBooks.map((book) => (
                    <div
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="flex-shrink-0 w-32 cursor-pointer group"
                    >
                      <div className="aspect-[2/3] bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg overflow-hidden shadow-lg group-hover:shadow-xl transition-shadow">
                        {book.coverUrl ? (
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-3xl text-white font-bold">
                              {book.title.charAt(0)}
                            </span>
                          </div>
                        )}
                        {book.readingProgress !== undefined && book.readingProgress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
                            <div
                              className="h-full bg-white"
                              style={{ width: `${book.readingProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">
                        {book.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {book.currentPage}/{book.totalPages}页
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All books grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {searchQuery ? `搜索结果: "${searchQuery}"` : '全部书籍'}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleImportFile}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    📄 导入文件
                  </button>
                  <button
                    onClick={handleImportFolder}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    📁 导入文件夹
                  </button>
                </div>
              </div>

              {filteredBooks.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">📚</div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {searchQuery ? '没有找到匹配的书籍' : '您的书库是空的'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {searchQuery ? '尝试其他关键词' : '添加一些电子书开始阅读吧'}
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={handleImportFile}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      导入书籍
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {filteredBooks.map((book) => (
                    <div
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="group cursor-pointer"
                    >
                      <div className="aspect-[2/3] bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl overflow-hidden relative shadow-lg group-hover:shadow-xl transition-shadow">
                        {book.coverUrl ? (
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-600">
                            <span className="text-4xl text-white font-bold">
                              {book.title.charAt(0)}
                            </span>
                          </div>
                        )}
                        {book.readingProgress !== undefined && book.readingProgress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
                            <div
                              className="h-full bg-green-400"
                              style={{ width: `${book.readingProgress}%` }}
                            />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white text-3xl transition-opacity">
                            📖
                          </span>
                        </div>
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
            </div>
          </>
        ) : (
          /* Local file browser */
          <div className="h-full">
            {settings.lastOpenedPath && (
              <div className="mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  当前目录: {settings.lastOpenedPath}
                </p>
              </div>
            )}
            <FileBrowser onBookSelected={(book) => handleOpenBook(book)} />
          </div>
        )}
      </main>

      {/* TTS overlay */}
      {isTtsMode && (
        <div className="fixed bottom-6 right-6 w-80 z-50">
          <TTSControls
            bookId={selectedBook?.id}
            onClose={() => setIsTtsMode(false)}
          />
        </div>
      )}
    </div>
  );
}
