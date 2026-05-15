import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getApiClient, Book } from '@bookdock/api-client';
import { useReaderStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { Button } from '@bookdock/ui';
import type { ReaderMode } from '@bookdock/ebook-reader';
import { ArrowLeft, Settings, BookOpen, Bookmark, ChevronLeft, ChevronRight, Volume2, Timer, X, Keyboard, Sun, Moon, ScrollText, Plus } from 'lucide-react';

// ==================== Bookmark ====================
interface Bookmark {
  id: string;
  cfi: string;
  position: number;
  note?: string;
  createdAt: string;
  percentage: number;
}

// ==================== Chapter Drawer (TOC) - LEFT ====================
interface ChapterDrawerProps {
  chapters: { title: string; index: number }[];
  currentChapter: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectChapter: (index: number) => void;
}

function ChapterDrawer({ chapters, currentChapter, isOpen, onClose, onSelectChapter }: ChapterDrawerProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]');
      if (active) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer - LEFT */}
      <div className="fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"><BookOpen className="w-5 h-5" /> 目录</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chapter list */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {chapters.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <div className="mb-2 flex justify-center"><BookOpen className="w-8 h-8" /></div>
              <p className="text-sm">暂无章节信息</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2">
              {chapters.map((chapter, idx) => {
                const isActive = idx === currentChapter;
                return (
                  <button
                    key={chapter.index}
                    data-active={isActive}
                    onClick={() => {
                      onSelectChapter(idx);
                      onClose();
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs min-w-[1.5rem] text-center ${
                          isActive ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="truncate">{chapter.title}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 text-center">
          共 {chapters.length} 章 · 当前第 {currentChapter + 1} 章
        </div>
      </div>
    </>
  );
}

// ==================== Settings Drawer - RIGHT ====================
interface SettingsDrawerProps {
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
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
  onAddBookmark: () => void;
  onGoToBookmark: (bookmark: Bookmark) => void;
}

function SettingsDrawer({
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
  isOpen,
  onClose,
  bookmarks,
  onAddBookmark,
  onGoToBookmark,
}: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'bookmarks'>('display');

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer - RIGHT */}
      <div className="fixed top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white"><Settings className="w-5 h-5 inline mr-1" /> 设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-5">
          <button
            onClick={() => setActiveTab('display')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'display'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <BookOpen className="w-4 h-4 inline mr-1" /> 显示
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'bookmarks'
                ? 'text-blue-500 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Bookmark className="w-4 h-4 inline mr-1" /> 书签 ({bookmarks.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
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
                      {m === 'light' ? <Sun className="w-5 h-5 mx-auto" /> : m === 'dark' ? <Moon className="w-5 h-5 mx-auto" /> : <ScrollText className="w-5 h-5 mx-auto" />}
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
              <Button onClick={onAddBookmark} className="w-full flex items-center justify-center gap-1" size="sm">
                <Plus className="w-4 h-4" /> 添加书签
              </Button>

              {bookmarks.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <div className="mb-2 flex justify-center"><Bookmark className="w-10 h-10" /></div>
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
      </div>
    </>
  );
}

// ==================== Reader Controls ====================
interface ReaderControlsProps {
  book: Book | null;
  currentChapter: number;
  totalChapters: number;
  chapterTitle: string;
  mode: ReaderMode;
  onPrevPage: () => void;
  onNextPage: () => void;
  onGoBack: () => void;
  onGoToPage: (page: number) => void;
  onToggleAutoScroll: () => void;
  isAutoScroll: boolean;
  onToggleToc: () => void;
  onToggleSettings: () => void;
  onAddBookmark: () => void;
  showToc: boolean;
  showSettings: boolean;
  onNavigateTts: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

function ReaderControls({
  book,
  currentChapter,
  totalChapters,
  chapterTitle,
  onPrevPage,
  onNextPage,
  onGoBack,
  onGoToPage,
  onToggleAutoScroll,
  isAutoScroll,
  onToggleToc,
  onToggleSettings,
  onAddBookmark,
  showToc,
  showSettings,
  onNavigateTts,
  scrollContainerRef,
}: ReaderControlsProps) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleScroll = () => {
      const currentY = container.scrollTop;
      if (currentY > lastScrollY.current && currentY > 60) {
        // Scrolling down: hide
        setHidden(true);
      } else if (currentY < lastScrollY.current) {
        // Scrolling up: show
        setHidden(false);
      }
      lastScrollY.current = currentY;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  const handleMouseEnterTop = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHidden(false);
  };

  const handleMouseLeaveTop = () => {
    hideTimer.current = setTimeout(() => setHidden(true), 2000);
  };

  const handleMouseEnterBottom = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHidden(false);
  };

  const handleMouseLeaveBottom = () => {
    hideTimer.current = setTimeout(() => setHidden(true), 2000);
  };

  const barTransition = 'transform 0.3s ease-in-out';

  return (
    <>
      {/* Top bar */}
      <div
        className="fixed top-0 left-0 right-0 z-50"
        onMouseEnter={handleMouseEnterTop}
        onMouseLeave={handleMouseLeaveTop}
      >
        <div
          className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-md border-b border-white/20 dark:border-gray-700/30 shadow-sm"
          style={{ transform: hidden ? 'translateY(-100%)' : 'translateY(0)', transition: barTransition }}
        >
          <div className="flex items-center justify-between px-4 h-14 relative">
            {/* Left: back */}
            <button
              onClick={onGoBack}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors z-10"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">返回</span>
            </button>

            {/* Center: chapter title */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <h1
                className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[60%] text-center"
                title={chapterTitle}
              >
                {chapterTitle || `第 ${currentChapter + 1} 章`}
              </h1>
            </div>

            {/* Right: settings */}
            <button
              onClick={onToggleSettings}
              className={`p-2 rounded-lg transition-colors z-10 ${
                showSettings
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
              title="设置"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        onMouseEnter={handleMouseEnterBottom}
        onMouseLeave={handleMouseLeaveBottom}
      >
        <div
          className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-md border-t border-white/20 dark:border-gray-700/30"
          style={{ transform: hidden ? 'translateY(100%)' : 'translateY(0)', transition: barTransition }}
        >
          <div className="flex items-center justify-between gap-1 sm:gap-2 py-2 px-3 sm:px-4">
            {/* Left: TOC + Bookmark */}
            <div className="flex items-center gap-1">
              <button
                onClick={onToggleToc}
                className={`p-2 sm:p-2.5 rounded-lg transition-colors ${
                  showToc
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
                title="目录"
              >
                <BookOpen className="w-5 h-5" />
              </button>
              <button
                onClick={onAddBookmark}
                className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
                title="添加书签"
              >
                <Bookmark className="w-5 h-5" />
              </button>
            </div>

            {/* Center: prev + progress + next */}
            <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-center max-w-md">
              <button
                onClick={onPrevPage}
                className="p-2 sm:p-2.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentChapter === 0}
                title="上一章"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex-1 mx-1 sm:mx-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={totalChapters > 0 ? Math.round(((currentChapter + 1) / totalChapters) * 100) : 0}
                  onChange={(e) => {
                    const pct = parseInt(e.target.value);
                    const targetPage = Math.round((pct / 100) * totalChapters);
                    onGoToPage(Math.max(1, targetPage));
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:hover:bg-blue-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5 px-1">
                  <span>0%</span>
                  <span className="text-blue-500 font-medium">
                    {totalChapters > 0 ? Math.round(((currentChapter + 1) / totalChapters) * 100) : 0}%
                  </span>
                  <span>100%</span>
                </div>
              </div>

              <button
                onClick={onNextPage}
                className="p-2 sm:p-2.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={currentChapter >= totalChapters - 1}
                title="下一章 (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Right: TTS + Timer */}
            <div className="flex items-center gap-1">
              <button
                onClick={onNavigateTts}
                className="p-2 sm:p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
                title="听书模式"
              >
                <Volume2 className="w-5 h-5" />
              </button>
              <button
                onClick={onToggleAutoScroll}
                className={`p-2 sm:p-2.5 rounded-lg transition-colors ${
                  isAutoScroll
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
                title={isAutoScroll ? '关闭自动滚动' : '开启自动滚动'}
              >
                <Timer className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== Main Reader Component ====================
export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  // contentRef is used for both reading area and auto-scroll

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

  const [chapters, setChapters] = useState<{ title: string; index: number }[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapterContent, setChapterContent] = useState('');
  const [isChapterLoading, setIsChapterLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const prevChapterRef = useRef(0);
  const shouldResetScrollRef = useRef(false);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null);

  const getCurrentScrollTop = useCallback(() => {
    const elementScrollTop = contentRef.current?.scrollTop ?? 0;
    if (elementScrollTop > 0) return elementScrollTop;
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }, []);

  const applyScrollTop = useCallback((top: number, behavior: ScrollBehavior = 'auto') => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top, behavior });
    }
    window.scrollTo({ top, behavior });
    scrollPositionRef.current = top;
  }, []);

  const saveReadingPosition = useCallback((scrollTop = getCurrentScrollTop(), reason = 'progress') => {
    if (!id || chapters.length === 0) return;

    const progressPct = Math.round(((currentChapter + 1) / chapters.length) * 100);
    scrollPositionRef.current = scrollTop;

    getApiClient()
      .updateReadingProgress(id, progressPct, currentChapter, scrollTop)
      .then(() => console.log(`${reason} saved:`, { chapter: currentChapter, scrollTop }))
      .catch((err) => console.warn(`Failed to save ${reason}:`, err));
  }, [chapters.length, currentChapter, getCurrentScrollTop, id]);

  // Fetch chapters + load cloud progress (parallel to avoid race)
  useEffect(() => {
    const fetchChaptersAndProgress = async () => {
      if (!id) return;
      try {
        const apiClient = getApiClient();
        // Fetch chapters and progress in parallel
        const [chaptersRes, progressRes] = await Promise.allSettled([
          apiClient.getChapters(id),
          apiClient.getReadingProgress(id),
        ]);

        const chaptersData =
          chaptersRes.status === 'fulfilled' && chaptersRes.value.success
            ? chaptersRes.value.data
            : null;
        const progressData =
          progressRes.status === 'fulfilled' && progressRes.value?.success
            ? progressRes.value.data
            : null;

        if (chaptersData && chaptersData.length > 0) {
          const savedChapter = progressData?.currentChapter ?? 0;
          const savedScroll = progressData?.scrollOffset ?? 0;
          if (savedChapter >= 0 && savedChapter < chaptersData.length) {
            // Batch set states so fetchContent only runs once with correct chapter
            setChapters(chaptersData);
            setCurrentChapter(savedChapter);
            setPendingScrollTop(savedScroll);
          } else {
            setChapters(chaptersData);
          }
        }
      } catch (err) {
        console.error('Failed to fetch chapters:', err);
      }
    };
    fetchChaptersAndProgress();
  }, [id]);

  // Fetch chapter content (with cancellation to prevent race)
  useEffect(() => {
    let cancelled = false;

    const fetchContent = async () => {
      if (!id || chapters.length === 0) return;
      setIsChapterLoading(true);
      setReaderError(null);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getChapterContent(id, currentChapter);
        if (cancelled) return;
        if (response.success && response.data) {
          setChapterContent(response.data.content);
        } else {
          setReaderError(response.error || '加载章节失败');
        }
      } catch (err) {
        if (!cancelled) {
          setReaderError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setIsChapterLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [id, currentChapter, chapters.length]);

  const resetScroll = useCallback(() => {
    scrollPositionRef.current = 0;
    shouldResetScrollRef.current = true;
    setPendingScrollTop(null);
  }, []);

  const handleAddBookmark = useCallback(() => {
    if (!book) return;
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      cfi: '',
      position: currentChapter,
      createdAt: new Date().toISOString(),
      percentage: Math.round(((currentChapter + 1) / chapters.length) * 100),
    };
    saveBookmarks([...bookmarks, newBookmark]);
  }, [book, currentChapter, chapters.length, bookmarks, saveBookmarks]);

  const handleGoToBookmark = useCallback((bookmark: Bookmark) => {
    setCurrentChapter(bookmark.position);
    setShowSettings(false);
    resetScroll();
  }, [resetScroll]);

  // Auto scroll
  useEffect(() => {
    if (isAutoScroll && contentRef.current) {
      autoScrollTimerRef.current = setInterval(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop += 2;
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

  const handleGoBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

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
    setCurrentChapter(page - 1);
    resetScroll();
  }, [resetScroll]);

  const handleGoToChapter = useCallback((index: number) => {
    setCurrentChapter(index);
    scrollPositionRef.current = 0;
    shouldResetScrollRef.current = true;
    setPendingScrollTop(null);
    applyScrollTop(0);
  }, [applyScrollTop]);

  // Track the first visible line position + debounced save on scroll stop
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let scrollSaveTimer: NodeJS.Timeout | null = null;

    const handler = () => {
      const top = getCurrentScrollTop();
      scrollPositionRef.current = top;

      // Debounced save: only scroll changes trigger save
      if (scrollSaveTimer) clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(() => {
        saveReadingPosition(top, 'scroll progress');
      }, 1500);
    };

    el.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      el.removeEventListener('scroll', handler);
      window.removeEventListener('scroll', handler);
      if (scrollSaveTimer) {
        clearTimeout(scrollSaveTimer);
        saveReadingPosition(getCurrentScrollTop(), 'scroll progress');
      }
    };
  }, [getCurrentScrollTop, saveReadingPosition]);

  // Save immediately when chapter changes (skip during restore — restore effect saves itself)
  useEffect(() => {
    if (!id || chapters.length === 0 || pendingScrollTop !== null) return;
    if (prevChapterRef.current === currentChapter) return; // avoid duplicate save when pendingScrollTop flips to null
    prevChapterRef.current = currentChapter;

    const scrollTop = scrollPositionRef.current;
    saveReadingPosition(scrollTop, 'chapter progress');
  }, [id, currentChapter, chapters.length, pendingScrollTop, saveReadingPosition]);

  // Restore or reset scroll position after new chapter content renders
  useEffect(() => {
    if (!chapterContent || !contentRef.current) return;

    if (pendingScrollTop !== null) {
      // Restoring saved position
      const target = pendingScrollTop;
      const timer = setTimeout(() => {
        applyScrollTop(target);
        setPendingScrollTop(null);

        // Save restored progress immediately so DB has the first visible line.
        saveReadingPosition(target, 'restored progress');
      }, 300);
      return () => clearTimeout(timer);
    }

    if (shouldResetScrollRef.current) {
      // Explicit chapter navigation starts at the chapter top.
      const timer = setTimeout(() => {
        applyScrollTop(0, 'smooth');
        shouldResetScrollRef.current = false;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [applyScrollTop, chapterContent, pendingScrollTop, saveReadingPosition]);

  // Save the current first visible line when leaving the reader.
  useEffect(() => {
    const saveOnExit = () => saveReadingPosition(getCurrentScrollTop(), 'exit progress');

    window.addEventListener('pagehide', saveOnExit);
    window.addEventListener('beforeunload', saveOnExit);

    return () => {
      saveOnExit();
      window.removeEventListener('pagehide', saveOnExit);
      window.removeEventListener('beforeunload', saveOnExit);
    };
  }, [getCurrentScrollTop, saveReadingPosition]);

  const prevPage = useCallback(() => {
    setCurrentChapter((prev) => Math.max(0, prev - 1));
    resetScroll();
  }, [resetScroll]);

  const nextPage = useCallback(() => {
    setCurrentChapter((prev) => Math.min(chapters.length - 1, prev + 1));
    resetScroll();
  }, [chapters.length, resetScroll]);

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
          setCurrentChapter(0);
          resetScroll();
          break;
        case 'End':
          e.preventDefault();
          setCurrentChapter(chapters.length - 1);
          resetScroll();
          break;
        case 'Escape':
          setShowSettings(false);
          setShowToc(false);
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
  }, [nextPage, prevPage, chapters.length, handleAddBookmark, resetScroll]);

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

  const handleNavigateTts = useCallback(async () => {
    if (!id) return;
    
    // Check if user is logged in to Plus system
    const { refreshVipStatus, plusToken } = useAuthStore.getState();
    
    // If not logged in to Plus, redirect to member login
    if (!plusToken) {
      navigate('/member-login', { state: { from: location.pathname } });
      return;
    }
    
    // If logged in but not VIP, redirect to membership page
    const vipNow = await refreshVipStatus();
    if (!vipNow) {
      navigate('/membership', { state: { from: location.pathname } });
      return;
    }
    
    // User is VIP, navigate to TTS
    navigate(`/book/${id}/tts`);
  }, [id, navigate, location.pathname]);

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
          <div className="mb-4 flex justify-center"><BookOpen className="w-16 h-16 text-red-400" /></div>
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
          <div className="mb-4 flex justify-center"><BookOpen className="w-16 h-16 text-gray-400" /></div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">书籍不存在</h2>
          <Button onClick={() => navigate('/')}>返回书库</Button>
        </div>
      </div>
    );
  }

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
        currentChapter={currentChapter}
        totalChapters={chapters.length}
        chapterTitle={chapters[currentChapter]?.title || ''}
        mode={mode}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoBack={handleGoBack}
        onGoToPage={handleGoToPage}
        onToggleAutoScroll={handleToggleAutoScroll}
        isAutoScroll={isAutoScroll}
        onToggleToc={() => setShowToc(!showToc)}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onAddBookmark={handleAddBookmark}
        showToc={showToc}
        showSettings={showSettings}
        onNavigateTts={handleNavigateTts}
        scrollContainerRef={contentRef}
      />

      {/* Chapter Drawer (TOC) - LEFT */}
      <ChapterDrawer
        chapters={chapters}
        currentChapter={currentChapter}
        isOpen={showToc}
        onClose={() => setShowToc(false)}
        onSelectChapter={handleGoToChapter}
      />

      {/* Settings Drawer - RIGHT */}
      <SettingsDrawer
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
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        bookmarks={bookmarks}
        onAddBookmark={handleAddBookmark}
        onGoToBookmark={handleGoToBookmark}
      />

      {/* Reader container */}
      <div
        ref={contentRef}
        className={`reading-container ${mode} pt-20 pb-20 overflow-auto`}
        style={{
          padding: `${margin + 80}px ${margin}px ${margin + 80}px`,
          height: '100vh',
          boxSizing: 'border-box',
          fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight,
        }}
      >
        {isChapterLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        )}

        {!isChapterLoading && chapterContent && (
          <div>
            {/* Chapter title */}
            <h2
              className="text-xl sm:text-2xl font-bold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700"
              style={{ fontFamily }}
            >
              {chapters[currentChapter]?.title || `第 ${currentChapter + 1} 章`}
            </h2>
            <div className="whitespace-pre-wrap leading-relaxed">
              {chapterContent}
            </div>
          </div>
        )}

        {!isChapterLoading && !chapterContent && !readerError && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            本章无内容
          </div>
        )}
      </div>
    </div>
  );
}
