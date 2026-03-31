import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getApiClient } from '@bookdock/api-client';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName?: string;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  vipLevel?: string;
  vipExpiredAt?: string | null;
}

export function AdminUsersScreen() {
  const navigation = useNavigation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);
  const [vipEdit, setVipEdit] = useState({ level: 'free', expiredAt: '' });

  const theme = getTheme();
  const styles = createStyles(theme);
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
  }, [page, limit, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const openVipModal = (user: AdminUser) => {
    setSelectedUser(user);
    setVipEdit({
      level: user.vipLevel || 'free',
      expiredAt: user.vipExpiredAt ? new Date(user.vipExpiredAt).toISOString().slice(0, 16) : '',
    });
    setShowVipModal(true);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  const getVipBadge = (level?: string) => {
    if (!level || level === 'free') return null;
    return (
      <Text style={[styles.badge, level === 'year' ? styles.badgeYear : styles.badgeLifetime]}>
        👑 {level === 'year' ? '年费' : '永久'}
      </Text>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => (navigation as any).goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={styles.title}>用户管理</Text>
          <Text style={styles.subtitle}>{total} 位用户</Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索用户..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => fetchUsers(search)}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={() => fetchUsers(search)}>
            <Ionicons name="search" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        >
          {users.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>暂无用户</Text>
            </View>
          ) : (
            users.map((user) => (
              <TouchableOpacity
                key={user.id}
                style={styles.userCard}
                onPress={() => { setSelectedUser(user); setShowDetail(true); }}
              >
                <View style={styles.userRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{user.username[0].toUpperCase()}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{user.displayName || user.username}</Text>
                      {user.role === 'admin' && (
                        <Text style={styles.adminBadge}>管理员</Text>
                      )}
                    </View>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={styles.userDate}>注册: {formatDate(user.createdAt)}</Text>
                  </View>
                  <View style={styles.userActions}>
                    {getVipBadge(user.vipLevel) || (
                      <Text style={styles.freeBadge}>免费</Text>
                    )}
                    <Text style={[styles.statusBadge, user.isActive ? styles.statusActive : styles.statusInactive]}>
                      {user.isActive ? '正常' : '禁用'}
                    </Text>
                  </View>
                </View>

                <View style={styles.quickActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => { setSelectedUser(user); setShowDetail(true); }}
                  >
                    <Text style={styles.actionBtnText}>详情</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnVip]}
                    onPress={() => openVipModal(user)}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnVipText]}>会员</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <Text style={styles.pageBtnText}>上一页</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>第 {page} / {totalPages} 页</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <Text style={styles.pageBtnText}>下一页</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Detail Modal */}
      {showDetail && selectedUser && (
        <Modal visible={showDetail} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>用户详情</Text>
                <TouchableOpacity onPress={() => setShowDetail(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>用户名</Text>
                  <Text style={styles.detailValue}>{selectedUser.displayName || selectedUser.username}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>邮箱</Text>
                  <Text style={styles.detailValue}>{selectedUser.email}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>注册时间</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedUser.createdAt)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>最后登录</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedUser.lastLoginAt)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>会员等级</Text>
                  <Text style={styles.detailValue}>
                    {selectedUser.vipLevel === 'year' ? '👑 年费会员' :
                     selectedUser.vipLevel === 'lifetime' ? '👑 永久会员' : '免费用户'}
                  </Text>
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.modalBtn} onPress={() => setShowDetail(false)}>
                  <Text style={styles.modalBtnText}>关闭</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={() => { setShowDetail(false); openVipModal(selectedUser); }}
                >
                  <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>管理会员</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* VIP Modal */}
      {showVipModal && selectedUser && (
        <Modal visible={showVipModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>会员管理</Text>
                <TouchableOpacity onPress={() => setShowVipModal(false)}>
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.vipUserName}>{selectedUser.displayName || selectedUser.username}</Text>

                <Text style={styles.inputLabel}>会员等级</Text>
                <View style={styles.vipOptions}>
                  {['free', 'year', 'lifetime'].map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[styles.vipOption, vipEdit.level === level && styles.vipOptionSelected]}
                      onPress={() => setVipEdit((v) => ({ ...v, level }))}
                    >
                      <Text style={[styles.vipOptionText, vipEdit.level === level && styles.vipOptionTextSelected]}>
                        {level === 'free' ? '免费用户' : level === 'year' ? '👑 年费会员' : '👑 永久会员'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {vipEdit.level !== 'lifetime' && (
                  <>
                    <Text style={styles.inputLabel}>到期时间</Text>
                    <TextInput
                      style={styles.dateInput}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.textSecondary}
                      value={vipEdit.expiredAt}
                      onChangeText={(text) => setVipEdit((v) => ({ ...v, expiredAt: text }))}
                    />
                  </>
                )}
              </View>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.modalBtn} onPress={() => setShowVipModal(false)}>
                  <Text style={styles.modalBtnText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={() => {
                  // TODO: implement save
                  setShowVipModal(false);
                }}>
                  <Text style={[styles.modalBtnText, styles.modalBtnPrimaryText]}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      backgroundColor: theme.card,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    backBtn: {
      marginRight: spacing.sm,
    },
    title: {
      fontSize: fontSizes.xl,
      fontWeight: 'bold',
      color: theme.text,
      marginRight: spacing.sm,
    },
    subtitle: {
      fontSize: fontSizes.sm,
      color: theme.textSecondary,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      height: 40,
      backgroundColor: theme.background,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      color: theme.text,
      fontSize: fontSizes.sm,
    },
    searchBtn: {
      width: 40,
      height: 40,
      backgroundColor: '#3b82f6',
      borderRadius: borderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollView: {
      flex: 1,
    },
    emptyContainer: {
      padding: spacing.xl,
      alignItems: 'center',
    },
    emptyText: {
      color: theme.textSecondary,
      fontSize: fontSizes.md,
    },
    userCard: {
      backgroundColor: theme.card,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#3b82f6',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    avatarText: {
      color: '#fff',
      fontSize: fontSizes.lg,
      fontWeight: 'bold',
    },
    userInfo: {
      flex: 1,
    },
    userNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    userName: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.text,
    },
    adminBadge: {
      fontSize: fontSizes.xs,
      color: '#ef4444',
      backgroundColor: 'rgba(239,68,68,0.1)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    userEmail: {
      fontSize: fontSizes.sm,
      color: theme.textSecondary,
      marginTop: 2,
    },
    userDate: {
      fontSize: fontSizes.xs,
      color: theme.textSecondary,
      marginTop: 2,
    },
    userActions: {
      alignItems: 'flex-end',
      gap: spacing.xs,
    },
    badge: {
      fontSize: fontSizes.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    badgeYear: {
      backgroundColor: 'rgba(245,158,11,0.1)',
      color: '#f59e0b',
    },
    badgeLifetime: {
      backgroundColor: 'rgba(139,92,246,0.1)',
      color: '#8b5cf6',
    },
    freeBadge: {
      fontSize: fontSizes.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: 'rgba(107,114,128,0.1)',
      color: '#6b7280',
    },
    statusBadge: {
      fontSize: fontSizes.xs,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusActive: {
      backgroundColor: 'rgba(34,197,94,0.1)',
      color: '#22c55e',
    },
    statusInactive: {
      backgroundColor: 'rgba(239,68,68,0.1)',
      color: '#ef4444',
    },
    quickActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: spacing.sm,
    },
    actionBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.background,
    },
    actionBtnText: {
      fontSize: fontSizes.sm,
      color: '#3b82f6',
    },
    actionBtnVip: {
      backgroundColor: 'rgba(245,158,11,0.1)',
    },
    actionBtnVipText: {
      color: '#f59e0b',
    },
    pagination: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
    },
    pageBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: theme.card,
      borderRadius: borderRadius.md,
    },
    pageBtnDisabled: {
      opacity: 0.5,
    },
    pageBtnText: {
      fontSize: fontSizes.sm,
      color: '#3b82f6',
    },
    pageInfo: {
      fontSize: fontSizes.sm,
      color: theme.textSecondary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: 'bold',
      color: theme.text,
    },
    modalBody: {
      padding: spacing.md,
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    modalBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.background,
    },
    modalBtnText: {
      fontSize: fontSizes.sm,
      color: theme.text,
    },
    modalBtnPrimary: {
      backgroundColor: '#3b82f6',
    },
    modalBtnPrimaryText: {
      color: '#fff',
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    detailLabel: {
      fontSize: fontSizes.sm,
      color: theme.textSecondary,
    },
    detailValue: {
      fontSize: fontSizes.sm,
      color: theme.text,
      fontWeight: '500',
    },
    vipUserName: {
      fontSize: fontSizes.lg,
      fontWeight: 'bold',
      color: theme.text,
      marginBottom: spacing.md,
    },
    inputLabel: {
      fontSize: fontSizes.sm,
      color: theme.textSecondary,
      marginBottom: spacing.xs,
      marginTop: spacing.md,
    },
    vipOptions: {
      gap: spacing.sm,
    },
    vipOption: {
      padding: spacing.md,
      borderRadius: borderRadius.md,
      backgroundColor: theme.background,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    vipOptionSelected: {
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.05)',
    },
    vipOptionText: {
      fontSize: fontSizes.md,
      color: theme.text,
    },
    vipOptionTextSelected: {
      color: '#3b82f6',
      fontWeight: '600',
    },
    dateInput: {
      height: 44,
      backgroundColor: theme.background,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      color: theme.text,
      fontSize: fontSizes.md,
    },
  });
}

export default AdminUsersScreen;
