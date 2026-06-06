// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getApiClient, Book, Collection } from "@bookdock/api-client";
import { useAuthStore } from "../stores/authStore";
import { getCoverImageUrl } from "../utils/network";
import {
  BookOpen,
  Heart,
  FolderOpen,
  Download,
  ChevronRight,
  Plus,
  X,
  StickyNote,
  Trash2,
  Search,
  Clock,
  User,
} from "lucide-react";

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBookGradient(title: string): string {
  const gradients = [
    "from-blue-400 to-purple-500",
    "from-orange-400 to-red-500",
    "from-green-400 to-teal-500",
    "from-pink-400 to-rose-500",
    "from-cyan-400 to-blue-500",
    "from-amber-400 to-orange-500",
    "from-indigo-400 to-violet-500",
    "from-emerald-400 to-green-500",
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

type TabKey = "collections" | "reading" | "favorites" | "downloads" | "notes";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>("collections");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notePage, setNotePage] = useState(1);
  const [noteTotal, setNoteTotal] = useState(0);
  const [authorSearch, setAuthorSearch] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const noteLimit = 20;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getApiClient();
      const [colRes, favRes, booksRes] = await Promise.all([
        api.getCollections(),
        api.getFavorites(),
        api.getBooks(),
      ]);
      if (colRes.success && colRes.data) setCollections(colRes.data);
      if (favRes.success && favRes.data) setFavorites(favRes.data);
      if (booksRes.success && booksRes.data) setBooks(booksRes.data.books || []);
    } catch (err) {
      console.error("Failed to fetch profile data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchNotes = useCallback(async (page = 1) => {
    setNotesLoading(true);
    try {
      const api = getApiClient();
      let res;
      if (authorSearch.trim()) {
        res = await api.getNotesByAuthor(authorSearch.trim());
        if (res.success && res.data) {
          setNotes(res.data);
          setNoteTotal(res.data.length);
        }
      } else {
        res = await api.getNotes({ page, limit: noteLimit });
        if (res.success && res.data) {
          setNotes(res.data.items || []);
          setNoteTotal(res.data.total || 0);
        }
      }
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    } finally {
      setNotesLoading(false);
    }
  }, [authorSearch]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!window.confirm("确定删除这条笔记吗？")) return;
    setDeletingNoteId(noteId);
    try {
      const api = getApiClient();
      const res = await api.deleteNote(noteId);
      if (res.success) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setNoteTotal((prev) => prev - 1);
      } else {
        alert(res.message || "删除失败");
      }
    } catch {
      alert("删除失败");
    } finally {
      setDeletingNoteId(null);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy load notes when tab is activated
  const notesLoadedRef = useRef(false);
  useEffect(() => {
    if (activeTab === "notes" && !notesLoadedRef.current) {
      notesLoadedRef.current = true;
      fetchNotes(1);
    }
  }, [activeTab, fetchNotes]);

  const [books, setBooks] = useState<Book[]>([]);

  const inProgressBooks = useMemo(
    () => books.filter((b: any) => (b.readingProgress ?? 0) > 0 && (b.readingProgress ?? 0) < 100),
    [books]
  );

  const downloadedBooks: Book[] = [];

  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) return;
    try {
      const api = getApiClient();
      await api.createCollection({ name: newCollectionName.trim() });
      setNewCollectionName("");
      setShowCreateModal(false);
      fetchData();
    } catch {
      alert("创建书单失败");
    }
  }, [newCollectionName, fetchData]);



  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "collections", label: "书单", icon: FolderOpen },
    { key: "reading", label: "在读", icon: BookOpen },
    { key: "favorites", label: "收藏", icon: Heart },
    { key: "notes", label: "笔记", icon: StickyNote },
    { key: "downloads", label: "下载", icon: Download },
  ];

  const renderBookCard = (book: Book) => (
    <div
      key={book.id}
      className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      onClick={() => navigate(`/book/${book.id}/detail`)}
    >
      <div className="w-12 h-18 rounded overflow-hidden flex-shrink-0">
        {book.coverUrl ? (
          <img src={getCoverImageUrl(book.coverUrl)} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getBookGradient(book.title)}`}>
            <span className="text-xl text-white font-bold">{book.title.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{book.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{book.author || "未知作者"}</p>
      </div>
    </div>
  );

  const renderNotesContent = () => {
    const totalPages = Math.ceil(noteTotal / noteLimit);

    return (
      <div className="space-y-3">
        {/* Search bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索作者..."
              value={authorSearch}
              onChange={(e) => setAuthorSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setNotePage(1);
                  fetchNotes(1);
                }
              }}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {authorSearch && (
              <button
                onClick={() => { setAuthorSearch(""); setNotePage(1); fetchNotes(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => { setNotePage(1); fetchNotes(1); }}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            搜索
          </button>
        </div>

        {notesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : notes.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
            <StickyNote className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {authorSearch.trim() ? `未找到 ${authorSearch.trim()} 的笔记` : "暂无笔记，在阅读时选中文字即可添加笔记"}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${
                        note.color ? "" : getBookGradient(note.bookTitle || "")
                      }`}
                      style={note.color ? { background: note.color } : undefined}

                    >
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-sm font-medium text-gray-900 dark:text-white truncate cursor-pointer hover:text-blue-500"
      
                          >
                            {note.bookTitle || "未知名称"}
                          </span>
                          {note.author && (
                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <User className="w-3 h-3" />
                              {note.author}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            {formatDate(note.createdAt)}
                          </span>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            disabled={deletingNoteId === note.id}
                            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="删除笔记"
                          >
                            {deletingNoteId === note.id ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {note.text && (
                        <div className="mb-2">
                          <p className="text-sm text-gray-700 dark:text-gray-300 italic border-l-2 border-amber-400 pl-3">
                            {note.text}
                          </p>
                        </div>
                      )}

                      {note.note && (
                        <div className="mb-2">
                          <p className="text-sm text-gray-800 dark:text-gray-200">{note.note}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                        {(note.percentage !== undefined && note.percentage !== null) && (
                          <span>位置 {Math.round(note.percentage)}%</span>
                        )}
                        {note.cfi && (
                          <span className="truncate max-w-[200px]">CFI: {note.cfi}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {!authorSearch.trim() && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => {
                    const p = Math.max(1, notePage - 1);
                    setNotePage(p);
                    fetchNotes(p);
                  }}
                  disabled={notePage <= 1}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {notePage} / {totalPages}
                </span>
                <button
                  onClick={() => {
                    const p = Math.min(totalPages, notePage + 1);
                    setNotePage(p);
                    fetchNotes(p);
                  }}
                  disabled={notePage >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading && activeTab !== "notes") {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      );
    }

    switch (activeTab) {
      case "collections":
        return (
          <div className="space-y-3">
            {collections.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无书单</p>
            ) : (
              collections.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => navigate(`/collections/${col.id}`)}
                >
                  <FolderOpen className="w-8 h-8 text-blue-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{col.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{col.bookCount} 本书</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              ))
            )}
          </div>
        );
      case "reading":
        return (
          <div className="space-y-3">
            {inProgressBooks.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无在读书籍</p>
            ) : (
              inProgressBooks.map(renderBookCard)
            )}
          </div>
        );
      case "favorites":
        return (
          <div className="space-y-3">
            {favorites.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无收藏</p>
            ) : (
              favorites.map(renderBookCard)
            )}
          </div>
        );
      case "downloads":
        return (
          <div className="space-y-3">
            {downloadedBooks.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无下载</p>
            ) : (
              downloadedBooks.map((b) => renderBookCard(b as unknown as Book))
            )}
          </div>
        );
      case "notes":
        return renderNotesContent();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">我的</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建书单
          </button>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
            <span className="text-2xl text-white font-bold">
              {user?.username?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{user?.username || "用户"}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.role === "admin" ? "管理员" : "普通用户"}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-1 flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {renderContent()}

      {/* Create Collection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">新建书单</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="书单名称"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={handleCreateCollection}
                className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
