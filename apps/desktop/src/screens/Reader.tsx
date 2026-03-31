import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TTSControls } from '../components/TTSControls';
import {
    readFileText,
    updateReadingProgress
} from '../hooks/useDesktopCommands';
import { useDesktopStore } from '../stores/desktopStore';

// Simple EPUB renderer for desktop
// In production, you'd use epub.js bundled with the app
class SimpleEpubRenderer {
  private container: HTMLElement;
  private chapters: string[] = [];
  private currentChapter: number = 0;
  private content: string = '';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async load(content: string): Promise<void> {
    this.content = content;
    // Split content into chapters by double newlines or chapter markers
    this.chapters = content
      .split(/\n\n+/)
      .filter((c) => c.trim().length > 0)
      .slice(0, 50); // Limit to 50 chapters for demo
    this.render();
  }

  private render(): void {
    if (this.chapters.length === 0) {
      this.container.innerHTML = `
        <div class="flex items-center justify-center h-full text-gray-400">
          <p>暂无内容</p>
        </div>
      `;
      return;
    }

    const chapter = this.chapters[this.currentChapter];
    this.container.innerHTML = `
      <div class="prose dark:prose-invert max-w-none">
        <h2 class="text-xl font-bold mb-4">第 ${this.currentChapter + 1} 章</h2>
        <div class="whitespace-pre-wrap leading-relaxed">${chapter}</div>
      </div>
    `;
  }

  next(): void {
    if (this.currentChapter < this.chapters.length - 1) {
      this.currentChapter++;
      this.render();
    }
  }

  prev(): void {
    if (this.currentChapter > 0) {
      this.currentChapter--;
      this.render();
    }
  }

