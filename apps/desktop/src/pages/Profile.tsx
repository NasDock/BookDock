// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
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

type TabKey = "collections" | "reading" | "favorites" | "downloads";

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>("collections");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    { key: "downloads", label: "下载", icon: Download },
  ];

  const renderBookCard = (book: Book) => (
    <div
      key={book.id}
      className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      onClick={() => navigate(`/book/${book.id}`)}
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

  const renderContent = () => {
    if (isLoading) {
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
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">我的</h1>
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
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 mb-6">
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
        <div className="bg-white dark:bg-gray-800 rounded-xl p-1 mb-6 flex">
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


      </div>

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
