import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLibraryStore, selectRecentlyRead, selectBooksByProgress } from '../stores/libraryStore';
import { useAuthStore } from '../stores/authStore';
import { Button, Input, Card, CardContent } from '@bookdock/ui';
import type { Book } from '@bookdock/api-client';

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const BookCard: React.FC<{ book: Book; onSelect: () => void }> = ({ book, onSelect }) => {
  return (
    <Card
      className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105"
      onClick={onSelect}
    >
      <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-t-xl overflow-hidden relative">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
            <span className="text-4xl text-white font-bold">{book.title.charAt(0)}</span>
          </div>
        )}
        
        {/* Progress indicator */}
        {book.readingProgress !== undefined && book.readingProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300 dark:bg-gray-600">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${book.readingProgress}%` }}
            />
          </div>
        )}

        {/* Format badge */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 rounded text-xs text-white uppercase">
          {book.fileType}
        </div>
      </div>

      <CardContent className="p-3">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate" title={book.title}>
          {book.title}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {book.author || '未知作者'}
        </p>
        <div className="flex items-center justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
          <span>{formatFileSize(book.fileSize)}</span>
          {book.readingProgress !== undefined && book.readingProgress > 0 && (
            <span className="text-blue-500">{book.readingProgress}%</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const BookDetailModal: React.FC<{ book: Book; onClose: () => void }> = ({ book, onClose }) => {
  const navigate = useNavigate();
  const { deleteBook } = useLibraryStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRead = () => {
    onClose();
    navigate(`/book/${book.id}`);
  };

  const handleTTS = () => {
    onClose();
    navigate(`/book/${book.id}/tts`);
  };

  const handleDelete = async () => {
    if (window.confirm(`确定要删除《${book.title}》吗？`)) {
      setIsDeleting(true);
      await deleteBook(book.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700">
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                <span className="text-6xl text-white font-bold">{book.title.charAt(0)}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{book.title}</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{book.author || '未知作者'}</p>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm">
              {book.fileType.toUpperCase()}
            </span>
            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm">
              {formatFileSize(book.fileSize)}
            </span>
            <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm">
              添加于 {formatDate(book.addedAt)}
            </span>
          </div>

          {book.description && (
            <p className="mt-4 text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              {book.description}
            </p>
          )}

          {book.publisher && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              出版社: {book.publisher}
            </p>
          )}

          {book.readingProgress !== undefined && book.readingProgress > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-500 dark:text-gray-400">阅读进度</span>
                <span className="font-medium text-blue-500">{book.readingProgress}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${book.readingProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <Button className="flex-1" onClick={handleRead}>
              📖 {book.readingProgress ? '继续阅读' : '开始阅读'}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={handleTTS}>
              🔊 听书
            </Button>
          </div>

          <Button
            variant="ghost"
            className="w-full mt-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? '删除中...' : '🗑️ 删除'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default function Library() {
  const navigate = useNavigate();
  const { books, isLoading, error, searchQuery, fetchBooks, setSearchQuery } = useLibraryStore();
  const { user } = useAuthStore();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterFormat, setFilterFormat] = useState<Book['fileType'] | 'all'>('all');

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const filteredBooks = useMemo(() => {
    let result = books;
    
    if (filterFormat !== 'all') {
      result = result.filter((book) => book.fileType === filterFormat);
    }
    
    return result;
  }, [books, filterFormat]);

  const recentlyRead = useMemo(() => selectRecentlyRead(books, 5), [books]);
  const inProgress = useMemo(() => selectBooksByProgress(books), [books]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBooks({ search: searchQuery });
  };

  const handleBookSelect = (book: Book) => {
    setSelectedBook(book);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-red-500 text-lg mb-4">{error}</div>
        <Button onClick={() => fetchBooks()}>重试</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">我的书库</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            共 {books.length} 本书籍
            {user?.membership === 'premium' && (
              <span className="ml-2 text-amber-500">Premium 会员</span>
            )}
          </p>
        </div>

        <Button onClick={() => navigate('/admin')}>📚 添加书籍</Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索书名或作者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 pl-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          </div>
        </form>

        <div className="flex gap-2">
          <select
            value={filterFormat}
            onChange={(e) => setFilterFormat(e.target.value as Book['fileType'] | 'all')}
            className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部格式</option>
            <option value="epub">EPUB</option>
            <option value="pdf">PDF</option>
            <option value="mobi">MOBI</option>
            <option value="txt">TXT</option>
          </select>

          <div className="flex border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2.5 ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2.5 ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* Continue Reading */}
      {inProgress.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">📖 继续阅读</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
            {inProgress.map((book) => (
              <div
                key={book.id}
                className="flex-shrink-0 w-48 cursor-pointer"
                onClick={() => handleBookSelect(book)}
              >
                <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                      <span className="text-3xl text-white font-bold">{book.title.charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300 dark:bg-gray-600">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${book.readingProgress}%` }}
                    />
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">{book.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{book.readingProgress}%</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently Added */}
      {recentlyRead.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">🕐 最近阅读</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
            {recentlyRead.map((book) => (
              <div
                key={book.id}
                className="flex-shrink-0 w-48 cursor-pointer"
                onClick={() => handleBookSelect(book)}
              >
                <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-400 to-teal-500">
                      <span className="text-3xl text-white font-bold">{book.title.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate">{book.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(book.lastReadAt)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Books */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">📚 全部书籍</h2>

        {isLoading ? (
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
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-medium text-gray-900 dark:text-white">暂无书籍</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">点击上方按钮添加您的第一本书</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} onSelect={() => handleBookSelect(book)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleBookSelect(book)}
              >
                <div className="w-16 h-20 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                      <span className="text-lg text-white font-bold">{book.title.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{book.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{book.author || '未知作者'}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{book.fileType.toUpperCase()}</span>
                    <span>{formatFileSize(book.fileSize)}</span>
                    {book.readingProgress && book.readingProgress > 0 && (
                      <span className="text-blue-500">{book.readingProgress}%</span>
                    )}
                  </div>
                </div>
                <div className="text-2xl">›</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Book Detail Modal */}
      {selectedBook && <BookDetailModal book={selectedBook} onClose={() => setSelectedBook(null)} />}
    </div>
  );
}
