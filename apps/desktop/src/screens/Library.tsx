import { useEffect, useState, useMemo } from 'react';
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

// Types
type ProgressFilter = 'all' | 'unread' | 'reading' | 'completed';
type SortOption = 'title' | 'author' | 'lastRead' | 'addedAt';
type ViewMode = 'grid' | 'list';

// Hook for debounced value
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const FORMAT_OPTIONS = ['epub', 'pdf', 'txt', 'mobi'] as const;

export function LibraryScreen() {
  useDesktopEvents();
  useWindowState('main');
  const isDesktop = checkIsDesktop();

  const {
    books,
    setBooks,
    selectedBook,
    selectBook,
    isTtsMode,
    setIsTtsMode,
    settings,
    updateSettings,
  } = useDesktopStore();

  const [activeTab, setActiveTab] = useState<'library' | 'local'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [authorSearch, setAuthorSearch] = useState('');
  const [filterFormat, setFilterFormat] = useState<typeof FORMAT_OPTIONS[number] | 'all'>('all');
  const [filterProgress, setFilterProgress] = useState<ProgressFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('addedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Debounce search inputs
  const debouncedSearch = useDebounce(searchQuery, 300);
  const debouncedAuthor = useDebounce(authorSearch, 300);

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

  // Stats
  const stats = useMemo(() => {
    const total = books.length;
    const unread = books.filter((b) => !b.readingProgress || b.readingProgress === 0).length;
    const reading = books.filter((b) => b.readingProgress && b.readingProgress > 0 && b.readingProgress < 100).length;
    const completed = books.filter((b) => b.readingProgress && b.readingProgress >= 100).length;
    return { total, unread, reading, completed };
  }, [books]);

  // Filter, sort books
  const filteredBooks = useMemo(() => {
    let result = [...books];

    // Title search
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (book) =>
          book.title.toLowerCase().includes(q) ||
          book.author?.toLowerCase().includes(q)
      );
    }

    // Author search
    if (debouncedAuthor.trim()) {
      const q = debouncedAuthor.toLowerCase();
      result = result.filter(
        (book) =>
          book.author?.toLowerCase().includes(q) ||
          book.title.toLowerCase().includes(q)
      );
    }

    // Format filter
    if (filterFormat !== 'all') {
      result = result.filter((book) => book.fileType === filterFormat);
    }

    // Progress filter
    if (filterProgress !== 'all') {
      result = result.filter((book) => {
        const progress = book.readingProgress ?? 0;
        if (filterProgress === 'unread') return progress === 0;
        if (filterProgress === 'reading') return progress > 0 && progress < 100;
        if (filterProgress === 'completed') return progress >= 100;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'title':
          cmp = a.title.localeCompare(b.title, 'zh-CN');
          break;
        case 'author':
          cmp = (a.author || 'zzz').localeCompare(b.author || 'zzz', 'zh-CN');
          break;
        case 'lastRead':
          cmp = (new Date(a.lastReadAt || 0).getTime()) - (new Date(b.lastReadAt || 0).getTime());
          break;
        case 'addedAt':
        default:
          cmp = (new Date(a.addedAt || 0).getTime()) - (new Date(b.addedAt || 0).getTime());
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [books, debouncedSearch, debouncedAuthor, filterFormat, filterProgress, sortBy, sortOrder]);

  const recentBooks = useMemo(() => {
    return books
      .filter((b) => b.lastReadAt)
      .sort((a, b) => {
        const dateA = new Date(a.lastReadAt!).getTime();
        const dateB = new Date(b.lastReadAt!).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [books]);

  const inProgressBooks = useMemo(() => {
    return books
      .filter((b) => b.readingProgress && b.readingProgress > 0 && b.readingProgress < 100)
      .slice(0, 5);
  }, [books]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  const isFiltered = debouncedSearch || debouncedAuthor || filterFormat !== 'all' || filterProgress !== 'all';

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
              {/* Search - 书名 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索书名..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              </div>

              {/* Search - 作者 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索作者..."
                  value={authorSearch}
                  onChange={(e) => setAuthorSearch(e.target.value)}
                  className="w-40 px-4 py-2 pl-10 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">✍️</span>
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

      {/* Filter Bar - only show in library tab */}
      {activeTab === 'library' && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Stats */}
            <div className="text-sm text-gray-500 dark:text-gray-400 mr-2">
              <span className="font-medium text-gray-900 dark:text-white">{stats.total}</span> 本书
              <span className="mx-1 text-green-500">{stats.completed} 已读完</span>
              <span className="mx-1 text-blue-500">{stats.reading} 在读</span>
              <span className="mx-1">{stats.unread} 未读</span>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Format filter buttons */}
            <div className="flex gap-1">
              <button
                onClick={() => setFilterFormat('all')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filterFormat === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                全部
              </button>
              {FORMAT_OPTIONS.map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFilterFormat(filterFormat === fmt ? 'all' : fmt)}
                  className={`px-3 py-1 text-xs rounded-full uppercase font-medium transition-colors ${
                    filterFormat === fmt
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Progress filter tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {(['all', 'unread', 'reading', 'completed'] as ProgressFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterProgress(p)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    filterProgress === p
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {p === 'all' ? '全部' : p === 'unread' ? '未读' : p === 'reading' ? '在读' : '已读完'}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="addedAt">添加时间</option>
              <option value="title">书名</option>
              <option value="author">作者</option>
              <option value="lastRead">最近阅读</option>
            </select>

            <button
              onClick={toggleSortOrder}
              className="px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              title={sortOrder === 'desc' ? '降序' : '升序'}
            >
              {sortOrder === 'desc' ? '↓' : '↑'}
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* View mode toggle */}
            <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title="网格视图"
              >
                ▦
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title="列表视图"
              >
                ☰
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'library' ? (
          <>
            {/* Continue Reading */}
            {inProgressBooks.length > 0 && !isFiltered && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  📖 继续阅读
                </h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {inProgressBooks.map((book) => (
                    <div
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="flex-shrink-0 w-32 cursor-pointer group"
                    >
                      <div className="aspect-[2/3] bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg overflow-hidden relative shadow-lg group-hover:shadow-xl transition-shadow">
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
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/30">
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
                      <p className="text-xs text-blue-500">{book.readingProgress}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent books */}
            {recentBooks.length > 0 && !isFiltered && (
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
                      <div className="aspect-[2/3] bg-gradient-to-br from-green-400 to-teal-500 rounded-lg overflow-hidden relative shadow-lg group-hover:shadow-xl transition-shadow">
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
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/30">
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
                        {formatDate(book.lastReadAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All books */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {isFiltered
                    ? `搜索结果 (${filteredBooks.length} 本)`
                    : '全部书籍'}
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
                    {isFiltered ? '没有找到匹配的书籍' : '您的书库是空的'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    {isFiltered ? '尝试其他关键词或筛选条件' : '添加一些电子书开始阅读吧'}
                  </p>
                  {!isFiltered && (
                    <button
                      onClick={handleImportFile}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      导入书籍
                    </button>
                  )}
                </div>
              ) : viewMode === 'grid' ? (
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
                        {/* Format badge */}
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/50 rounded text-[10px] text-white uppercase font-medium">
                          {book.fileType}
                        </div>
                        {/* Progress bar - show for reading/completed */}
                        {book.readingProgress !== undefined && book.readingProgress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/30">
                            <div
                              className="h-full bg-green-400 transition-all"
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
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate" title={book.title}>
                        {book.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={book.author || '未知作者'}>
                        {book.author || '未知作者'}
                      </p>
                      {/* Progress text */}
                      {book.readingProgress !== undefined && book.readingProgress > 0 && (
                        <p className="text-xs text-blue-500 mt-0.5">{book.readingProgress}%</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="space-y-2">
                  {filteredBooks.map((book) => (
                    <div
                      key={book.id}
                      onClick={() => handleOpenBook(book)}
                      className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="w-12 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg overflow-hidden flex-shrink-0">
                        {book.coverUrl ? (
                          <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-lg text-white font-bold">{book.title.charAt(0)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{book.title}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{book.author || '未知作者'}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="uppercase font-medium">{book.fileType}</span>
                          <span>{formatFileSize(book.fileSize)}</span>
                          <span>{formatDate(book.addedAt)}</span>
                        </div>
                      </div>
                      {/* Progress bar in list view */}
                      {book.readingProgress !== undefined && book.readingProgress > 0 && (
                        <div className="w-24 flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${book.readingProgress}%` }}
                              />
                            </div>
                            <span className="text-xs text-blue-500 font-medium">{book.readingProgress}%</span>
                          </div>
                        </div>
                      )}
                      <div className="text-gray-400 text-xl">›</div>
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