  getProgress(): { current: number; total: number; percentage: number } {
    return {
      current: this.currentChapter + 1,
      total: this.chapters.length,
      percentage: Math.round(((this.currentChapter + 1) / this.chapters.length) * 100),
    };
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}

interface ReaderScreenProps {
  bookId?: string;
  onBack?: () => void;
}

export function ReaderScreen({ bookId: propBookId, onBack }: ReaderScreenProps) {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const bookId = propBookId || paramId;

  const { books, selectedBook, selectBook, updateBookProgress, isTtsMode, setIsTtsMode } =
    useDesktopStore();

  const [book, setBook] = useState<any>(null);
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'light' | 'dark' | 'sepia'>('light');
  const [fontSize, setFontSize] = useState(16);
  const [showControls, setShowControls] = useState(true);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [showBookmarkList, setShowBookmarkList] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SimpleEpubRenderer | null>(null);

  useEffect(() => {
    const loadBook = async () => {
      if (!bookId) return;

      setIsLoading(true);
      setError(null);

      try {
        // Find book in store or use selected book
        const foundBook =
          books.find((b) => b.id === bookId) || selectedBook;

        if (foundBook) {
          setBook(foundBook);

          // Load content from local file
          if (foundBook.filePath) {
            try {
              const text = await readFileText(foundBook.filePath);
              setContent(text);
            } catch {
              // Fallback content
              setContent(`
第一章

这是一个示例书籍内容。在正式版本中，您导入的电子书内容将显示在这里。

BookDock 桌面版支持以下格式：
• EPUB 电子书
• PDF 文档
• TXT 文本文件
• MOBI 格式

阅读愉快！

第二章

继续阅读的内容...
              `.trim());
            }
          } else {
            // Demo content
            setContent(`
BookDock 阅读器

欢迎使用 BookDock！这是一个专门为 NAS 用户设计的电子书阅读器。

功能特点：

📚 多格式支持
支持 EPUB、PDF、TXT 等主流电子书格式。

🔊 听书模式
内置 TTS 语音朗读功能，让您的双眼得到休息。

📁 本地文件访问
直接读取 NAS 挂载路径的电子书，无需导入。

⌨️ 全局快捷键
• Ctrl+Shift+B: 播放/暂停听书
• Ctrl+Shift+N: 下一段
• Ctrl+Shift+P: 上一段

🪟 窗口管理
支持多窗口阅读，可调整窗口大小和位置。

正在开发中...
更多功能敬请期待！
            `.trim());
          }
        } else {
          setError('书籍未找到');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadBook();
  }, [bookId, books, selectedBook]);

  useEffect(() => {
    if (content && containerRef.current) {
      rendererRef.current = new SimpleEpubRenderer(containerRef.current);
      rendererRef.current.load(content);
    }

    return () => {
      rendererRef.current?.destroy();
    };
  }, [content]);

  const handleProgressUpdate = useCallback(
    async (progress: number) => {
      if (book?.id) {
        updateBookProgress(book.id, progress);
        await updateReadingProgress(book.id, progress);
      }
    },
    [book, updateBookProgress]
  );

  const handleNext = useCallback(() => {
    rendererRef.current?.next();
    const progress = rendererRef.current?.getProgress();
    if (progress) {
      handleProgressUpdate(progress.percentage);
    }
  }, [handleProgressUpdate]);

  const handlePrev = useCallback(() => {
    rendererRef.current?.prev();
    const progress = rendererRef.current?.getProgress();
    if (progress) {
      handleProgressUpdate(progress.percentage);
    }
  }, [handleProgressUpdate]);

  const handleGoBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      selectBook(null);
      navigate(-1);
    }
  }, [onBack, selectBook, navigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          handlePrev();
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          handleNext();
          break;
        case 'Escape':
          handleGoBack();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, handleGoBack]);

  const progress = rendererRef.current?.getProgress() || { current: 1, total: 1, percentage: 0 };

  const bgClass =
    mode === 'dark'
      ? 'bg-gray-900 text-gray-200'
      : mode === 'sepia'
        ? 'bg-amber-50 text-amber-900'
        : 'bg-white text-gray-900';

  if (isLoading) {
    return (
      <div className={`h-screen ${bgClass} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`h-screen ${bgClass} flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-6xl mb-4">📕</div>
          <h2 className="text-xl font-semibold mb-2">加载失败</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={handleGoBack}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen ${bgClass} flex flex-col`}>
      {/* Top bar */}
      {showControls && (
        <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 h-14">
            <button
              onClick={handleGoBack}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <span>←</span>
              <span className="text-sm">返回</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="font-medium truncate max-w-xs">
                {book?.title || '阅读器'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Progress */}
              <span className="text-sm text-gray-500">
                {progress.current}/{progress.total} ({progress.percentage}%)
              </span>

              {/* TTS toggle */}
              <button
                onClick={() => setIsTtsMode(!isTtsMode)}
                className={`p-2 rounded-lg transition-colors ${
                  isTtsMode
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="听书模式"
              >
                🔊
              </button>

              {/* Bookmark button */}
              <button
                onClick={() => {
                  // Add current position as bookmark
                  const progress = rendererRef.current?.getProgress();
                  if (progress) {
                    const newBookmark = {
                      id: Date.now().toString(),
                      percentage: progress.percentage,
                      createdAt: new Date().toISOString(),
                    };
                    setBookmarks((prev) => [...prev, newBookmark]);
                    // Save to localStorage
                    if (book?.id) {
                      const key = `bookdock_bookmarks_${book.id}`;
                      const existing = JSON.parse(localStorage.getItem(key) || '[]');
                      localStorage.setItem(key, JSON.stringify([...existing, newBookmark]));
                    }
                  }
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                title="添加书签"
              >
                🔖
              </button>

              {/* Bookmark list toggle */}
              <button
                onClick={() => setShowBookmarkList(!showBookmarkList)}
                className={`relative p-2 rounded-lg transition-colors ${
                  showBookmarkList
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-600'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="书签列表"
              >
                📑
                {bookmarks.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {bookmarks.length}
                  </span>
                )}
              </button>

              {/* Settings */}
              <div className="relative">
                <button
                  onClick={() => {
                    const modes: Array<'light' | 'dark' | 'sepia'> = [
                      'light',
                      'dark',
                      'sepia',
                    ];
                    const currentIndex = modes.indexOf(mode);
                    setMode(modes[(currentIndex + 1) % modes.length]);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '📜'}
                </button>
              </div>
            </div>
          </div>

          {/* Font size slider */}
          <div className="flex items-center gap-4 px-4 pb-3">
            <span className="text-xs text-gray-500">字体大小</span>
            <input
              type="range"
              min="12"
              max="28"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="flex-1 accent-blue-500"
            />
            <span className="text-xs text-gray-500 w-6">{fontSize}px</span>
          </div>
        </header>
      )}

      {/* Reader content */}
      <main
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6"
        style={{ fontSize: `${fontSize}px` }}
      />

      {/* Bottom navigation */}
      {showControls && (
        <footer className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center gap-8 py-4">
            <button
              onClick={handlePrev}
              disabled={progress.current <= 1}
              className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-30"
            >
              ‹
            </button>

            <div className="flex-1 max-w-md mx-4">
              <input
                type="range"
                min="0"
                max="100"
                value={progress.percentage}
                readOnly
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
              />
            </div>

            <button
              onClick={handleNext}
              disabled={progress.current >= progress.total}
              className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </footer>
      )}

      {/* TTS overlay */}
      {isTtsMode && (
        <div className="fixed bottom-6 right-6 w-80 z-50">
          <TTSControls
            text={content}
            bookId={book?.id}
            onClose={() => setIsTtsMode(false)}
          />
        </div>
      )}

      {/* Bookmark list panel */}
      {showBookmarkList && (
        <div className="fixed top-14 right-4 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 max-h-[60vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-gray-900 dark:text-white">书签列表 ({bookmarks.length})</h3>
            <button onClick={() => setShowBookmarkList(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="text-3xl mb-2">🔖</div>
                <p className="text-sm">暂无书签</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookmarks.map((bookmark) => (
                  <div key={bookmark.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">书签 - {bookmark.percentage}%</p>
                        <p className="text-xs text-gray-500">{new Date(bookmark.createdAt).toLocaleDateString('zh-CN')}</p>
                      </div>
                      <button
                        onClick={() => setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id))}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
