import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getApiClient, Book } from '@bookdock/api-client';
import { useReaderStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { Button } from '@bookdock/ui';
import type { ReaderMode } from '@bookdock/ebook-reader';
import { ArrowLeft, Settings, BookOpen, Bookmark, ChevronLeft, ChevronRight, Volume2, Timer, X, Sun, Moon, ScrollText, Plus, Highlighter, MessageSquare, MessageSquarePlus } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getCachedChapters, setCachedChapters, getCachedChapterContent, setCachedChapterContent, getCachedFile, setCachedFile } from '../utils/bookCache';

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ==================== Bookmark ====================
interface Bookmark {
  id: string;
  cfi: string;
  position: number;
  note?: string;
  createdAt: string;
  percentage: number;
}

// ==================== Note & Highlight ====================
interface Note {
  id: string;
  bookId: string;
  text: string;
  note?: string;
  cfi?: string;
  percentage?: number;
  author?: string;
  bookTitle?: string;
  createdAt: string;
}

interface Highlight {
  id: string;
  bookId: string;
  cfi: string;
  text: string;
  color: string;
  note?: string;
  createdAt: string;
}

interface SelectionMenuProps {
  position: { x: number; y: number };
  selectedText: string;
  onNote: () => void;
  onHighlight: () => void;
  onDismiss: () => void;
}

function SelectionMenu({ position, onNote, onHighlight, onDismiss }: SelectionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onDismiss]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 px-1 flex gap-1"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -120%)' }}
    >
      <button
        onClick={onHighlight}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
      >
        <Highlighter className="w-4 h-4 text-amber-500" />
        高亮
      </button>
      <button
        onClick={onNote}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
      >
        <MessageSquarePlus className="w-4 h-4 text-blue-500" />
        笔记
      </button>
    </div>
  );
}

// ==================== Note Modal ====================
interface NoteModalProps {
  isOpen: boolean;
  selectedText: string;
  onClose: () => void;
  onSave: (note: string) => void;
}

function NoteModal({ isOpen, selectedText, onClose, onSave }: NoteModalProps) {
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (isOpen) setNoteText('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">添加笔记</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border-l-4 border-amber-400">
          <p className="text-sm text-gray-600 dark:text-gray-300 italic">{selectedText}</p>
        </div>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="写下你的想法..."
          className="w-full h-32 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button onClick={onClose}>取消</Button>
          <Button onClick={() => { onSave(noteText); onClose(); }}>保存</Button>
        </div>
      </div>
    </div>
  );
}

// ==================== TOC Panel ====================
interface TocPanelProps {
  chapters: Array<{ title: string; index: number }>;
  currentChapter: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  bookTitle: string;
}

