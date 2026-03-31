import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiClient, Book, Bookmark, Highlight } from '@bookdock/api-client';
import { useAuth } from '@bookdock/auth';
import { useBookReader } from '../hooks/useBookReader';
import { useReaderStore } from '../stores/themeStore';
import { Button } from '@bookdock/ui';
import type { ReaderMode, ReaderPosition } from '@bookdock/ebook-reader';

// ==================== Reading Progress ====================
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
    all[progress.bookId] = progress;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch { /* Ignore */ }
}

function getProgressLocal(bookId: string): StoredProgress | null {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, StoredProgress>;
    return all[bookId] || null;
  } catch { return null; }
}

const FORMAT_TIPS: Record<string, { icon: string; tip: string; supported: boolean }> = {
  epub: { icon: '📖', tip: 'EPUB 格式完整支持', supported: true },
  pdf: { icon: '📄', tip: 'PDF 格式支持', supported: true },
  mobi: { icon: '📱', tip: 'MOBI 格式通过 Kindle 解析库支持', supported: true },
  txt: { icon: '📝', tip: '纯文本格式支持', supported: true },
};

// ==================== Bookmark Types ====================
interface LocalBookmark {
  id: string;
  cfi: string;
  chapterId?: string;
  percentage: number;
  note?: string;
  color?: string;
  createdAt: string;
}

interface LocalHighlight {
  id: string;
  cfi: string;
  chapterId?: string;
  startOffset: number;
  endOffset: number;
  text: string;
  color?: string;
  note?: string;
  createdAt: string;
}

const BOOKMARK_COLORS = [
  { label: '黄色', value: '#fef08a' },
  { label: '绿色', value: '#bbf7d0' },
  { label: '蓝色', value: '#bfdbfe' },
  { label: '粉色', value: '#fbcfe8' },
  { label: '橙色', value: '#fed7aa' },
];

// ==================== Bookmark Panel ====================
interface BookmarkPanelProps {
  bookmarks: LocalBookmark[];
  highlights: LocalHighlight[];
  onAddBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onGoToBookmark: (bookmark: LocalBookmark) => void;
  onDeleteHighlight: (id: string) => void;
  onGoToHighlight: (highlight: LocalHighlight) => void;
  onClose: () => void;
}

