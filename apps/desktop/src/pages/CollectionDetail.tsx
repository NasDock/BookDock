// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiClient, Book, Collection } from "@bookdock/api-client";
import { getCoverImageUrl } from "../utils/network";
import { ArrowLeft, X, Trash2 } from "lucide-react";

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

export default function CollectionDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<(Collection & { books: Book[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCollection = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const api = getApiClient();
      const res = await api.getCollection(id);
      if (res.success && res.data) {
        setCollection(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch collection:", err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const handleRemoveBook = useCallback(async (bookId: string) => {
    if (!id) return;
    if (!confirm("从书单中移除这本书？")) return;
    try {
      const api = getApiClient();
      await api.removeBookFromCollection(id, bookId);
      fetchCollection();
    } catch {
      alert("移除失败");
    }
  }, [id, fetchCollection]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">书单不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate("/profile")}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{collection.name}</h1>
        </div>

        {collection.description && (
          <p className="text-gray-500 dark:text-gray-400 mb-6">{collection.description}</p>
        )}

        {/* Books */}
        {collection.books.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">书单暂无书籍</p>
          </div>
        ) : (
          <div className="space-y-3">
            {collection.books.map((book) => (
              <div
                key={book.id}
                className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg group"
              >
                <div
                  className="w-12 h-18 rounded overflow-hidden flex-shrink-0 cursor-pointer"
                  onClick={() => navigate(`/book/${book.id}/detail`)}
                >
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
                      <span className="text-xl text-white font-bold">{book.title.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/book/${book.id}/detail`)}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {book.author || "未知作者"}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveBook(book.id)}
                  className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
