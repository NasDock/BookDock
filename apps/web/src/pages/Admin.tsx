import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { getApiClient, User, EbookSource, Book } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@bookdock/ui';

// ==================== Open Library Search ====================
interface OLSearchResult {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  isbn?: string[];
  publisher?: string[];
}

function OpenLibrarySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OLSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      // Search Open Library API
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,cover_i,first_publish_year,isbn,publisher`
      );
      const data = await response.json();

      if (data.docs) {
        setResults(data.docs);
      } else {
        setResults([]);
      }
    } catch (err) {
      setError('搜索失败，请稍后重试');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddBook = async (result: OLSearchResult) => {
    setAddingIds((prev) => new Set(prev).add(result.key));

    try {
      const apiClient = getApiClient();
      const bookData: Partial<Book> = {
        title: result.title,
        author: result.author_name?.[0] || '未知作者',
        fileType: 'epub', // Default to epub, user can change later
        filePath: `ol://${result.key}`,
        fileSize: 0,
        language: 'en',
        isbn: result.isbn?.[0],
        publisher: result.publisher?.[0],
        addedAt: new Date().toISOString(),
      };

      const response = await apiClient.addBook(bookData);
      if (response.success) {
        setAddedIds((prev) => new Set(prev).add(result.key));
      }
    } catch (err) {
      console.error('Failed to add book:', err);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.key);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">🔍 搜索公开书籍</h2>
        <a
          href="https://openlibrary.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-500 hover:text-blue-600"
        >
          Open Library ↗
        </a>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索书名、作者、ISBN..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button type="submit" disabled={isSearching}>
          {isSearching ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span>
              搜索中...
            </span>
          ) : (
            '🔍 搜索'
          )}
        </Button>
      </form>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((result) => (
            <Card key={result.key}>
              <CardContent className="flex gap-4">
                {/* Cover */}
                <div className="w-16 h-20 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                  {result.cover_i ? (
                    <img
                      src={`https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg`}
                      alt={result.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-600">
                      <span className="text-gray-400">📖</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">{result.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {result.author_name?.[0] || '未知作者'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {result.first_publish_year && (
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                        {result.first_publish_year}
                      </span>
                    )}
                    {result.isbn?.[0] && (
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                        ISBN: {result.isbn[0]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Add button */}
                <div className="flex-shrink-0">
                  {addedIds.has(result.key) ? (
                    <span className="text-green-500 text-sm">✓ 已添加</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleAddBook(result)}
                      disabled={addingIds.has(result.key)}
                    >
                      {addingIds.has(result.key) ? '添加中...' : '➕ 添加'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : query && !isSearching ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="text-5xl mb-4">🔍</div>
          <p>未找到相关书籍</p>
        </div>
      ) : null}
    </div>
  );
}

// ==================== Ebook Sources Management ====================
function EbookSources() {
  const [sources, setSources] = useState<EbookSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [newSource, setNewSource] = useState({
    name: '',
    type: 'local' as 'local' | 'webdav' | 'smb' | 'ftp',
    url: '',
    path: '',
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getEbookSources();
      if (response.success && response.data) {
        setSources(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSource = async () => {
    if (!newSource.name) return;

    try {
      const apiClient = getApiClient();
      const response = await apiClient.addEbookSource(newSource);
      if (response.success && response.data) {
        setSources([...sources, response.data]);
        setShowAddForm(false);
        setNewSource({ name: '', type: 'local', url: '', path: '' });
      }
    } catch (error) {
      console.error('Failed to add source:', error);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const apiClient = getApiClient();
      const result = await apiClient.syncEbookSource(id);
      if (result.success) {
        await fetchSources();
      }
    } catch (error) {
      console.error('Failed to sync source:', error);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除此电子书源吗？')) return;

    try {
      const apiClient = getApiClient();
      await apiClient.deleteEbookSource(id);
      setSources(sources.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Failed to delete source:', error);
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const apiClient = getApiClient();
      await apiClient.updateEbookSource(id, { enabled: !enabled });
      setSources(sources.map((s) => (s.id === id ? { ...s, enabled: !enabled } : s)));
    } catch (error) {
      console.error('Failed to toggle source:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📚 电子书源管理</h2>
        <Button onClick={() => setShowAddForm(true)}>➕ 添加书源</Button>
      </div>

      {showAddForm && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle>添加新书源</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="名称"
                placeholder="我的NAS书库"
                value={newSource.name}
                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  类型
                </label>
                <select
                  value={newSource.type}
                  onChange={(e) => setNewSource({ ...newSource, type: e.target.value as typeof newSource.type })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="local">本地文件夹</option>
                  <option value="webdav">WebDAV</option>
                  <option value="smb">SMB/共享</option>
                  <option value="ftp">FTP</option>
                </select>
              </div>
              <Input
                label={newSource.type === 'local' ? '文件夹路径' : 'URL/地址'}
                placeholder={newSource.type === 'local' ? '/mnt/books' : 'https://...'}
                value={newSource.url}
                onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
              />
              <Input
                label="子目录 (可选)"
                placeholder="/ebooks"
                value={newSource.path}
                onChange={(e) => setNewSource({ ...newSource, path: e.target.value })}
              />
            </div>
            <div className="flex gap-3 mt-4">
              <Button onClick={handleAddSource}>保存</Button>
              <Button variant="secondary" onClick={() => setShowAddForm(false)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : sources.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-5xl mb-4">📂</div>
            <p className="text-gray-500 dark:text-gray-400">暂无电子书源</p>
            <p className="text-sm text-gray-400 mt-1">点击上方按钮添加第一个书源</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardContent>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{source.name}</h3>
                    <span className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs mt-1 uppercase">
                      {source.type}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={() => handleToggleEnabled(source.id, source.enabled)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 truncate">
                  {source.path || source.url || '-'}
                </p>
                {source.lastSyncAt && (
                  <p className="text-xs text-gray-400 mt-2">
                    最后同步: {new Date(source.lastSyncAt).toLocaleDateString('zh-CN')}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={() => handleSync(source.id)} disabled={syncingId === source.id || !source.enabled}>
                    {syncingId === source.id ? '🔄 同步中...' : '🔄 同步'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(source.id)}>
                    🗑️
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== User Management ====================
function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getUsers();
      if (response.success && response.data) {
        setUsers(response.data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.updateUser(userId, updates);
      if (response.success && response.data) {
        setUsers(users.map((u) => (u.id === userId ? response.data! : u)));
        setEditingUser(null);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('确定要删除此用户吗？')) return;

    try {
      const apiClient = getApiClient();
      await apiClient.deleteUser(userId);
      setUsers(users.filter((u) => u.id !== userId));
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">👥 用户管理</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      用户名
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      邮箱
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      角色
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      会员
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      注册时间
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {user.username}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {user.email || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            user.role === 'admin'
                              ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {user.role === 'admin' ? '管理员' : '用户'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            user.membership === 'premium'
                              ? 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                          }`}
                        >
                          {user.membership === 'premium' ? 'Premium' : '免费'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingUser(user)}
                          >
                            ✏️
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            🗑️
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              编辑用户: {editingUser.username}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  角色
                </label>
                <select
                  id="edit-role"
                  defaultValue={editingUser.role}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="user">用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  会员
                </label>
                <select
                  id="edit-membership"
                  defaultValue={editingUser.membership}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="free">免费</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => {
                  const role = (document.getElementById('edit-role') as HTMLSelectElement).value as 'admin' | 'user';
                  const membership = (document.getElementById('edit-membership') as HTMLSelectElement).value as 'free' | 'premium';
                  handleUpdateUser(editingUser.id, { role, membership });
                }}
              >
                保存
              </Button>
              <Button variant="secondary" onClick={() => setEditingUser(null)}>
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Books Management ====================
function BooksManagement() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'epub' | 'pdf' | 'txt'>('all');

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getBooks({ limit: 100 });
      if (response.success && response.data) {
        setBooks(response.data.books);
      }
    } catch (error) {
      console.error('Failed to fetch books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!window.confirm('确定要删除此书籍吗？')) return;

    try {
      const apiClient = getApiClient();
      await apiClient.deleteBook(bookId);
      setBooks(books.filter((b) => b.id !== bookId));
    } catch (error) {
      console.error('Failed to delete book:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredBooks = filter === 'all' ? books : books.filter((b) => b.fileType === filter);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📖 书籍管理</h2>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'epub', 'pdf', 'txt'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? '全部' : f.toUpperCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : filteredBooks.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-gray-500 dark:text-gray-400">
              {filter === 'all' ? '暂无书籍' : `暂无${filter.toUpperCase()}格式的书籍`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      书籍
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      作者
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      格式
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      大小
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                      进度
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredBooks.map((book) => (
                    <tr key={book.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                            {book.coverUrl ? (
                              <img
                                src={book.coverUrl}
                                alt={book.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                                <span className="text-white font-bold">{book.title.charAt(0)}</span>
                              </div>
                            )}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                            {book.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {book.author || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs uppercase">
                          {book.fileType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {formatFileSize(book.fileSize)}
                      </td>
                      <td className="px-4 py-3">
                        {book.readingProgress !== undefined && book.readingProgress > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${book.readingProgress}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{book.readingProgress}%</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleDeleteBook(book.id)}
                        >
                          🗑️
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
// ==================== System Settings ====================
function SystemSettings() {
  const [settings, setSettings] = useState({
    siteName: '书仓',
    siteDescription: '您的私人电子书库',
    allowPublicRegistration: true,
    defaultMembership: 'free' as 'free' | 'premium',
    maxStoragePerUser: 10 * 1024 * 1024 * 1024,
    enableTTS: true,
    ttsProvider: 'browser' as 'browser' | 'server',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    localStorage.setItem('bookdock_system_settings', JSON.stringify(settings));
    setSaveMessage('设置已保存');
    setIsSaving(false);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">⚙️ 系统设置</h2>

      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">网站名称</label>
            <input type="text" value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">网站描述</label>
            <textarea value={settings.siteDescription} onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })} rows={3} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>用户设置</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">允许公开注册</p>
              <p className="text-sm text-gray-500">允许新用户自行注册账户</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.allowPublicRegistration} onChange={(e) => setSettings({ ...settings, allowPublicRegistration: e.target.checked })} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">默认会员类型</label>
            <select value={settings.defaultMembership} onChange={(e) => setSettings({ ...settings, defaultMembership: e.target.value as 'free' | 'premium' })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <option value="free">免费</option><option value="premium">Premium</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>TTS 设置</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">启用语音朗读</p>
              <p className="text-sm text-gray-500">允许用户使用文字转语音功能</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.enableTTS} onChange={(e) => setSettings({ ...settings, enableTTS: e.target.checked })} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">TTS 提供商</label>
            <select value={settings.ttsProvider} onChange={(e) => setSettings({ ...settings, ttsProvider: e.target.value as 'browser' | 'server' })} className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <option value="browser">浏览器 TTS</option><option value="server">服务器 TTS</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {saveMessage && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-600 dark:text-green-400 text-center">{saveMessage}</div>
      )}
      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? '保存中...' : '💾 保存设置'}
      </Button>
    </div>
  );
}

// ==================== Main Admin Component ====================
export default function Admin() {
  const location = useLocation();
  const currentPath = location.pathname.replace('/admin', '') || '/';

  const tabs = [
    { path: '/admin', label: '📚 书源管理', exact: true },
    { path: '/admin/users', label: '👥 用户管理' },
    { path: '/admin/books', label: '📖 书籍管理' },
    { path: '/admin/search', label: '🔍 公开搜索' },
    { path: '/admin/settings', label: '⚙️ 系统设置' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">管理面板</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              currentPath === tab.path
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Content */}
      <Routes>
        <Route path="/" element={<EbookSources />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/books" element={<BooksManagement />} />
        <Route path="/search" element={<OpenLibrarySearch />} />
        <Route path="/settings" element={<SystemSettings />} />
      </Routes>
    </div>
  );
}