function BookmarkPanel({
  bookmarks,
  highlights,
  onAddBookmark,
  onDeleteBookmark,
  onGoToBookmark,
  onDeleteHighlight,
  onGoToHighlight,
  onClose,
}: BookmarkPanelProps) {
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'highlights'>('bookmarks');

  return (
    <div className="absolute top-14 right-4 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 max-h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => setActiveTab('bookmarks')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'bookmarks' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          🔖 书签 ({bookmarks.length})
        </button>
        <button
          onClick={() => setActiveTab('highlights')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'highlights' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          ✏️ 高亮 ({highlights.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'bookmarks' ? (
          <div className="space-y-3">
            <Button onClick={onAddBookmark} className="w-full" size="sm">➕ 添加书签</Button>
            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">🔖</div>
                <p className="text-sm">暂无书签</p>
                <p className="text-xs mt-1">点击上方按钮添加书签</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bookmarks.map((bookmark) => (
                  <div key={bookmark.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                    <div className="flex justify-between items-start">
                      <button onClick={() => onGoToBookmark(bookmark)} className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">书签 - {bookmark.percentage}%</p>
                        {bookmark.note && <p className="text-xs text-gray-500 mt-1">{bookmark.note}</p>}
                        <span className="text-xs text-gray-400">{new Date(bookmark.createdAt).toLocaleDateString('zh-CN')}</span>
                      </button>
                      <button onClick={() => onDeleteBookmark(bookmark.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-2 transition-opacity">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {highlights.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="text-4xl mb-2">✏️</div>
                <p className="text-sm">暂无高亮</p>
                <p className="text-xs mt-1">选中文字可添加高亮</p>
              </div>
            ) : (
              <div className="space-y-2">
                {highlights.map((highlight) => (
                  <div key={highlight.id} className="p-3 rounded-lg group" style={{ backgroundColor: highlight.color ? `${highlight.color}40` : '#fef9c3' }}>
                    <div className="flex justify-between items-start">
                      <button onClick={() => onGoToHighlight(highlight)} className="flex-1 text-left">
                        <p className="text-sm text-gray-900 dark:text-white line-clamp-3">"{highlight.text}"</p>
                        {highlight.note && <p className="text-xs text-gray-500 mt-1">📝 {highlight.note}</p>}
                        <span className="text-xs text-gray-400">{new Date(highlight.createdAt).toLocaleDateString('zh-CN')}</span>
                      </button>
                      <button onClick={() => onDeleteHighlight(highlight.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-2 transition-opacity">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <button onClick={onClose} className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
    </div>
  );
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
  bookmarks: LocalBookmark[];
  highlights: LocalHighlight[];
  onAddBookmark: () => void;
  onGoToBookmark: (bookmark: LocalBookmark) => void;
}

function ReaderSettings({ mode, fontSize, lineHeight, fontFamily, margin, onModeChange, onFontSizeChange, onLineHeightChange, onFontFamilyChange, onMarginChange, onClose, bookmarks, highlights, onAddBookmark, onGoToBookmark }: ReaderSettingsProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'bookmarks' | 'highlights'>('display');

  return (
    <div className="absolute top-14 right-4 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => setActiveTab('display')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'display' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>📖 显示</button>
        <button onClick={() => setActiveTab('bookmarks')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'bookmarks' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>🔖 书签 ({bookmarks.length})</button>
        <button onClick={() => setActiveTab('highlights')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'highlights' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>✏️ 高亮 ({highlights.length})</button>
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === 'display' ? (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">阅读主题</label>
              <div className="flex gap-2">
                {(['light', 'dark', 'sepia'] as ReaderMode[]).map((m) => (
                  <button key={m} onClick={() => onModeChange(m)} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    {m === 'light' ? '☀️' : m === 'dark' ? '🌙' : '📜'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between"><span>字体大小</span><span className="text-blue-500">{fontSize}px</span></label>
              <input type="range" min="12" max="32" value={fontSize} onChange={(e) => onFontSizeChange(parseInt(e.target.value))} className="w-full accent-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between"><span>行间距</span><span className="text-blue-500">{lineHeight.toFixed(1)}</span></label>
              <input type="range" min="1.2" max="2.5" step="0.1" value={lineHeight} onChange={(e) => onLineHeightChange(parseFloat(e.target.value))} className="w-full accent-blue-500" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">字体</label>
              <select value={fontFamily} onChange={(e) => onFontFamilyChange(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="Georgia, serif">衬线字体 (Georgia)</option>
                <option value="Merriweather, serif">阅读字体 (Merriweather)</option>
                <option value="system-ui, sans-serif">系统字体</option>
                <option value="'Noto Serif SC', serif">思源宋体</option>
                <option value="'Noto Sans SC', sans-serif">思源黑体</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex justify-between"><span>页面边距</span><span className="text-blue-500">{margin}px</span></label>
              <input type="range" min="20" max="120" value={margin} onChange={(e) => onMarginChange(parseInt(e.target.value))} className="w-full accent-blue-500" />
            </div>
          </div>
        ) : activeTab === 'bookmarks' ? (
          <div className="space-y-3">
            <Button onClick={onAddBookmark} className="w-full" size="sm">➕ 添加书签</Button>
            {bookmarks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2">🔖</div><p className="text-sm">暂无书签</p></div>
            ) : (
              <div className="space-y-2">{bookmarks.map((bookmark) => (
                <button key={bookmark.id} onClick={() => onGoToBookmark(bookmark)} className="w-full p-3 text-left bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">书签 - {bookmark.percentage}%</p>
                      {bookmark.note && <p className="text-xs text-gray-500 mt-1">{bookmark.note}</p>}
                    </div>
                    <span className="text-xs text-gray-400">{new Date(bookmark.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </button>
              ))}</div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {highlights.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400"><div className="text-4xl mb-2">✏️</div><p className="text-sm">暂无高亮</p><p className="text-xs mt-1">选中文字可添加高亮</p></div>
            ) : (
              <div className="space-y-2">{highlights.map((highlight) => (
                <div key={highlight.id} className="p-3 rounded-lg" style={{ backgroundColor: highlight.color ? `${highlight.color}40` : '#fef9c3' }}>
                  <p className="text-sm text-gray-900 dark:text-white line-clamp-3">"{highlight.text}"</p>
                  {highlight.note && <p className="text-xs text-gray-500 mt-1">📝 {highlight.note}</p>}
                </div>
              ))}</div>
            )}
          </div>
        )}
      </div>
      <button onClick={onClose} className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
    </div>
  );
}

// ==================== Highlight Popup ====================
interface HighlightPopupProps {
  selectedText: string;
  position: { x: number; y: number };
  onAddHighlight: (color: string, note?: string) => void;
  onCancel: () => void;
}

function HighlightPopup({ selectedText, position, onAddHighlight, onCancel }: HighlightPopupProps) {
  const [selectedColor, setSelectedColor] = useState('#fef08a');
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');

  return (
    <div className="fixed z-[60] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 w-64" style={{ left: Math.min(position.x, window.innerWidth - 280), top: position.y + 10 }}>
      <p className="text-xs text-gray-500 mb-2 line-clamp-2">选中文字："{selectedText.slice(0, 50)}..."</p>
      {!showNote ? (
        <>
          <div className="flex gap-1 mb-2">
            {BOOKMARK_COLORS.map((c) => (
              <button key={c.value} onClick={() => setSelectedColor(c.value)} className={`w-6 h-6 rounded-full border-2 ${selectedColor === c.value ? 'border-gray-900' : 'border-transparent'}`} style={{ backgroundColor: c.value }} title={c.label} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowNote(true)} className="flex-1 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">📝 添加笔记</button>
            <button onClick={() => onAddHighlight(selectedColor)} className="flex-1 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">高亮</button>
          </div>
        </>
      ) : (
        <>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="添加笔记..." className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-2 resize-none h-20" autoFocus />
          <div className="flex gap-1 mb-2">
            {BOOKMARK_COLORS.map((c) => (
              <button key={c.value} onClick={() => setSelectedColor(c.value)} className={`w-6 h-6 rounded-full border-2 ${selectedColor === c.value ? 'border-gray-900' : 'border-transparent'}`} style={{ backgroundColor: c.value }} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">取消</button>
            <button onClick={() => onAddHighlight(selectedColor, note)} className="flex-1 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">保存</button>
          </div>
        </>
      )}
    </div>
  );
}

// ==================== Main Reader Component ====================
export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isPremium, user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(false);
  const [bookmarks, setBookmarks] = useState<LocalBookmark[]>([]);
  const [highlights, setHighlights] = useState<LocalHighlight[]>([]);
  const [showFormatTip, setShowFormatTip] = useState(false);
  const [highlightPopup, setHighlightPopup] = useState({ show: false, text: '', position: { x: 0, y: 0 } });

  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { mode, fontSize, lineHeight, fontFamily, margin, setMode, setFontSize, setLineHeight, setFontFamily, setMargin } = useReaderStore();

  // Load bookmarks and highlights
  const loadBookmarksAndHighlights = useCallback(async () => {
    if (!id || !user) return;
    try {
      const storedBookmarks = localStorage.getItem(`bookdock_bookmarks_${id}`);
      if (storedBookmarks) setBookmarks(JSON.parse(storedBookmarks));
      const storedHighlights = localStorage.getItem(`bookdock_highlights_${id}`);
      if (storedHighlights) setHighlights(JSON.parse(storedHighlights));
    } catch { /* Ignore */ }

    try {
      const apiClient = getApiClient();
      const [bmRes, hlRes] = await Promise.all([
        apiClient.getBookmarks(id).catch(() => ({ success: false, data: [] as any[] })),
        apiClient.getHighlights(id).catch(() => ({ success: false, data: [] as any[] })),
      ]);
      if (bmRes.success && bmRes.data && bmRes.data.length > 0) {
        const apiBookmarks: LocalBookmark[] = bmRes.data.map((b) => ({ id: b.id, cfi: b.cfi || '', chapterId: b.chapterId, percentage: b.percentage || 0, note: b.note, color: b.color, createdAt: b.createdAt }));
        setBookmarks(apiBookmarks);
        localStorage.setItem(`bookdock_bookmarks_${id}`, JSON.stringify(apiBookmarks));
      }
      if (hlRes.success && hlRes.data && hlRes.data.length > 0) {
        const apiHighlights: LocalHighlight[] = hlRes.data.map((h) => ({ id: h.id, cfi: h.cfi || '', chapterId: h.chapterId, startOffset: h.startOffset, endOffset: h.endOffset, text: h.text, color: h.color, note: h.note, createdAt: h.createdAt }));
        setHighlights(apiHighlights);
        localStorage.setItem(`bookdock_highlights_${id}`, JSON.stringify(apiHighlights));
      }
    } catch { /* Ignore API errors */ }
  }, [id, user]);

  useEffect(() => { loadBookmarksAndHighlights(); }, [loadBookmarksAndHighlights]);

  const saveBookmarks = useCallback((newBookmarks: LocalBookmark[]) => {
    if (!id) return;
    setBookmarks(newBookmarks);
    localStorage.setItem(`bookdock_bookmarks_${id}`, JSON.stringify(newBookmarks));
  }, [id]);

  const saveHighlights = useCallback((newHighlights: LocalHighlight[]) => {
    if (!id) return;
    setHighlights(newHighlights);
    localStorage.setItem(`bookdock_highlights_${id}`, JSON.stringify(newHighlights));
  }, [id]);

  // Auto scroll
  useEffect(() => {
    if (isAutoScroll && containerRef.current) {
      autoScrollTimerRef.current = setInterval(() => {
        if (containerRef.current) containerRef.current.scrollTop += 2;
      }, 50);
    } else if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
    }
    return () => { if (autoScrollTimerRef.current) clearInterval(autoScrollTimerRef.current); };
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
          const tipKey = `bookdock_format_tip_shown_${response.data.fileType}`;
          if (!localStorage.getItem(tipKey)) {
            setShowFormatTip(true);
            localStorage.setItem(tipKey, 'true');
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
    if (id && book) {
      saveProgressLocal({ bookId: id, percentage: pos.percentage, currentPage: pos.currentPage, cfi: pos.cfi, timestamp: Date.now(), totalPages: pos.totalPages });
    }
  }, [id, book]);

  const { containerRef: readerContainerRef, position, isLoading: isReaderLoading, error: readerError, nextPage, prevPage, goToPosition } = useBookReader({ book, autoSaveInterval: 5000, onPositionChange: handlePositionChange });

  // Bookmark handlers
  const handleAddBookmark = useCallback(async () => {
    if (!book || !id) return;
    const newBookmark: LocalBookmark = { id: `bm_${Date.now()}`, cfi: '', percentage: position.percentage, createdAt: new Date().toISOString() };
    const newBookmarks = [...bookmarks, newBookmark];
    saveBookmarks(newBookmarks);
    // Sync to API
    try {
      const apiClient = getApiClient();
      const res = await apiClient.createBookmark({ bookId: id, percentage: position.percentage, cfi: '' });
      if (res.success && res.data) {
        const updated = newBookmarks.map((b) => b.id === newBookmark.id ? { ...b, id: res.data!.id } : b);
        saveBookmarks(updated);
      }
    } catch { /* Ignore */ }
  }, [book, id, position, bookmarks, saveBookmarks]);

  const handleDeleteBookmark = useCallback(async (bookmarkId: string) => {
    const newBookmarks = bookmarks.filter((b) => b.id !== bookmarkId);
    saveBookmarks(newBookmarks);
    // Delete from API
    if (!bookmarkId.startsWith('bm_')) {
      try {
        const apiClient = getApiClient();
        await apiClient.deleteBookmark(bookmarkId);
      } catch { /* Ignore */ }
    }
  }, [bookmarks, saveBookmarks]);

  const handleGoToBookmark = useCallback((bookmark: LocalBookmark) => {
    goToPosition({ percentage: bookmark.percentage });
    setShowBookmarkPanel(false);
    setShowSettings(false);
  }, [goToPosition]);

  const handleAddHighlight = useCallback(async (color: string, note?: string) => {
    if (!id || !highlightPopup.text) return;
    const newHighlight: LocalHighlight = { id: `hl_${Date.now()}`, cfi: '', startOffset: 0, endOffset: 0, text: highlightPopup.text, color, note, createdAt: new Date().toISOString() };
    const newHighlights = [...highlights, newHighlight];
    saveHighlights(newHighlights);
    setHighlightPopup({ show: false, text: '', position: { x: 0, y: 0 } });
    // Sync to API
    try {
      const apiClient = getApiClient();
      const res = await apiClient.createHighlight({ bookId: id, cfi: '', startOffset: 0, endOffset: 0, text: highlightPopup.text, color, note });
      if (res.success && res.data) {
        const updated = newHighlights.map((h) => h.id === newHighlight.id ? { ...h, id: res.data!.id } : h);
        saveHighlights(updated);
      }
    } catch { /* Ignore */ }
  }, [id, highlightPopup.text, highlights, saveHighlights]);

  const handleDeleteHighlight = useCallback(async (highlightId: string) => {
    const newHighlights = highlights.filter((h) => h.id !== highlightId);
    saveHighlights(newHighlights);
    if (!highlightId.startsWith('hl_')) {
      try {
        const apiClient = getApiClient();
        await apiClient.deleteHighlight(highlightId);
      } catch { /* Ignore */ }
    }
  }, [highlights, saveHighlights]);

  const handleGoToHighlight = useCallback((highlight: LocalHighlight) => {
    setShowBookmarkPanel(false);
  }, []);

  // Restore position
  useEffect(() => {
    if (id && position.percentage === 0) {
      const saved = getProgressLocal(id);
      if (saved && saved.percentage > 0) {
        goToPosition({ percentage: saved.percentage, currentPage: saved.currentPage, cfi: saved.cfi });
      }
    }
  }, [id, position.percentage, goToPosition]);

  const handleGoBack = useCallback(() => {
    if (book && position.percentage > 0) {
      const apiClient = getApiClient();
      apiClient.updateReadingProgress(book.id, position.percentage, position.currentPage).catch(() => {/* Ignore */});
    }
    navigate(-1);
  }, [navigate, book, position]);

  const handleModeChange = useCallback((newMode: ReaderMode) => { setMode(newMode); }, [setMode]);
  const handleFontSizeChange = useCallback((newSize: number) => { setFontSize(newSize); }, [setFontSize]);
  const handleLineHeightChange = useCallback((newHeight: number) => { setLineHeight(newHeight); }, [setLineHeight]);
  const handleFontFamilyChange = useCallback((newFamily: string) => { setFontFamily(newFamily); }, [setFontFamily]);
  const handleMarginChange = useCallback((newMargin: number) => { setMargin(newMargin); }, [setMargin]);

  const handleGoToPage = useCallback((page: number) => {
    if (position.totalPages) {
      const percentage = (page / position.totalPages) * 100;
      goToPosition({ percentage, currentPage: page });
    }
  }, [position.totalPages, goToPosition]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft': case 'PageUp': e.preventDefault(); prevPage(); break;
        case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); nextPage(); break;
        case 'Home': e.preventDefault(); goToPosition({ percentage: 0, currentPage: 1 }); break;
        case 'End': e.preventDefault(); goToPosition({ percentage: 100, currentPage: position.totalPages }); break;
        case 'Escape': setShowSettings(false); setShowBookmarkPanel(false); setShowFormatTip(false); setHighlightPopup({ show: false, text: '', position: { x: 0, y: 0 } }); break;
        case 'b': if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleAddBookmark(); } break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, goToPosition, position.totalPages, handleAddBookmark]);

  const handleToggleAutoScroll = () => { setIsAutoScroll(!isAutoScroll); };

  const bookmarkPanel = (
    <BookmarkPanel
      bookmarks={bookmarks}
      highlights={highlights}
      onAddBookmark={handleAddBookmark}
      onDeleteBookmark={handleDeleteBookmark}
      onGoToBookmark={handleGoToBookmark}
      onDeleteHighlight={handleDeleteHighlight}
      onGoToHighlight={handleGoToHighlight}
      onClose={() => setShowBookmarkPanel(false)}
    />
  );

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
      highlights={highlights}
      onAddBookmark={handleAddBookmark}
      onGoToBookmark={handleGoToBookmark}
    />
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div><p className="mt-4 text-gray-600 dark:text-gray-400">加载书籍中...</p></div>
      </div>
    );
  }

  if (error || readerError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">📕</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{error || readerError}</h2>
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
        <div className="text-center"><div className="text-6xl mb-4">📭</div><h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">书籍不存在</h2><Button onClick={() => navigate('/')}>返回书库</Button></div>
      </div>
    );
  }

  const formatInfo = FORMAT_TIPS[book.fileType];

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-gray-900 text-gray-100' : mode === 'sepia' ? 'bg-amber-50 text-amber-900' : 'bg-white text-gray-900'}`}>
      <ReaderControls
        book={book}
        position={position}
        mode={mode}
        fontSize={fontSize}
        bookmarks={bookmarks}
        highlights={highlights}
        onModeChange={handleModeChange}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoBack={handleGoBack}
        onGoToPage={handleGoToPage}
        onToggleAutoScroll={handleToggleAutoScroll}
        isAutoScroll={isAutoScroll}
        onAddBookmark={handleAddBookmark}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onToggleBookmarkPanel={() => setShowBookmarkPanel(!showBookmarkPanel)}
        showBookmarkPanel={showBookmarkPanel}
        bookmarkPanel={bookmarkPanel}
        settingsPanel={settingsPanel}
      />

      {/* Format compatibility tip toast */}
      {showFormatTip && formatInfo && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
          <div className={`px-4 py-3 rounded-xl shadow-lg border max-w-sm text-sm ${
            formatInfo.supported ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200' : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200'
          }`}>
            <div className="flex items-start gap-2">
              <span className="text-lg">{formatInfo.icon}</span>
              <div>
                <p className="font-medium capitalize">{book.fileType} 格式</p>
                <p className="text-xs opacity-80 mt-0.5">{formatInfo.tip}</p>
              </div>
              <button onClick={() => setShowFormatTip(false)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Format indicator */}
      <div className="fixed top-14 left-4 z-30">
        <span className="px-2 py-1 bg-black/40 rounded text-xs text-white uppercase">{book.fileType}</span>
      </div>

      {/* Reader container */}
      <div
        ref={(el) => {
          (readerContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={`reading-container ${mode} pt-14 pb-20 overflow-auto`}
        style={{ padding: `${margin}px`, maxWidth: '800px', margin: '0 auto', minHeight: '100vh', fontFamily, fontSize: `${fontSize}px`, lineHeight }}
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

      {/* Highlight popup */}
      {highlightPopup.show && (
        <HighlightPopup
          selectedText={highlightPopup.text}
          position={highlightPopup.position}
          onAddHighlight={handleAddHighlight}
          onCancel={() => setHighlightPopup({ show: false, text: '', position: { x: 0, y: 0 } })}
        />
      )}
    </div>
  );
}
