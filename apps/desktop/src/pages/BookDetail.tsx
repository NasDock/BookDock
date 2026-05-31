// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiClient, type Book } from "@bookdock/api-client";
import { getCoverImageUrl } from "../utils/network";
import {
  ArrowLeft,
  BookOpen,
  Headphones,
  Heart,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Tag,
  Building,
  Calendar,
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

function parseMetadata(metadata: string | object | undefined | any) {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

export default function BookDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<{ title: string; index: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);

  // 加载书籍详情
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadDetails() {
      setIsLoading(true);
      try {
        const api = getApiClient();
        const [bookRes, chapterRes, favRes] = await Promise.all([
          api.getBook(id),
          api.getChapters(id),
          api.checkFavorite(id).catch(() => ({ success: false, data: { isFavorite: false } })),
        ]);
        if (!cancelled) {
          if (bookRes.success && bookRes.data) {
            setBook(bookRes.data);
          }
          if (chapterRes.success && chapterRes.data) {
            setChapters(chapterRes.data);
          }
          if (favRes.success && favRes.data) {
            setIsFavorite(favRes.data.isFavorite);
          }
        }
      } catch (err) {
        console.error("Failed to load book details:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadDetails();
    return () => { cancelled = true; };
  }, [id]);

  const handleRead = useCallback(() => {
    if (book) navigate(`/book/${book.id}`);
  }, [navigate, book]);

  const handleTTS = useCallback(() => {
    if (book) navigate(`/book/${book.id}/tts`);
  }, [navigate, book]);

  const handleToggleFavorite = useCallback(async () => {
    if (!book) return;
    try {
      const api = getApiClient();
      if (isFavorite) {
        await api.removeFavorite(book.id);
        setIsFavorite(false);
      } else {
        await api.addFavorite(book.id);
        setIsFavorite(true);
      }
    } catch {
      alert("操作失败");
    }
  }, [book, isFavorite]);

  const metadata = useMemo(() => parseMetadata((book as any)?.metadata), [book]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">书籍不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleFavorite}
              className={`p-2 transition-colors ${
                isFavorite
                  ? "text-red-500"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              <Heart className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>

        {/* 书籍基本信息 — 响应式布局 */}
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          {/* 封面 */}
          <div className="w-48 md:w-56 flex-shrink-0 mx-auto md:mx-0">
            <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
              {book.coverUrl ? (
                <img
                  src={getCoverImageUrl(book.coverUrl)}
                  alt={book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getBookGradient(book.title)}`}
                >
                  <span className="text-6xl text-white font-bold">
                    {book.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 信息 */}
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {book.title}
            </h1>

            {book.author && (
              <div className="flex items-center gap-1 text-blue-500 hover:text-blue-600 cursor-pointer">
                <span className="text-lg">{book.author}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            )}

            {/* 书籍信息 */}
            <div className="space-y-2 pt-1">
              {metadata.tags && metadata.tags.length > 0 && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">标签</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{metadata.tags.join('、')}</span>
                </div>
              )}
              {metadata.category && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">分类</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {Array.isArray(metadata.category) ? metadata.category.join(" > ") : metadata.category}
                  </span>
                </div>
              )}
              {metadata.series && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">丛书</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{metadata.series}</span>
                </div>
              )}
              {book.publisher && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">出版社</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{book.publisher}</span>
                </div>
              )}
              {(book.publishedDate || metadata.publishedDate || metadata.published || metadata.pub_date) && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">出版日期</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {(() => {
                      const date = book.publishedDate || metadata.publishedDate || metadata.published || metadata.pub_date;
                      if (typeof date === 'string') return date;
                      if (date instanceof Date) return date.toISOString().split('T')[0];
                      return String(date);
                    })()}
                  </span>
                </div>
              )}
              {(book.totalPages || metadata.pages) && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">页数</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{book.totalPages || metadata.pages} 页</span>
                </div>
              )}
              {book.isbn && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">ISBN</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{book.isbn}</span>
                </div>
              )}
              {book.language && book.language !== 'zh' && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">语言</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{book.language}</span>
                </div>
              )}
              {book.format && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">格式</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{book.format.toUpperCase()}</span>
                </div>
              )}
              {metadata.rating && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">豆瓣评分</span>
                  <span className="text-sm text-amber-500">★ {metadata.rating}</span>
                </div>
              )}
              {book.fileSize && (
                <div className="flex items-start gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">文件大小</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{(book.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleRead}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                阅读
              </button>
              <button
                onClick={handleTTS}
                className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors border border-gray-200 dark:border-gray-600"
              >
                <Headphones className="w-4 h-4" />
                听书
              </button>
            </div>
          </div>
        </div>

        {/* 阅读进度 */}
        {(book.readingProgress !== undefined && book.readingProgress > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">阅读进度</h2>
              <button
                onClick={handleRead}
                className="px-4 py-1.5 text-sm text-blue-500 border border-blue-500 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                继续阅读
              </button>
            </div>
            <div className="text-4xl font-bold text-blue-500 mb-2">
              {Math.round(book.readingProgress)}%
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${book.readingProgress}%` }}
              />
            </div>
            {book.currentPage !== undefined && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                上次阅读到：第 {book.currentPage} 页
              </p>
            )}
          </div>
        )}

        {/* 内容简介 */}
        {(book.description || metadata.summary) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">内容简介</h2>
            <p
              className={`text-gray-700 dark:text-gray-300 leading-relaxed ${
                descExpanded ? "" : "line-clamp-5"
              }`}
            >
              {book.description || metadata.summary}
            </p>
            <button
              onClick={() => setDescExpanded(!descExpanded)}
              className="flex items-center gap-1 mt-3 text-blue-500 hover:text-blue-600 text-sm font-medium"
            >
              {descExpanded ? (
                <>
                  收起 <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  展开 <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* 作者简介 */}
        {metadata.authorIntro && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">作者简介</h2>
            <div className="flex gap-4">
              <div className="w-14 h-14 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-white">
                  {book.author?.charAt(0) || "?"}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{book.author}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-4">
                  {metadata.authorIntro}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 目录 */}
        {chapters.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">目录</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">共 {chapters.length} 章</span>
            </div>
            <div className="space-y-1">
              {(showAllChapters ? chapters : chapters.slice(0, 5)).map((chapter, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors"
                  onClick={handleRead}
                >
                  <span className="text-sm text-gray-400 w-8">{idx + 1}.</span>
                  <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">
                    {chapter.title}
                  </span>
                  {idx < (book.currentPage || 0) && (
                    <span className="text-xs text-green-500">已读</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              ))}
            </div>
            {chapters.length > 5 && (
              <button
                onClick={() => setShowAllChapters(!showAllChapters)}
                className="w-full mt-3 py-2 text-center text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors"
              >
                {showAllChapters ? "收起目录" : "查看全部目录"}
              </button>
            )}
          </div>
        )}


      </div>
    </div>
  );
}
