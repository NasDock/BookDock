import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { getApiClient, User, EbookSource, Book } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@bookdock/ui';

const formatDate = (dateString?: string): string => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Ebook Sources Management
function EbookSources() {
  const [sources, setSources] = useState<EbookSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Form state
  const [newSource, setNewSource] = useState({
    name: '',
    type: 'local' as const,
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
      await apiClient.syncEbookSource(id);
      // Refresh sources
      await fetchSources();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📚 电子书源管理</h2>
        <Button onClick={() => setShowAddForm(true)}>➕ 添加书源</Button>
      </div>

      {/* Add form */}
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
                  onChange={(e) => setNewSource({ ...newSource, type: e.target.value as any })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="local">本地文件夹</option>
                  <option value="webdav">WebDAV</option>
                  <option value="smb">SMB/共享</option>
                  <option value="ftp">FTP</option>
                </select>
              </div>
              <Input
                label="路径/URL"
                placeholder={newSource.type === 'local' ? '/mnt/books' : 'https://...'}
                value={newSource.url}
                onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
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

      {/* Source list */}
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
                    <span className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs mt-1">
                      {source.type.toUpperCase()}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      source.enabled
                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                    }`}
                  >
                    {source.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 truncate">
                  {source.path || source.url || '-'}
                </p>
                {source.lastSyncAt && (
                  <p className="text-xs text-gray-400 mt-2">
                    最后同步: {formatDate(source.lastSyncAt)}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={() => handleSync(source.id)} disabled={syncingId === source.id}>
                    {syncingId === source.id ? '同步中...' : '🔄 同步'}
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

// User Management
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

      {/* Edit modal */}
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

// Books Management
function BooksManagement() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getBooks();
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📖 书籍管理</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      ) : books.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-gray-500 dark:text-gray-400">暂无书籍</p>
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
                  {books.map((book) => (
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

// Main Admin Component
export default function Admin() {
  const location = useLocation();
  const currentPath = location.pathname.replace('/admin', '') || '/';

  const tabs = [
    { path: '/admin', label: '📚 书源管理', exact: true },
    { path: '/admin/users', label: '👥 用户管理' },
    { path: '/admin/books', label: '📖 书籍管理' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">管理面板</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
      </Routes>
    </div>
  );
}
