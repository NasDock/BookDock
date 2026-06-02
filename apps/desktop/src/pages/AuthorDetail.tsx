// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiClient, type Book, type Author } from "@bookdock/api-client";
import { getCoverImageUrl } from "../utils/network";
import { ArrowLeft, BookOpen } from "lucide-react";

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

export default function AuthorDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [author, setAuthor] = useState<Author | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const api = getApiClient();
        const [authorRes, booksRes] = await Promise.all([
          api.getAuthor(id),
          api.getAuthorBooks(id),
        ]);
        if (!cancelled) {
          if (authorRes.success && authorRes.data) {
            setAuthor(authorRes.data);
          }
          if (booksRes.success && booksRes.data) {
            setBooks(booksRes.data);
          }
        }
      } catch (err) {
        console.error("Failed to load author detail:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [id]);

  const handleBookSelect = useCallback((book: Book) => {
    navigate(`/book/${book.id}/detail`);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">作者不存在</p>
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
        </div>

        {/* 作者信息 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center mb-4">
            <span className="text-3xl font-bold text-white">
              {author.name?.charAt(0) || "?"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {author.name}
          </h1>
          {author.nationality && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              {author.nationality}
            </p>
          )}
          {author.birthDate && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {author.birthDate}
              {author.deathDate ? ` - ${author.deathDate}` : ""}
            </p>
          )}
        </div>

        {/* 作者简介 */}
        {author.bio && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              作者简介
            </h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              {author.bio}
            </p>
          </div>
        )}

        {/* 书籍列表 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            作品 ({books.length})
          </h2>
          {books.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-10">
              暂无书籍
            </p>
          ) : (
            <div className="flex gap-4 flex-wrap">
              {books.map((book) => (
                <div
                  key={book.id}
                  className="w-36 cursor-pointer"
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
