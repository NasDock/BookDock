import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiClient } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@bookdock/ui';

interface VipInfo {
  vipLevel: string;
  vipExpiredAt: string | null;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
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
  vipLevel?: string;
  vipExpiredAt?: string | null;
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
  const [showVipModal, setShowVipModal] = useState(false);
  const [vipEdit, setVipEdit] = useState<{ level: string; expiredAt: string }>({ level: 'free', expiredAt: '' });
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
        setUsers(response.data.users);
        setTotal(response.data.total);
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

  const openVipModal = (user: AdminUser) => {
    setSelectedUser(user);
    setVipEdit({
      level: user.vipLevel || 'free',
      expiredAt: user.vipExpiredAt ? new Date(user.vipExpiredAt).toISOString().slice(0, 16) : '',
    });
    setShowVipModal(true);
  };

  const handleSaveVip = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const apiClient = getApiClient();
      await apiClient.updateUser(selectedUser.id, {
        vipLevel: vipEdit.level,
        vipExpiredAt: vipEdit.expiredAt ? new Date(vipEdit.expiredAt).toISOString() : null,
      } as any);
      setShowVipModal(false);
      await fetchUsers();
    } catch (err) {
      console.error('Failed to update VIP:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = (user: AdminUser) => {
    setSelectedUser(user);
    setShowDetail(true);
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

  const getVipBadge = (level?: string) => {
    if (!level || level === 'free') return null;
    const colors: Record<string, string> = {
      year: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      lifetime: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
    const labels: Record<string, string> = {
      year: '年费会员',
      lifetime: '永久会员',
    };
    return (
      <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${colors[level] || ''}`}>
        👑 {labels[level] || level}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ← 返回
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">用户管理</h1>
              <span className="text-sm text-gray-500">共 {total} 位用户</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="pb-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="flex-1 max-w-md">
                <Input
                  type="text"
                  placeholder="搜索用户名、邮箱..."
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
                      邮箱
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      注册时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      最后登录
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      会员状态
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
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
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
                          {user.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(user.lastLoginAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => openVipModal(user)}
                            className="inline-flex items-center text-sm hover:underline"
                          >
                            {getVipBadge(user.vipLevel) || (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                免费用户
                              </span>
                            )}
                          </button>
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
                            {user.isActive ? '✓ 正常' : '✕ 禁用'}
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
                            <button
                              onClick={() => openVipModal(user)}
                              className="text-amber-500 hover:text-amber-700 text-xs"
                            >
                              会员
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
                  ✕
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
                  <label className="text-xs text-gray-500 dark:text-gray-400">邮箱</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">状态</label>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {selectedUser.isActive ? '✓ 正常' : '✕ 禁用'}
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
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">会员等级</label>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {selectedUser.vipLevel === 'year' ? '👑 年费会员' :
                     selectedUser.vipLevel === 'lifetime' ? '👑 永久会员' : '免费用户'}
                    {selectedUser.vipExpiredAt && (
                      <span className="text-xs text-gray-500 ml-1">
                        (到期: {new Date(selectedUser.vipExpiredAt).toLocaleDateString('zh-CN')})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDetail(false)}>关闭</Button>
              <Button onClick={() => { setShowDetail(false); openVipModal(selectedUser); }}>管理会员</Button>
            </div>
          </div>
        </div>
      )}

      {/* VIP Management Modal */}
      {showVipModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">会员管理</h2>
                <button
                  onClick={() => setShowVipModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                用户: {selectedUser.displayName || selectedUser.username}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  会员等级
                </label>
                <select
                  value={vipEdit.level}
                  onChange={(e) => setVipEdit((v) => ({ ...v, level: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="free">免费用户</option>
                  <option value="year">年费会员</option>
                  <option value="lifetime">永久会员</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  到期时间 {vipEdit.level === 'lifetime' && '(永久留空)'}
                </label>
                <input
                  type="datetime-local"
                  value={vipEdit.expiredAt}
                  onChange={(e) => setVipEdit((v) => ({ ...v, expiredAt: e.target.value }))}
                  disabled={vipEdit.level === 'lifetime'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                {vipEdit.level === 'lifetime' && (
                  <p className="text-xs text-gray-500 mt-1">永久会员无到期时间</p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowVipModal(false)}>取消</Button>
              <Button onClick={handleSaveVip} disabled={actionLoading}>
                {actionLoading ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
