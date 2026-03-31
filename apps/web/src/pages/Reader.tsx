import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiClient, Book } from '@bookdock/api-client';
import { useAuth } from '@bookdock/auth';
import { useBookReader } from '../hooks/useBookReader';
import { useReaderStore } from '../stores/themeStore';
import { Button } from '@bookdock/ui';
import type { ReaderMode, ReaderPosition } from '@bookdock/ebook-reader';

// ==================== Reading Progress (localStorage + API) ====================
interface StoredProgress {
  bookId: string;
  percentage: number;
  currentPage?: number;
  cfi?: string;
  timestamp: number;
  totalPages?: number;
}

const PROGRESS_KEY = 'bookdock_reading_progress';

function saveProgressLocal(progress: StoredProgress): void {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, StoredProgress>;
    const existing = all[progress.bookId];
    // Only save if newer or significantly different position
    if (!existing || progress.percentage !== existing.percentage || progress.timestamp - existing.timestamp > 30000) {
      all[progress.bookId] = progress;
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
    }
  } catch {
    // Ignore
  }
}

function getProgressLocal(bookId: string): StoredProgress | null {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, StoredProgress>;
    return all[bookId] || null;
  } catch {
    return null;
  }
}

// ==================== Format Compatibility Tips ====================
const FORMAT_TIPS: Record<string, { icon: string; tip: string; supported: boolean }> = {
  epub: {
    icon: '📖',
    tip: 'EPUB 格式完整支持，支持目录、书签、字号调整、听书',
    supported: true,
  },
  pdf: {
    icon: '📄',
    tip: 'PDF 格式支持，支持翻页、缩放。复杂排版或加密PDF可能有兼容性问题',
    supported: true,
  },
  mobi: {
    icon: '📱',
    tip: 'MOBI 格式通过亚马逊 Kindle 解析库支持。部分复杂格式可能显示异常',
    supported: true,
  },
  txt: {
    icon: '📝',
    tip: '纯文本格式支持，自动检测编码（UTF-8/GBK）。图片和复杂排版不可用',
    supported: true,
  },
};

// ==================== Bookmark ====================
interface Bookmark {
  id: string;
  cfi: string;
  position: number;
  note?: string;
  createdAt: string;
  percentage: number;
}

// ==================== Reader Settings Panel ====================
interface ReaderSettingsProps {
  mode: ReaderMode;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  margin: number;
  onModeChange: (mode: ReaderMode) => void;
  onFontSizeChange: (size: number) => void;
  onLineHeightChange: (height: number) => void;
  onFontFamilyChange: (family: string) => void;
  onMarginChange: (margin: number) => void;
  onClose: () => void;
  bookmarks: Bookmark[];
  onAddBookmark: () => void;
  onGoToBookmark: (bookmark: Bookmark) => void;
}