function TocPanel({ chapters, currentChapter, onSelect, onClose, bookTitle }: TocPanelProps) {
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 z-50 w-80 bg-white dark:bg-gray-800 shadow-xl flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2">{bookTitle}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {chapters.map((chapter) => (
            <div
              key={chapter.index}
              ref={chapter.index === currentChapter ? currentRef : null}
              onClick={() => { onSelect(chapter.index); onClose(); }}
              className={`px-4 py-3 cursor-pointer text-sm transition-colors ${
                chapter.index === currentChapter
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium border-r-2 border-blue-500'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {chapter.title}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ==================== Settings Panel ====================
interface SettingsPanelProps {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  margin: number;
  mode: ReaderMode;
  onFontSizeChange: (size: number) => void;
  onLineHeightChange: (height: number) => void;
  onFontFamilyChange: (family: string) => void;
  onMarginChange: (margin: number) => void;
  onModeChange: (mode: ReaderMode) => void;
  onClose: () => void;
}

function SettingsPanel({
  fontSize, lineHeight, fontFamily, margin, mode,
  onFontSizeChange, onLineHeightChange, onFontFamilyChange, onMarginChange, onModeChange, onClose
}: SettingsPanelProps) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white dark:bg-gray-800 shadow-xl flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">阅读设置</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Theme */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">主题</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { mode: 'light' as ReaderMode, label: '白天', icon: Sun },
                { mode: 'dark' as ReaderMode, label: '夜间', icon: Moon },
                { mode: 'sepia' as ReaderMode, label: ' sepia', icon: BookOpen },
              ].map(({ mode: m, label, icon: Icon }) => (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                    mode === m
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">字号 {fontSize}px</label>
            <input
              type="range" min="12" max="32" value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>12px</span>
              <span>32px</span>
            </div>
          </div>

          {/* Line Height */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">行距 {lineHeight}</label>
            <input
              type="range" min="1.2" max="2.5" step="0.1" value={lineHeight}
              onChange={(e) => onLineHeightChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Margin */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">边距 {margin}px</label>
            <input
              type="range" min="16" max="64" value={margin}
              onChange={(e) => onMarginChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Font Family */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">字体</label>
            <select
              value={fontFamily}
              onChange={(e) => onFontFamilyChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">系统默认</option>
              <option value="'Noto Serif SC', 'Source Han Serif SC', serif">思源宋体</option>
              <option value="'Noto Sans SC', 'Source Han Sans SC', sans-serif">思源黑体</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== PDF Viewer ====================
interface PdfViewerProps {
  url: string;
  currentPage: number;
  onPdfLoaded: (info: { totalPages: number; outline: Array<{ title: string; page: number }> }) => void;
}

function PdfViewer({ url, currentPage, onPdfLoaded }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const pageSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReady(false);
    pdfDocRef.current = null;
    pageSizeRef.current = null;

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;

        // Get first page size for aspect ratio
        const firstPage = await pdf.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1 });
        pageSizeRef.current = {
          width: unscaledViewport.width,
          height: unscaledViewport.height,
        };

        // Extract outline (bookmarks / table of contents)
        let outline: Array<{ title: string; page: number }> = [];
        try {
          const rawOutline = await pdf.getOutline();
          if (rawOutline && rawOutline.length > 0) {
            const dests = await pdf.getDestinations();
            const outlineItems: Array<{ title: string; page: number }> = [];
            for (const item of rawOutline) {
              let pageNum = 1;
              if (item.dest) {
                const dest = Array.isArray(item.dest) ? item.dest[0] : item.dest;
                if (typeof dest === 'string' && dests[dest]) {
                  const destRef = Array.isArray(dests[dest]) ? dests[dest][0] : dests[dest];
                  pageNum = (await pdf.getPageIndex(destRef)) + 1;
                } else if (dest && typeof dest === 'object' && 'num' in dest) {
                  pageNum = (await pdf.getPageIndex(dest)) + 1;
                }
              }
              outlineItems.push({ title: item.title || '未命名', page: pageNum });
            }
            outline = outlineItems;
          }
        } catch (e) {
          console.warn('Failed to extract PDF outline:', e);
        }

        onPdfLoaded({ totalPages: pdf.numPages, outline });
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '加载 PDF 失败');
          setLoading(false);
        }
      }
    };

    loadPdf();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [url, onPdfLoaded]);

  // Calculate scale based on container size
  const calculateScale = useCallback(() => {
    const container = containerRef.current;
    const pageSize = pageSizeRef.current;
    if (!container || !pageSize) return 1.5;

    const padding = 32; // p-4 = 16px * 2
    const availableWidth = container.clientWidth - padding;
    const availableHeight = container.clientHeight - padding;

    const scaleX = availableWidth / pageSize.width;
    const scaleY = availableHeight / pageSize.height;

    // Fit to container while maintaining aspect ratio
    return Math.min(scaleX, scaleY);
  }, []);

  // Render page
  useEffect(() => {
    const canvas = canvasRef.current;
    const pdf = pdfDocRef.current;
    if (!canvas || !pdf || loading) return;

    const renderPage = async () => {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      try {
        const page = await pdf.getPage(currentPage);
        const context = canvas.getContext('2d');
        if (!context) return;

        const scale = calculateScale();
        const viewport = page.getViewport({ scale });

        // Set canvas pixel dimensions
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        // Set CSS dimensions to match
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Clear and render
        context.clearRect(0, 0, canvas.width, canvas.height);
        renderTaskRef.current = page.render({ canvasContext: context, viewport });
        await renderTaskRef.current.promise;
        renderTaskRef.current = null;
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          setError(err.message || '渲染页面失败');
        }
      }
    };

    renderPage();
  }, [ready, currentPage, loading, calculateScale]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Trigger re-render with new scale
      if (ready && pdfDocRef.current) {
        const canvas = canvasRef.current;
        const pdf = pdfDocRef.current;
        if (!canvas || !pdf) return;

        const renderPage = async () => {
          if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
          }
          try {
            const page = await pdf.getPage(currentPage);
            const context = canvas.getContext('2d');
            if (!context) return;
            const scale = calculateScale();
            const viewport = page.getViewport({ scale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            context.clearRect(0, 0, canvas.width, canvas.height);
            renderTaskRef.current = page.render({ canvasContext: context, viewport });
            await renderTaskRef.current.promise;
            renderTaskRef.current = null;
          } catch (err: any) {
            if (err.name !== 'RenderingCancelledException') {
              console.error('Resize render error:', err);
            }
          }
        };
        renderPage();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [ready, currentPage, calculateScale]);

  return (
    <div className="fixed inset-0 pt-14 pb-16 bg-white dark:bg-gray-900 flex flex-col">
      <div ref={containerRef} className="flex-1 overflow-hidden flex justify-center items-center p-4">
        <canvas
          ref={canvasRef}
          className="shadow-lg"
          style={{
            visibility: loading || error ? 'hidden' : 'visible',
          }}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">加载 PDF 中...</p>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-red-500">
              <p>PDF 加载失败</p>
              <p className="text-sm mt-2">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
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
  isPdf?: boolean;
}

function ReaderControls({
  book,
  currentChapter,
  totalChapters,
  chapterTitle,
  mode,
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
  isPdf = false,
}: ReaderControlsProps) {
  const progress = totalChapters > 0 ? Math.round(((currentChapter + 1) / totalChapters) * 100) : 0;

  return (
    <>
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 z-30">
        <button
          onClick={onGoBack}
          className="flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="flex-1 mx-4 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {book?.title || '阅读中'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isPdf ? `${book?.title || ''} · 第 ${currentChapter + 1} / ${totalChapters} 页` : chapterTitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSettings}
            className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 z-30">
        {/* Progress bar */}
        <div className="px-4 pt-2">
          <input
            type="range"
            min="0"
            max={totalChapters - 1}
            value={currentChapter}
            onChange={(e) => onGoToPage(Number(e.target.value))}
            className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{progress}%</span>
            <span>{currentChapter + 1} / {totalChapters}</span>
            <span>100%</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleToc}
              className={`p-2 rounded-lg transition-colors ${showToc ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title="目录"
            >
              <BookOpen className="w-5 h-5" />
            </button>
            <button
              onClick={onAddBookmark}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="添加书签"
            >
              <Bookmark className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPrevPage}
              disabled={currentChapter <= 0}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={isPdf ? '上一页' : '上一章'}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={onNextPage}
              disabled={currentChapter >= totalChapters - 1}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={isPdf ? '下一页 (→)' : '下一章 (→)'}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onNavigateTts}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="语音朗读"
            >
              <Volume2 className="w-5 h-5" />
            </button>
            <button
              onClick={onToggleAutoScroll}
              className={`p-2 rounded-lg transition-colors ${isAutoScroll ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title="自动滚动"
            >
              <Timer className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ==================== Main Reader ====================
export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const shouldResetScrollRef = useRef(false);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Array<{ title: string; content?: string }>>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [chapterContent, setChapterContent] = useState('');
  const [isChapterLoading, setIsChapterLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null);

  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const [selectedText, setSelectedText] = useState('');
  const [selectionMenuPos, setSelectionMenuPos] = useState({ x: 0, y: 0 });
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteSelectedText, setNoteSelectedText] = useState('');

  const [noteSavedToast, setNoteSavedToast] = useState(false);
  const [highlightSavedToast, setHighlightSavedToast] = useState(false);

  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfOutline, setPdfOutline] = useState<Array<{ title: string; page: number }>>([]);
  const isPdf = book ? (book.fileType || book.format) === 'pdf' : false;

  // ── Note & Highlight state ────────────────────────────────────────────
  const [showNoteModalState, setShowNoteModalState] = useState(false);
  const [noteSelectedTextState, setNoteSelectedTextState] = useState('');

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

  // Fetch book
  useEffect(() => {
    const fetchBook = async () => {
      if (!id) return;
      try {
        const api = getApiClient();
        const res = await api.getBook(id);
        if (res.success && res.data) {
          setBook(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch book:', err);
      }
    };
    fetchBook();
  }, [id]);

  // Fetch bookmarks, notes, highlights
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const api = getApiClient();
        const [notesRes, hlRes] = await Promise.all([
          api.getNotes({ bookId: id }),
          api.getHighlights(id),
        ]);
        if (notesRes.success && notesRes.data) setNotes(notesRes.data.items || []);
        if (hlRes.success && hlRes.data) setHighlights(hlRes.data);
      } catch (err) {
        console.error('Failed to fetch reader data:', err);
      }
    };
    fetchData();
  }, [id]);

  // ── Scroll helpers ───────────────────────────────────────────────────
  const getCurrentScrollTop = useCallback(() => {
    if (contentRef.current) return contentRef.current.scrollTop;
    return window.scrollY || document.documentElement.scrollTop;
  }, []);

  const resetScroll = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0 });
    scrollPositionRef.current = 0;
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
      if (!id || !book) return;

      // PDF files: skip chapters, use direct download URL
      if (isPdf) {
        const apiClient = getApiClient();
        const token = localStorage.getItem('bookdock_auth_token') || '';
        const baseUrl = `${apiClient.baseURL}/books/${id}/download`;
        
        // Try cache first
        const cachedBlob = await getCachedFile(id);
        if (cachedBlob) {
          const pdfBlob = new Blob([cachedBlob], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(pdfBlob);
          setPdfUrl(blobUrl);
          return;
        }
        
        // Fetch from server and cache
        fetch(`${baseUrl}?token=${encodeURIComponent(token)}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
          })
          .then(async (blob) => {
            const pdfBlob = new Blob([blob], { type: 'application/pdf' });
            const blobUrl = URL.createObjectURL(pdfBlob);
            setPdfUrl(blobUrl);
            // Cache the blob for next time
            await setCachedFile(id, blob, 'application/pdf');
          })
          .catch((err) => {
            console.error('Failed to load PDF:', err);
            setError('PDF 加载失败: ' + err.message);
          });
        return;
      }

      try {
        const apiClient = getApiClient();
        
        // Try cache first
        const cachedChapters = await getCachedChapters(id);
        if (cachedChapters && cachedChapters.length > 0) {
          const progressRes = await apiClient.getReadingProgress(id);
          const progressData = progressRes?.success ? progressRes.data : null;
          const savedChapter = progressData?.currentChapter ?? 0;
          const savedScroll = progressData?.scrollOffset ?? 0;
          if (savedChapter >= 0 && savedChapter < cachedChapters.length) {
            setChapters(cachedChapters);
            setCurrentChapter(savedChapter);
            setPendingScrollTop(savedScroll);
          } else {
            setChapters(cachedChapters);
          }
          // Still fetch fresh chapters in background to update cache
          apiClient.getChapters(id).then((res) => {
            if (res.success && res.data && res.data.length > 0) {
              setCachedChapters(id, res.data);
            }
          }).catch(() => { /* ignore background refresh error */ });
          return;
        }
        
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
          // Cache chapters
          await setCachedChapters(id, chaptersData);
          
          const savedChapter = progressData?.currentChapter ?? 0;
          const savedScroll = progressData?.scrollOffset ?? 0;
          if (savedChapter >= 0 && savedChapter < chaptersData.length) {
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
  }, [id, book, isPdf]);

  // Fetch chapter content (with cancellation to prevent race)
  useEffect(() => {
    let cancelled = false;

    const fetchContent = async () => {
      if (!id || chapters.length === 0 || !book || isPdf) return;
      setIsChapterLoading(true);
      setReaderError(null);
      try {
        // Try cache first
        const cachedContent = await getCachedChapterContent(id, currentChapter);
        if (cachedContent) {
          if (!cancelled) {
            setChapterContent(cachedContent);
            setIsChapterLoading(false);
          }
          // Still fetch fresh content in background to update cache
          const apiClient = getApiClient();
          apiClient.getChapterContent(id, currentChapter)
            .then((response) => {
              if (response.success && response.data && response.data.content) {
                setCachedChapterContent(id, currentChapter, response.data.content);
              }
            })
            .catch(() => { /* ignore background refresh error */ });
          return;
        }
        
        const apiClient = getApiClient();
        const response = await apiClient.getChapterContent(id, currentChapter);
        if (cancelled) return;
        if (response.success && response.data) {
          setChapterContent(response.data.content);
          // Cache the content
          await setCachedChapterContent(id, currentChapter, response.data.content);
        } else {
          setReaderError(response.error || '加载章节失败');
        }
      } catch (err) {
        if (!cancelled) {
          setReaderError((err as Error).message);
        }
      } finally {
        if (!cancelled) setIsChapterLoading(false);
      }
    };

    fetchContent();
    return () => { cancelled = true; };
  }, [id, currentChapter, chapters.length, book, isPdf]);

  // Apply pending scroll after content loads
  useEffect(() => {
    if (pendingScrollTop !== null && !isChapterLoading && chapterContent) {
      const timer = setTimeout(() => {
        applyScrollTop(pendingScrollTop);
        setPendingScrollTop(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingScrollTop, isChapterLoading, chapterContent, applyScrollTop]);

  // Apply scroll reset when chapter changes
  useEffect(() => {
    if (shouldResetScrollRef.current) {
      shouldResetScrollRef.current = false;
      resetScroll();
    }
  }, [currentChapter, resetScroll]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showNoteModal || showSettings) return;

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
        case 'Escape':
          if (showToc) setShowToc(false);
          if (showSettings) setShowSettings(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showToc, showSettings, showNoteModal, currentChapter, chapters.length]);

  // ── Auto save scroll position ────────────────────────────────────────
  useEffect(() => {
    if (isPdf) return;

    let saveTimer: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const scrollTop = getCurrentScrollTop();
        if (Math.abs(scrollTop - scrollPositionRef.current) > 50) {
          saveReadingPosition(scrollTop, 'scroll');
        }
      }, 500);
    };

    const el = contentRef.current;
    if (el) el.addEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleScroll);

    return () => {
      clearTimeout(saveTimer);
      if (el) el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isPdf, getCurrentScrollTop, saveReadingPosition]);

  // ── Auto scroll ──────────────────────────────────────────────────────
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

  // ── Text selection for notes/highlights ──────────────────────────────
  const handleTextSelection = useCallback(() => {
    if (isPdf) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setShowSelectionMenu(false);
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      setShowSelectionMenu(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const firstRect = range.getClientRects()[0] || rect;
    setSelectedText(text);
    setSelectionMenuPos({ x: firstRect.left + firstRect.width / 2, y: firstRect.top });
    setShowSelectionMenu(true);
  }, [isPdf]);

  useEffect(() => {
    if (isPdf) return;

    const handleMouseUp = () => {
      setTimeout(handleTextSelection, 10);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleTextSelection, isPdf]);

  // ── Navigation ───────────────────────────────────────────────────────
  const prevPage = useCallback(() => {
    setCurrentChapter((prev) => {
      const next = Math.max(0, prev - 1);
      if (next !== prev) {
        if (!isPdf) resetScroll();
      }
      return next;
    });
  }, [isPdf, resetScroll]);

  const nextPage = useCallback(() => {
    setCurrentChapter((prev) => {
      const max = isPdf ? pdfTotalPages - 1 : chapters.length - 1;
      const next = Math.min(max, prev + 1);
      if (next !== prev) {
        if (!isPdf) resetScroll();
      }
      return next;
    });
  }, [isPdf, chapters.length, pdfTotalPages, resetScroll]);

  const handleGoToPage = useCallback((page: number) => {
    setCurrentChapter(page);
    if (!isPdf) resetScroll();
  }, [isPdf, resetScroll]);

  const handleGoBack = useCallback(() => {
    saveReadingPosition(getCurrentScrollTop(), 'exit');
    navigate(-1);
  }, [navigate, saveReadingPosition, getCurrentScrollTop]);

  const handlePdfLoaded = useCallback(({ totalPages, outline }: { totalPages: number; outline: Array<{ title: string; page: number }> }) => {
    setPdfTotalPages(totalPages);
    setPdfOutline(outline);
  }, []);

  // ── Bookmarks ────────────────────────────────────────────────────────
  const saveBookmarksToServer = useCallback((bookmarksToSave: Bookmark[]) => {
    if (!id || bookmarksToSave.length === 0) return;
    // TODO: implement server-side bookmark saving
    console.log('Saving bookmarks:', bookmarksToSave);
  }, [id]);

  const handleAddBookmark = useCallback(() => {
    if (!book) return;
    const newBookmark: Bookmark = {
      id: Date.now().toString(),
      cfi: '',
      position: getCurrentScrollTop(),
      createdAt: new Date().toISOString(),
      percentage: Math.round(((currentChapter + 1) / (isPdf ? pdfTotalPages : chapters.length)) * 100),
    };
    const newBookmarks = [...bookmarks, newBookmark];
    setBookmarks(newBookmarks);
    saveBookmarksToServer(newBookmarks);
    setNoteSavedToast(true);
    setTimeout(() => setNoteSavedToast(false), 2000);
  }, [book, currentChapter, chapters.length, bookmarks, isPdf, pdfTotalPages, getCurrentScrollTop, saveBookmarksToServer]);

  // ── Notes ────────────────────────────────────────────────────────────
  const handleSaveNote = useCallback(async (noteText: string) => {
    const quotedText = noteSelectedText || selectedText;
    if (!book || !quotedText) return;
    setShowNoteModal(false);
    try {
      const api = getApiClient();
      const percentage = Math.round(((currentChapter + 1) / chapters.length) * 100);
      const res = await api.createNote({
        bookId: book.id,
        text: quotedText,
        note: noteText,
        cfi: '',
        percentage,
        author: book.author || '',
        bookTitle: book.title,
      });
      if (res.success && res.data) {
        setNotes((prev) => [res.data as Note, ...prev]);
        setNoteSavedToast(true);
        setTimeout(() => setNoteSavedToast(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save note:', err);
    }
    setSelectedText('');
    setNoteSelectedText('');
    window.getSelection()?.removeAllRanges();
  }, [book, noteSelectedText, selectedText, currentChapter, chapters.length]);

  // ── Highlights ───────────────────────────────────────────────────────
  const handleHighlightClick = useCallback(async () => {
    if (!book || !selectedText) return;
    const highlightedText = selectedText.trim();
    setShowSelectionMenu(false);
    try {
      const api = getApiClient();
      const res = await api.createHighlight({
        bookId: book.id,
        cfi: '',
        startOffset: 0,
        endOffset: highlightedText.length,
        text: highlightedText,
        color: 'yellow',
      });
      if (res.success && res.data) {
        setHighlights((prev) => [res.data as Highlight, ...prev]);
        setHighlightSavedToast(true);
        setTimeout(() => setHighlightSavedToast(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save highlight:', err);
    }
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const mark = document.createElement('mark');
      mark.style.backgroundColor = 'rgba(255, 235, 59, 0.6)';
      mark.style.borderRadius = '2px';
      mark.style.padding = '0 2px';
      mark.style.boxDecorationBreak = 'clone';
      (mark.style as any).webkitBoxDecorationBreak = 'clone';
      mark.className = 'highlight-mark';
      try {
        range.surroundContents(mark);
      } catch (e) {
        console.warn('Cannot highlight cross-element selection');
      }
      selection.removeAllRanges();
    }
  }, [book, selectedText]);

  // ── TOC chapters ─────────────────────────────────────────────────────
  const pdfTocChapters = useMemo(() => {
    if (!isPdf || pdfTotalPages === 0) return [];
    if (pdfOutline.length > 0) {
      return pdfOutline.map((item) => ({ title: item.title, index: item.page - 1 }));
    }
    return Array.from({ length: pdfTotalPages }, (_, i) => ({
      title: `第 ${i + 1} 页`,
      index: i,
    }));
  }, [isPdf, pdfTotalPages, pdfOutline]);

  const tocChapters: Array<{ title: string; index: number }> = isPdf ? pdfTocChapters : chapters.map((c, i) => ({ title: c.title, index: i }));
  const totalChapters = isPdf ? pdfTotalPages : chapters.length;

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900">
      {/* PDF Viewer */}
      {isPdf && pdfUrl ? (
        <PdfViewer
          url={pdfUrl}
          currentPage={currentChapter + 1}
          onPdfLoaded={handlePdfLoaded}
        />
      ) : isPdf && !pdfUrl ? (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">加载 PDF 中...</p>
          </div>
        </div>
      ) : (
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
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
            </div>
          )}

          {readerError && (
            <div className="text-center py-20 text-red-500">
              <p>{readerError}</p>
            </div>
          )}

          {!isChapterLoading && !readerError && (
            <div
              className="max-w-3xl mx-auto"
              dangerouslySetInnerHTML={{ __html: chapterContent }}
            />
          )}
        </div>
      )}

      {/* Controls */}
      <ReaderControls
        book={book}
        currentChapter={currentChapter}
        totalChapters={totalChapters}
        chapterTitle={isPdf ? book.title : chapters[currentChapter]?.title || ''}
        mode={mode}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoBack={handleGoBack}
        onGoToPage={handleGoToPage}
        onToggleAutoScroll={() => setIsAutoScroll(!isAutoScroll)}
        isAutoScroll={isAutoScroll}
        onToggleToc={() => setShowToc(!showToc)}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onAddBookmark={handleAddBookmark}
        showToc={showToc}
        showSettings={showSettings}
        onNavigateTts={() => navigate(`/reader/${id}/tts`)}
        scrollContainerRef={contentRef}
        isPdf={isPdf}
      />

      {/* TOC Panel */}
      {showToc && (
        <TocPanel
          chapters={tocChapters}
          currentChapter={currentChapter}
          onSelect={handleGoToPage}
          onClose={() => setShowToc(false)}
          bookTitle={book.title}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          fontSize={fontSize}
          lineHeight={lineHeight}
          fontFamily={fontFamily}
          margin={margin}
          mode={mode}
          onFontSizeChange={setFontSize}
          onLineHeightChange={setLineHeight}
          onFontFamilyChange={setFontFamily}
          onMarginChange={setMargin}
          onModeChange={setMode}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Selection Menu */}
      {showSelectionMenu && (
        <SelectionMenu
          position={selectionMenuPos}
          selectedText={selectedText}
          onNote={() => {
            setNoteSelectedText(selectedText);
            setShowSelectionMenu(false);
            setShowNoteModal(true);
          }}
          onHighlight={handleHighlightClick}
          onDismiss={() => {
            setShowSelectionMenu(false);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        selectedText={noteSelectedText || selectedText}
        onClose={() => {
          setShowNoteModal(false);
          setSelectedText('');
          setNoteSelectedText('');
          window.getSelection()?.removeAllRanges();
        }}
        onSave={handleSaveNote}
      />

      {/* Toasts */}
      {noteSavedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">
          笔记已保存
        </div>
      )}
      {highlightSavedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">
          高亮已保存
        </div>
      )}
    </div>
  );
}
