// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getApiClient, type Note } from "@bookdock/api-client";
import {
  ArrowLeft,
  Trash2,
  BookOpen,
  Search,
  X,
  StickyNote,
  User,
  Clock,
} from "lucide-react";

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

export default function Notes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get("bookId");
  const authorParam = searchParams.get("author");

  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authorSearch, setAuthorSearch] = useState(authorParam || "");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchNotes = useCallback(
    async (currentPage = 1) => {
      setIsLoading(true);
      try {
        const api = getApiClient();
        let res;
        if (bookId) {
          res = await api.getNotesByBook(bookId);
          if (res.success && res.data) {
            setNotes(res.data);
            setTotal(res.data.length);
          }
        } else if (authorSearch.trim()) {
          res = await api.getNotesByAuthor(authorSearch.trim());
          if (res.success && res.data) {
            setNotes(res.data);
            setTotal(res.data.length);
          }
        } else {
          res = await api.getNotes({ page: currentPage, limit });
          if (res.success && res.data) {
            setNotes(res.data.items || []);
            setTotal(res.data.total || 0);
          }
        }
      } catch (err) {
        console.error("Failed to fetch notes:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [bookId, authorSearch]
  );

  useEffect(() => {
    fetchNotes(1);
    setPage(1);
  }, [fetchNotes]);

  const handleDelete = useCallback(
    async (noteId: string) => {
      if (!window.confirm("确定删除这条笔记吗？")) return;
      setDeletingId(noteId);
      try {
        const api = getApiClient();
        const res = await api.deleteNote(noteId);
        if (res.success) {
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
          setTotal((prev) => prev - 1);
        } else {
          alert(res.message || "删除失败");
        }
      } catch {
        alert("删除失败");
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  const handleAuthorSearch = useCallback(() => {
    if (!authorSearch.trim()) {
      navigate("/notes");
      return;
    }
    navigate(`/notes?author=${encodeURIComponent(authorSearch.trim())}`);
  }, [authorSearch, navigate]);

  const clearAuthorSearch = useCallback(() => {
    setAuthorSearch("");
    navigate("/notes");
  }, [navigate]);

  const totalPages = useMemo(() => Math.ceil(total / limit), [total]);

  const headerTitle = useMemo(() => {
    if (bookId) return "书籍笔记";
    if (authorParam) return `${authorParam} 的笔记`;
    return "我的笔记";
  }, [bookId, authorParam]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {headerTitle}
            </h1>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            共 {total} 条
          </span>
        </div>

        {/* Search bar */}
        {!bookId && (
          <div className="flex items-center gap-2 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索作者..."
                value={authorSearch}
                onChange={(e) => setAuthorSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuthorSearch()}
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {authorSearch && (
                <button
                  onClick={clearAuthorSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={handleAuthorSearch}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              搜索
            </button>
          </div>
        )}

        {/* Notes list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : notes.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center">
            <StickyNote className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {bookId
                ? "暂无笔记，在阅读时选中文字即可添加笔记"
                : authorParam
                ? `未找到 ${authorParam} 的笔记`
                : "暂无笔记，在阅读时选中文字即可添加笔记"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Book cover / color indicator */}
                  <div
                    className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-gradient-to-br ${
                      note.color ? "" : getBookGradient(note.bookTitle || "")
                    }`}
                    style={
                      note.color
                        ? { background: note.color }
                        : undefined
                    }

                  >
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Title & author */}
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
                          onClick={() => handleDelete(note.id)}
                          disabled={deletingId === note.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          title="删除笔记"
                        >
                          {deletingId === note.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-transparent" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Selected text */}
                    {note.text && (
                      <div className="mb-2">
                        <p className="text-sm text-gray-700 dark:text-gray-300 italic border-l-2 border-amber-400 pl-3">
                          {note.text}
                        </p>
                      </div>
                    )}

                    {/* Note content */}
                    {note.note && (
                      <div className="mb-2">
                        <p className="text-sm text-gray-800 dark:text-gray-200">
                          {note.note}
                        </p>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            ))}

            {/* Pagination for "all notes" */}
            {!bookId && !authorParam && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => {
                    const p = Math.max(1, page - 1);
                    setPage(p);
                    fetchNotes(p);
                  }}
                  disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => {
                    const p = Math.min(totalPages, page + 1);
                    setPage(p);
                    fetchNotes(p);
                  }}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