function ReaderSettings({
  mode,
  fontSize,
  lineHeight,
  fontFamily,
  margin,
  onModeChange,
  onFontSizeChange,
  onLineHeightChange,
  onFontFamilyChange,
  onMarginChange,
  onClose,
  bookmarks,
  onAddBookmark,
  onGoToBookmark,
}: ReaderSettingsProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'bookmarks'>('display');

  return (
    <div className="absolute top-14 right-4 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('display')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'display'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          📖 显示
        </button>
        <button
          onClick={() => setActiveTab('bookmarks')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'bookmarks'
              ? 'text-blue-500 border-b-2 border-blue-500'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          🔖 书签 ({bookmarks.length})
        </button>
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'display' ? (
          <div className="space-y-5">
            {/* Reading mode */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                阅读主题
              </label>
              <div className="flex gap-2">
                {(['light', 'dark', 'sepia'] as ReaderMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      mode === m
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {m === 'light' ? '☀️' : m === 'dark' ? '🌙' : '📜'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between">
                <span>字体大小</span>
                <span className="text-blue-500">{fontSize}px</span>
              </label>
              <input
                type="range"
                min="12"
                max="32"
                value={fontSize}
                onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span style={{ fontSize: '12px' }}>A</span>
                <span style={{ fontSize: '22px' }}>A</span>
              </div>
            </div>

            {/* Line height */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between">
                <span>行间距</span>
                <span className="text-blue-500">{lineHeight.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="1.2"
                max="2.5"
                step="0.1"
                value={lineHeight}
                onChange={(e) => onLineHeightChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            {/* Font family */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                字体
              </label>
              <select
                value={fontFamily}
                onChange={(e) => onFontFamilyChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Georgia, serif">衬线字体 (Georgia)</option>
                <option value="Merriweather, serif">阅读字体 (Merriweather)</option>
                <option value="system-ui, sans-serif">系统字体</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Tahoma, sans-serif">Tahoma</option>
                <option value="'Noto Serif SC', serif">思源宋体</option>
                <option value="'Noto Sans SC', sans-serif">思源黑体</option>
              </select>
            </div>

            {/* Margin */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between">
                <span>页面边距</span>
                <span className="text-blue-500">{margin}px</span>
              </label>
              <input
                type="range"
                min="20"
                max="120"
                value={margin}
                onChange={(e) => onMarginChange(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={onAddBookmark} className="w-full" size="sm">
              ➕ 添加书签
            </Button>

            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">🔖</div>
                <p className="text-sm">暂无书签</p>
                <p className="text-xs mt-1">点击上方按钮添加书签</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    onClick={() => onGoToBookmark(bookmark)}
                    className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          书签 - {bookmark.percentage}%
                        </p>
                        {bookmark.note && (
                          <p className="text-xs text-gray-500 mt-1">{bookmark.note}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(bookmark.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ✕
      </button>
    </div>
  );
}

// ==================== Reader Controls ====================
interface ReaderControlsProps {
  book: Book | null;
  position: ReaderPosition;
  mode: ReaderMode;
  fontSize: number;
  onModeChange: (mode: ReaderMode) => void;
  onFontSizeChange: (size: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onGoBack: () => void;
  onGoToPage: (page: number) => void;
  onToggleAutoScroll: () => void;
  isAutoScroll: boolean;
  bookmarks: Bookmark[];
  onAddBookmark: () => void;
  showSettings: boolean;
  onToggleSettings: () => void;
  settingsPanel: React.ReactNode;
}

function ReaderControls({
  book,
  position,
  mode: _mode,
  fontSize: _fontSize,
  onModeChange: _onModeChange,
  onFontSizeChange: _onFontSizeChange,
  onPrevPage,
  onNextPage,
  onGoBack,
  onGoToPage,
  onToggleAutoScroll,
  isAutoScroll,
  bookmarks: _bookmarks,
  onAddBookmark,
  showSettings,
  onToggleSettings,
  settingsPanel,
}: ReaderControlsProps) {
  const [showPageInput, setShowPageInput] = useState(false);
  const [pageInput, setPageInput] = useState('');

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(pageInput);
    if (page > 0 && page <= (position.totalPages || 100)) {
      onGoToPage(page);
    }
    setShowPageInput(false);
    setPageInput('');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Top bar */}
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={onGoBack}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span>←</span>
            <span className="text-sm hidden sm:inline">返回</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Title (hidden on mobile) */}
            <h1 className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block truncate max-w-[200px]">
              {book?.title}
            </h1>

            {/* Page indicator */}
            <button
              onClick={() => setShowPageInput(!showPageInput)}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <span>{position.currentPage ?? 0}</span>
              <span className="text-gray-400">/</span>
              <span>{position.totalPages ?? '?'}</span>
            </button>

            {/* Quick actions */}
            <button
              onClick={onAddBookmark}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="添加书签"
            >
              🔖
            </button>

            <button
              onClick={onToggleAutoScroll}
              className={`p-2 rounded-lg transition-colors ${
                isAutoScroll
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              title={isAutoScroll ? '关闭自动滚动' : '开启自动滚动'}
            >
              ⏱️
            </button>

            {/* Settings toggle */}
            <button
              onClick={onToggleSettings}
              className={`p-2 rounded-lg transition-colors ${
                showSettings
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Page input popup */}
        {showPageInput && (
          <form onSubmit={handlePageSubmit} className="absolute top-14 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 z-50">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                placeholder={`1-${position.totalPages || 100}`}
                min={1}
                max={position.totalPages || 100}
                autoFocus
                className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button type="submit" size="sm">跳转</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowPageInput(false)}>取消</Button>
            </div>
          </form>
        )}

        {/* Settings panel */}
        {showSettings && settingsPanel}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-2 sm:gap-4 py-3 px-4">
          <button
            onClick={onPrevPage}
            className="p-2 sm:p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={position.currentPage === 1}
            title="上一页 (←)"
          >
            <span className="text-xl">‹</span>
          </button>

          {/* Progress bar */}
          <div className="flex-1 max-w-md mx-2">
            <input
              type="range"
              min="0"
              max="100"
              value={position.percentage}
              onChange={(e) => {
                const pct = parseInt(e.target.value);
                if (position.totalPages) {
                  const targetPage = Math.round((pct / 100) * position.totalPages);
                  onGoToPage(targetPage);
                }
              }}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:hover:bg-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
              <span>0%</span>
              <span className="text-blue-500 font-medium">{position.percentage}%</span>
              <span>100%</span>
            </div>
          </div>

          <button
            onClick={onNextPage}
            className="p-2 sm:p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={position.currentPage === position.totalPages}
            title="下一页 (→)"
          >
            <span className="text-xl">›</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Main Reader Component ====================
export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isPremium } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showFormatTip, setShowFormatTip] = useState(false);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    mode,
    fontSize,
    lineHeight,
    fontFamily,
    margin,
    setMode,
    setFontSize,
    setLineHeight,
    setFontFamily,
    setMargin,
  } = useReaderStore();

  // Load bookmarks from localStorage
  useEffect(() => {
    if (!id) return;
    try {
      const stored = localStorage.getItem(`bookdock_bookmarks_${id}`);
      if (stored) {
        setBookmarks(JSON.parse(stored));
      }
    } catch {
      // Ignore
    }
  }, [id]);

  // Save bookmarks to localStorage
  const saveBookmarks = useCallback((newBookmarks: Bookmark[]) => {
    if (!id) return;
    setBookmarks(newBookmarks);
    localStorage.setItem(`bookdock_bookmarks_${id}`, JSON.stringify(newBookmarks));
  }, [id]);

  // Auto scroll
  useEffect(() => {
    if (isAutoScroll && containerRef.current) {
      autoScrollTimerRef.current = setInterval(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop += 2;
        }
      }, 50);
    } else if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
    }

    return () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current);
      }
    };
  }, [isAutoScroll]);

  // Fetch book
  useEffect(() => {
    const fetchBook = async () => {
      if (!id) return;

      setIsLoading(true);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getBook(id);

        if (response.success && response.data) {
          setBook(response.data);
          // Show format tip for first time or occasionally
          const tipKey = `bookdock_format_tip_shown_${response.data.fileType}`;
          if (!localStorage.getItem(tipKey)) {
            setShowFormatTip(true);
            localStorage.setItem(tipKey, 'true');
            // Auto-hide after 5s
            setTimeout(() => setShowFormatTip(false), 5000);
          }
        } else {
          setError(response.error || '加载书籍失败');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBook();
  }, [id]);

  const handlePositionChange = useCallback((pos: ReaderPosition) => {
    // Auto-save to localStorage immediately
    if (id && book) {
      saveProgressLocal({
        bookId: id,
        percentage: pos.percentage,
        currentPage: pos.currentPage,
        cfi: pos.cfi,
        timestamp: Date.now(),
        totalPages: pos.totalPages,
      });
    }
  }, [id, book]);

  const {
    containerRef: readerContainerRef,
    position,
    isLoading: isReaderLoading,
    error: readerError,
    nextPage,
    prevPage,
    goToPosition,
  } = useBookReader({
    book,
    autoSaveInterval: 5000,
    onPositionChange: handlePositionChange,
  });

  // Bookmark handlers (must be after useBookReader for position/goToPosition)
  const handleAddBookmark = useCallback(() => {
    if (!book) return;
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      cfi: '',
      position: position.currentPage || 0,
      createdAt: new Date().toISOString(),
      percentage: position.percentage,
    };
    saveBookmarks([...bookmarks, newBookmark]);
  }, [book, position, bookmarks, saveBookmarks]);

  const handleGoToBookmark = useCallback((bookmark: Bookmark) => {
    goToPosition({ percentage: bookmark.percentage, currentPage: bookmark.position });
    setShowSettings(false);
  }, [goToPosition]);

  // Restore position from localStorage on mount
  useEffect(() => {
    if (id && position.percentage === 0) {
      const saved = getProgressLocal(id);
      if (saved && saved.percentage > 0) {
        goToPosition({
          percentage: saved.percentage,
          currentPage: saved.currentPage,
          cfi: saved.cfi,
        });
      }
    }
  }, [id, position.percentage, goToPosition]);

  const handleGoBack = useCallback(() => {
    // Save progress before going back
    if (book && position.percentage > 0) {
      const apiClient = getApiClient();
      apiClient.updateReadingProgress(book.id, position.percentage, position.currentPage).catch(() => {
        // Ignore errors on navigate away
      });
    }
    navigate(-1);
  }, [navigate, book, position]);

  const handleModeChange = useCallback((newMode: ReaderMode) => {
    setMode(newMode);
  }, [setMode]);

  const handleFontSizeChange = useCallback((newSize: number) => {
    setFontSize(newSize);
  }, [setFontSize]);

  const handleLineHeightChange = useCallback((newHeight: number) => {
    setLineHeight(newHeight);
  }, [setLineHeight]);

  const handleFontFamilyChange = useCallback((newFamily: string) => {
    setFontFamily(newFamily);
  }, [setFontFamily]);

  const handleMarginChange = useCallback((newMargin: number) => {
    setMargin(newMargin);
  }, [setMargin]);

  const handleGoToPage = useCallback((page: number) => {
    if (position.totalPages) {
      const percentage = (page / position.totalPages) * 100;
      goToPosition({ percentage, currentPage: page });
    }
  }, [position.totalPages, goToPosition]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          prevPage();
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          nextPage();
          break;
        case 'Home':
          e.preventDefault();
          goToPosition({ percentage: 0, currentPage: 1 });
          break;
        case 'End':
          e.preventDefault();
          goToPosition({ percentage: 100, currentPage: position.totalPages });
          break;
        case 'Escape':
          setShowSettings(false);
          setShowFormatTip(false);
          break;
        case 'b':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleAddBookmark();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, goToPosition, position.totalPages, handleAddBookmark]);

  // Touch swipe handling
  useEffect(() => {
    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].screenX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 100) {
        if (diff > 0) {
          nextPage();
        } else {
          prevPage();
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [nextPage, prevPage]);

  const handleToggleAutoScroll = () => {
    setIsAutoScroll(!isAutoScroll);
  };

  const settingsPanel = (
    <ReaderSettings
      mode={mode}
      fontSize={fontSize}
      lineHeight={lineHeight}
      fontFamily={fontFamily}
      margin={margin}
      onModeChange={handleModeChange}
      onFontSizeChange={handleFontSizeChange}
      onLineHeightChange={handleLineHeightChange}
      onFontFamilyChange={handleFontFamilyChange}
      onMarginChange={handleMarginChange}
      onClose={() => setShowSettings(false)}
      bookmarks={bookmarks}
      onAddBookmark={handleAddBookmark}
      onGoToBookmark={handleGoToBookmark}
    />
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">加载书籍中...</p>
        </div>
      </div>
    );
  }

  if (error || readerError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">📕</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {error || readerError}
          </h2>
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={() => navigate('/')}>返回书库</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>重试</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-6xl mb-4">📭</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">书籍不存在</h2>
          <Button onClick={() => navigate('/')}>返回书库</Button>
        </div>
      </div>
    );
  }

  const formatInfo = FORMAT_TIPS[book.fileType];

  return (
    <div
      className={`min-h-screen ${
        mode === 'dark'
          ? 'bg-gray-900 text-gray-100'
          : mode === 'sepia'
          ? 'bg-amber-50 text-amber-900'
          : 'bg-white text-gray-900'
      }`}
    >
      <ReaderControls
        book={book}
        position={position}
        mode={mode}
        fontSize={fontSize}
        onModeChange={handleModeChange}
        onFontSizeChange={handleFontSizeChange}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoBack={handleGoBack}
        onGoToPage={handleGoToPage}
        onToggleAutoScroll={handleToggleAutoScroll}
        isAutoScroll={isAutoScroll}
        bookmarks={bookmarks}
        onAddBookmark={handleAddBookmark}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
        settingsPanel={settingsPanel}
      />

      {/* Format compatibility tip toast */}
      {showFormatTip && formatInfo && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
          <div className={`px-4 py-3 rounded-xl shadow-lg border max-w-sm text-sm ${
            formatInfo.supported
              ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200'
              : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200'
          }`}>
            <div className="flex items-start gap-2">
              <span className="text-lg">{formatInfo.icon}</span>
              <div>
                <p className="font-medium capitalize">{book.fileType} 格式</p>
                <p className="text-xs opacity-80 mt-0.5">{formatInfo.tip}</p>
              </div>
              <button
                onClick={() => setShowFormatTip(false)}
                className="ml-2 opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Format indicator in reader */}
      <div className="fixed top-14 left-4 z-30">
        <span className="px-2 py-1 bg-black/40 rounded text-xs text-white uppercase">
          {book.fileType}
        </span>
      </div>

      {/* Reader container */}
      <div
        ref={(el) => {
          (readerContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={`reading-container ${mode} pt-14 pb-20 overflow-auto`}
        style={{
          padding: `${margin}px`,
          maxWidth: '800px',
          margin: '0 auto',
          minHeight: '100vh',
          fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight,
        }}
      >
        {isReaderLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="fixed bottom-20 left-4 text-xs text-gray-400 dark:text-gray-500 opacity-50">
          ← → 翻页 | 空格 下一页 | B 添加书签
        </div>
      </div>

      {/* TTS button */}
      <button
        onClick={() => navigate(`/book/${id}/tts`)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 z-40"
        title="听书模式 (会员专属)"
      >
        <span className="text-xl">🔊</span>
        {!isPremium && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 text-white text-[10px] rounded-full flex items-center justify-center font-bold">VIP</span>
        )}
      </button>
    </div>
  );
}
