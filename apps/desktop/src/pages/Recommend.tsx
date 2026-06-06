// @ts-nocheck
import { Book } from "@bookdock/api-client";
import { BookOpen, Clock, RefreshCw, Sparkles, ThumbsUp } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  selectBooksByProgress,
  selectRecentlyRead,
  useLibraryStore,
} from "../stores/libraryStore";
import { getCoverImageUrl } from "../utils/network";
import { getApiClient } from "@bookdock/api-client";

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

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Recommend() {
  const navigate = useNavigate();
  const { books, fetchBooks, isLoading } = useLibraryStore();
  const [recommended, setRecommended] = useState<Book[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  // 获取推荐数据
  const loadRecommendations = useCallback(async () => {
    setRecLoading(true);
    try {
      const api = getApiClient();
      const res = await api.getRecommendations(12);
      if (res.success && res.data) {
        setRecommended(res.data.books);
      }
    } catch (err) {
      console.error("Failed to load recommendations:", err);
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const inProgress = useMemo(() => selectBooksByProgress(books), [books]);
  const recentlyRead = useMemo(() => selectRecentlyRead(books, 5), [books]);

  const handleBookSelect = (book: Book) => {
    navigate(`/book/${book.id}/detail`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  const hasContent = inProgress.length > 0 || recentlyRead.length > 0 || recommended.length > 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-amber-500" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          推荐
        </h1>
      </div>

      {!hasContent ? (
        <div className="text-center py-20">
          <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            开始阅读书籍后，这里会显示你的阅读推荐
          </p>
        </div>
      ) : (
        <>
          {/* Continue Reading */}
          {inProgress.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500" />
                继续阅读
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {inProgress.map((book) => (
                  <div
                    key={book.id}
                    className="cursor-pointer"
                    onClick={() => handleBookSelect(book)}
                  >
                    <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden relative shadow-sm hover:shadow-md transition-shadow">
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
                          <span className="text-5xl text-white font-bold">
                            {book.title.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300 dark:bg-gray-600">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${book.readingProgress}%` }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">
                      {book.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      已读 {book.readingProgress}%
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 为你推荐 —— flex-wrap 自动换行布局 */}
          {(recommended.length > 0 || recLoading) && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <ThumbsUp className="w-5 h-5 text-amber-500" />
                  为你推荐
                </h2>
                <button
                  onClick={loadRecommendations}
                  disabled={recLoading}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  title="刷新推荐"
                >
                  <RefreshCw className={`w-4 h-4 text-gray-500 dark:text-gray-400 ${recLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {recLoading && recommended.length === 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i}>
                      <div className="aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
                      <div className="mt-2 h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
                      <div className="mt-1 h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {recommended.map((book) => (
                    <div
                      key={book.id}
                      className="cursor-pointer"
                      onClick={() => handleBookSelect(book)}
                    >
                      <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
                            <span className="text-5xl text-white font-bold">
                              {book.title.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">
                        {book.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {book.author || "未知作者"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Recently Read */}
          {recentlyRead.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-green-500" />
                最近阅读
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {recentlyRead.map((book) => (
                  <div
                    key={book.id}
                    className="cursor-pointer"
                    onClick={() => handleBookSelect(book)}
                  >
                    <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
                          <span className="text-5xl text-white font-bold">
                            {book.title.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">
                      {book.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(book.lastReadAt)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
