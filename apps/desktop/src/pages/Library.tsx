// @ts-nocheck
import { Book, EbookSource, getApiClient } from "@bookdock/api-client";
import { Button, Card, CardContent } from "@bookdock/ui";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Clock,
  Cloud,
  FolderOpen,
  LayoutGrid,
  List,
  PenLine,
  Search,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import {
  useLibraryStore,
} from "../stores/libraryStore";
import { getCoverImageUrl } from "../utils/network";

// Extended book type with source info for NAS books
interface BookWithSource extends Book {
  _sourceId?: string;
  _sourceType?: "local" | "webdav" | "smb" | "ftp";
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Reading progress categories
type ProgressFilter = "all" | "unread" | "reading" | "completed";
type SortOption = "title" | "author" | "lastRead" | "addedAt";

// Generate a stable gradient for a book based on its title
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

const BookCard: React.FC<{ book: Book; onSelect: () => void }> = ({
  book,
  onSelect,
}) => {
  const nasBook = book as BookWithSource;
  const isNas = !!nasBook._sourceId;
  const progress = book.readingProgress ?? 0;
  const statusText = progress === 0 ? "未读" : progress >= 100 ? "已读完" : "在读";
  const statusColor = progress === 0
    ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
    : progress >= 100
      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
      : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";

  return (
    <div
      className="group cursor-pointer"
      onClick={onSelect}
    >
      {/* Cover */}
      <div className="aspect-[2/3] rounded-xl overflow-hidden relative shadow-sm group-hover:shadow-md transition-shadow">
        {book.coverUrl ? (
          <img
            src={getCoverImageUrl(book.coverUrl)}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getBookGradient(book.title)}`}>
            <span className="text-5xl text-white font-bold">
              {book.title.charAt(0)}
            </span>
          </div>
        )}

        {/* NAS source badge */}
        {isNas && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-orange-500/80 rounded text-[10px] text-white uppercase flex items-center gap-1">
            <Cloud className="w-3 h-3" /> NAS
          </div>
        )}

        {/* Progress indicator */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Format badge */}
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-orange-400/90 rounded-md text-[10px] text-white font-medium uppercase">
          {book.fileType || book.format}
        </div>
      </div>

      {/* Info */}
      <div className="mt-3">
        <h3
          className="font-medium text-sm text-gray-900 dark:text-white truncate"
          title={book.title}
        >
          {book.title}
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
          {book.author || "未知作者"}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
            {statusText}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {formatFileSize(book.fileSize)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default function Library() {
  const navigate = useNavigate();
  const { books, isLoading, error, searchQuery, fetchBooks, setSearchQuery } =
    useLibraryStore();
  const { user } = useAuthStore();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Source filter state
  const [sources, setSources] = useState<EbookSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("all");
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [nasBooks, setNasBooks] = useState<BookWithSource[]>([]);

  // Advanced filters
  const [filterFormat, setFilterFormat] = useState<string | "all">(
    "all",
  );
  const [filterProgress, setFilterProgress] = useState<ProgressFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("addedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [authorSearch, setAuthorSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const apiClient = getApiClient();
      const res = await apiClient.uploadBookFile(file);
      if (res.success) {
        await fetchBooks();
      } else {
        alert("上传失败: " + (res.error || "未知错误"));
      }
    } catch (err: any) {
      alert("上传失败: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Fetch sources on mount
  useEffect(() => {
    const loadSources = async () => {
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getSources();
        if (response.success && response.data) {
          const enabledSources = response.data.filter((s) => s.enabled);
          setSources(enabledSources);
        }
      } catch {
        /* ignore - sources are optional */
      }
    };
    loadSources();
  }, []);

  // Load NAS books when source changes
  useEffect(() => {
    const loadNasBooks = async () => {
      if (selectedSourceId === "all") {
        setNasBooks([]);
        return;
      }

      setSourcesLoading(true);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getSourceFiles(selectedSourceId, "/");
        if (response.success && response.data) {
          const booksFromSource = sources.find(
            (s) => s.id === selectedSourceId,
          );
          const sourceType = booksFromSource?.type || "webdav";

          // Filter to ebook files only
          const supportedExts = [
            "epub",
            "pdf",
            "mobi",
            "txt",
            "azw3",
            "fb2",
            "djvu",
          ];
          const nasBooksWithSource: BookWithSource[] = response.data
            .filter(
              (f: { isDirectory: boolean; name: string }) =>
                !f.isDirectory &&
                supportedExts.some((ext) =>
                  f.name.toLowerCase().endsWith(`.${ext}`),
                ),
            )
            .map(
              (f: {
                path: string;
                name: string;
                size: number;
                lastModified: string;
              }) => {
                const ext = f.name.split(".").pop()?.toLowerCase() || "other";
                return {
                  id: `nas_${selectedSourceId}_${f.path}`,
                  title: f.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
                  author: "未知作者",
                  fileType: ext,
                  filePath: f.path,
                  fileSize: f.size,
                  addedAt: f.lastModified,
                  _sourceId: selectedSourceId,
                  _sourceType: sourceType as BookWithSource["_sourceType"],
                  // Mark as from NAS
                  coverUrl: undefined,
                } as BookWithSource;
              },
            );

          setNasBooks(nasBooksWithSource);
        }
      } catch {
        /* ignore */
      } finally {
        setSourcesLoading(false);
      }
    };

    if (selectedSourceId !== "all") {
      loadNasBooks();
    } else {
      setNasBooks([]);
    }
  }, [selectedSourceId, sources]);

  // Merge local books with NAS books when viewing "all"
  const allBooks = useMemo(() => {
    if (selectedSourceId === "all") {
      return [...books, ...nasBooks] as Book[];
    }
    return nasBooks as Book[];
  }, [books, nasBooks, selectedSourceId]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // Filter, search and sort books
  const filteredBooks = useMemo(() => {
    let result = [...allBooks];

    // Author search
    if (authorSearch.trim()) {
      const q = authorSearch.toLowerCase();
      result = result.filter(
        (book) =>
          book.author?.toLowerCase().includes(q) ||
          book.title.toLowerCase().includes(q),
      );
    }

    // Title search (from store)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (book) =>
          book.title.toLowerCase().includes(q) ||
          book.author?.toLowerCase().includes(q),
      );
    }

    // Format filter
    if (filterFormat !== "all") {
      result = result.filter((book) => book.fileType === filterFormat);
    }

    // Progress filter
    if (filterProgress !== "all") {
      result = result.filter((book) => {
        const progress = book.readingProgress ?? 0;
        if (filterProgress === "unread") return progress === 0;
        if (filterProgress === "reading") return progress > 0 && progress < 100;
        if (filterProgress === "completed")
          return progress >= 100 || progress === 100;
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "title":
          cmp = a.title.localeCompare(b.title, "zh-CN");
          break;
        case "author":
          cmp = (a.author || "zzz").localeCompare(b.author || "zzz", "zh-CN");
          break;
        case "lastRead":
          cmp =
            new Date(a.lastReadAt || 0).getTime() -
            new Date(b.lastReadAt || 0).getTime();
          break;
        case "addedAt":
        default:
          cmp =
            new Date(a.addedAt || 0).getTime() -
            new Date(b.addedAt || 0).getTime();
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return result;
  }, [
    allBooks,
    searchQuery,
    authorSearch,
    filterFormat,
    filterProgress,
    sortBy,
    sortOrder,
  ]);

  // recentlyRead and inProgress moved to Recommend page

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Search is reactive via searchQuery state
  };

  const handleBookSelect = (book: Book) => {
    navigate(`/book/${book.id}`);
  };

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-red-500 text-lg mb-4">{error}</div>
        <Button onClick={() => fetchBooks()}>重试</Button>
      </div>
    );
  }

  const isAnyLoading =
    isLoading || (selectedSourceId !== "all" && sourcesLoading);

  // Stats
  const stats = useMemo(() => {
    const total = allBooks.length;
    const unread = allBooks.filter(
      (b) => !b.readingProgress || b.readingProgress === 0,
    ).length;
    const reading = allBooks.filter(
      (b) =>
        b.readingProgress && b.readingProgress > 0 && b.readingProgress < 100,
    ).length;
    const completed = allBooks.filter(
      (b) => b.readingProgress && b.readingProgress >= 100,
    ).length;
    return { total, unread, reading, completed };
  }, [allBooks]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            我的书库
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-3">
            <span>共 {stats.total} 本</span>
            <span className="text-green-600 dark:text-green-400">
              {stats.completed} 已读完
            </span>
            <span className="text-blue-600 dark:text-blue-400">
              {stats.reading} 在读
            </span>
            <span className="text-gray-400">{stats.unread} 未读</span>
            {(user as { membership?: string } | null)?.membership ===
              "premium" && (
              <span className="ml-2 text-amber-500">Premium 会员</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Source selector */}
          {sources.length > 0 && (
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="all">全部书源</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} ({source.bookCount || 0}本)
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.epub,.pdf,.mobi,.azw3"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Clock className="w-4 h-4 mr-1 animate-spin" /> 上传中...
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4 mr-1" /> 添加书籍
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Search and Filters Row */}
      <div className="flex items-center gap-3">
        {/* Search title */}
        <div className="relative flex-[2]">
          <input
            type="text"
            placeholder="搜索书名..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        {/* Search author */}
        <div className="relative flex-[2]">
          <input
            type="text"
            placeholder="搜索作者..."
            value={authorSearch}
            onChange={(e) => setAuthorSearch(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <PenLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        {/* Format filter */}
        <select
          value={filterFormat}
          onChange={(e) =>
            setFilterFormat(e.target.value as Book["fileType"] | "all")
          }
          className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm flex-shrink-0"
        >
          <option value="all">全部格式</option>
          <option value="epub">EPUB</option>
          <option value="pdf">PDF</option>
          <option value="mobi">MOBI</option>
          <option value="txt">TXT</option>
        </select>

        {/* Progress filter */}
        <select
          value={filterProgress}
          onChange={(e) =>
            setFilterProgress(e.target.value as ProgressFilter)
          }
          className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm flex-shrink-0"
        >
          <option value="all">全部状态</option>
          <option value="unread">未读</option>
          <option value="reading">在读</option>
          <option value="completed">已读完</option>
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm flex-shrink-0"
        >
          <option value="addedAt">添加时间</option>
          <option value="title">书名</option>
          <option value="author">作者</option>
          <option value="lastRead">最近阅读</option>
        </select>

        {/* Sort order */}
        <button
          onClick={toggleSortOrder}
          className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          title={sortOrder === "desc" ? "降序" : "升序"}
        >
          {sortOrder === "desc" ? (
            <ArrowDown className="w-4 h-4" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>

        {/* View mode toggle */}
        <div className="flex border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden flex-shrink-0">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-2.5 ${viewMode === "grid" ? "bg-blue-500 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-2.5 ${viewMode === "list" ? "bg-blue-500 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* All Books */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          <BookOpen className="w-5 h-5 inline mr-1" /> 全部书籍
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({filteredBooks.length} 本)
          </span>
        </h2>

        {isAnyLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-xl" />
                <div className="mt-2 h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="mt-1 h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex justify-center">
              <BookOpen className="w-16 h-16 text-gray-400" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">
              暂无书籍
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              {allBooks.length === 0
                ? "点击上方按钮添加您的第一本书，或在管理面板配置 NAS 书源"
                : "没有找到符合条件的书籍"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onSelect={() => handleBookSelect(book)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredBooks.map((book) => {
              const progress = book.readingProgress ?? 0;
              const statusText = progress === 0 ? "未读" : progress >= 100 ? "已读完" : "在读";
              const statusColor = progress === 0
                ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                : progress >= 100
                  ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                  : "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400";

              return (
                <div
                  key={book.id}
                  className="flex items-center gap-4 py-4 cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors -mx-4 px-4 rounded-lg"
                  onClick={() => handleBookSelect(book)}
                >
                  {/* Cover */}
                  <div className="w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                    {book.coverUrl ? (
                      <img
                        src={getCoverImageUrl(book.coverUrl)}
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getBookGradient(book.title)}`}>
                        <span className="text-sm text-white font-bold">
                          {book.title.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title + Author */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {book.title}
                    </h3>
                    <p className="text-sm text-gray-400 dark:text-gray-500 truncate">
                      {book.author || "未知作者"}
                    </p>
                  </div>

                  {/* Format */}
                  <span className="text-sm text-orange-500 dark:text-orange-400 flex-shrink-0">
                    {(book.fileType || book.format || '').toUpperCase()}
                  </span>

                  {/* Status badge */}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusColor}`}>
                    {statusText}
                  </span>

                  {/* File size */}
                  <span className="text-sm text-gray-400 dark:text-gray-500 flex-shrink-0 w-20 text-right">
                    {formatFileSize(book.fileSize)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Book Detail Modal */}
    </div>
  );
}
