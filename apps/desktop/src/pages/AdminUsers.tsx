// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiClient } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@bookdock/ui';
import { ArrowLeft, X, Check } from 'lucide-react';

interface AdminUser {
  id: string;
  username: string;
  displayName?: string;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  _count?: {
    collections: number;
    readingProgress: number;
    bookmarks: number;
  };
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', displayName: '', role: 'user' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [allowRegister, setAllowRegister] = useState(true);
  const [allowRegisterLoading, setAllowRegisterLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const totalPages = Math.ceil(total / limit);

  const fetchUsers = useCallback(async (searchQuery?: string, pageNum?: number) => {
    setLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getUsers({
        page: pageNum || page,
        limit,
        search: searchQuery !== undefined ? searchQuery : search,
      });

      if (response.success && response.data) {
        setUsers(response.data.data || []);
        setTotal(response.data.total || 0);
      } else {
        setUsers([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getSystemConfig('allow_register');
        if (response.success) {
          setAllowRegister(response.data?.value !== 'false');
        }
      } catch {
        // ignore
      }
    };
    fetchConfig();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const handleToggleActive = async (user: AdminUser) => {
    setActionLoading(true);
    try {
      const apiClient = getApiClient();
      await apiClient.updateUser(user.id, { isActive: !user.isActive } as any);
      await fetchUsers();
    } catch (err) {
      console.error('Failed to toggle active:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setActionLoading(true);
    try {
      const apiClient = getApiClient();
      await apiClient.deleteUser(userId);
      setDeleteConfirm(null);
      await fetchUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = (user: AdminUser) => {
    setSelectedUser(user);
    setShowDetail(true);
  };

  const handleCreateUser = async () => {
    if (!createForm.username.trim() || !createForm.password.trim()) {
      setCreateError('用户名和密码不能为空');
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError('密码至少6位');
      return;
    }
    setActionLoading(true);
    setCreateError(null);
    try {
      const apiClient = getApiClient();
      await apiClient.createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        displayName: createForm.displayName.trim() || undefined,
        role: createForm.role,
      });
      setShowCreateModal(false);
      setCreateForm({ username: '', password: '', displayName: '', role: 'user' });
      await fetchUsers();
    } catch (err: any) {
      setCreateError(err.response?.data?.message || '创建用户失败');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };



  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">用户管理</h1>
            </div>
          </div>

          {/* Search bar */}
          <div className="pb-4">
            <form onSubmit={handleSearch} className="flex gap-2 items-center">
              <div className="flex-1 max-w-md">
                <Input
                  type="text"
                  placeholder="搜索用户名..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button type="submit" size="sm">搜索</Button>
              {search && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearSearch}>
                  清除
                </Button>
              )}
              <div className="flex-1"></div>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <div
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    allowRegister ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  onClick={async () => {
                    if (allowRegisterLoading) return;
                    setAllowRegisterLoading(true);
                    try {
                      const apiClient = getApiClient();
                      const newValue = allowRegister ? 'false' : 'true';
                      await apiClient.setSystemConfig('allow_register', newValue);
                      setAllowRegister(!allowRegister);
                    } catch (err) {
                      console.error('Failed to update config:', err);
                    } finally {
                      setAllowRegisterLoading(false);
                    }
                  }}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      allowRegister ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </div>
                {allowRegisterLoading ? '保存中...' : allowRegister ? '允许注册' : '禁止注册'}
              </label>
              <Button type="button" size="sm" onClick={() => setShowCreateModal(true)}>
                新增用户
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      注册时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      最后登录
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                        暂无用户
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
                              {user.username[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {user.displayName || user.username}
                                {user.role === 'admin' && (
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    管理员
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">@{user.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.lastLoginAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={actionLoading || user.role === 'admin'}
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              user.isActive
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            } ${user.role === 'admin' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            {user.isActive ? <><Check className="w-3 h-3" /> 正常</> : <><X className="w-3 h-3" /> 禁用</>}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openDetail(user)}
                              className="text-blue-500 hover:text-blue-700 text-xs"
                            >
                              详情
                            </button>
                            {user.role !== 'admin' && (
                              deleteConfirm === user.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    disabled={actionLoading}
                                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                                  >
                                    确认
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="text-gray-500 hover:text-gray-700 text-xs"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(user.id)}
                                  className="text-red-500 hover:text-red-700 text-xs"
                                >
                                  删除
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  第 {page} / {totalPages} 页，共 {total} 条
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {showDetail && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">用户详情</h2>
                <button
                  onClick={() => setShowDetail(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-2xl font-bold">
                  {selectedUser.username[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedUser.displayName || selectedUser.username}
                  </h3>
                  <p className="text-gray-500">@{selectedUser.username}</p>
                  {selectedUser.role === 'admin' && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      管理员
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">状态</label>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {selectedUser.isActive ? <><Check className="w-3 h-3 inline" /> 正常</> : <><X className="w-3 h-3 inline" /> 禁用</>}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">注册时间</label>
                  <p className="text-sm text-gray-900 dark:text-white">{formatDate(selectedUser.createdAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">最后登录</label>
                  <p className="text-sm text-gray-900 dark:text-white">{formatDate(selectedUser.lastLoginAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">收藏数</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedUser._count?.collections || 0}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">阅读记录</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedUser._count?.readingProgress || 0}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">书签数</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedUser._count?.bookmarks || 0}</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDetail(false)}>关闭</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">新增用户</h2>
                <button
                  onClick={() => { setShowCreateModal(false); setCreateError(null); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {createError && (
                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
                  {createError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  用户名 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="请输入用户名"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  密码 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  placeholder="至少6位"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  显示名称
                </label>
                <Input
                  type="text"
                  placeholder="可选"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  角色
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">普通用户</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowCreateModal(false); setCreateError(null); }}>
                取消
              </Button>
              <Button onClick={handleCreateUser} disabled={actionLoading}>
                {actionLoading ? '创建中...' : '创建'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
