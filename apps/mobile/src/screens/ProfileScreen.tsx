import { useCallback, useMemo, useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient } from '@bookdock/api-client';

interface StatItem {
  label: string;
  value: string | number;
  icon: string;
}

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { user, logout, isVip, vipTier } = useAuthStore();
  const { books, localBooks } = useLibraryStore();

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Calculate stats from real data
  const totalBooks = books.length;
  const downloadedBooks = localBooks.filter((b) => b.isDownloaded).length;
  const totalReadingProgress = books.reduce((acc, book) => acc + (book.readingProgress || 0), 0);
  const avgProgress = totalBooks > 0 ? Math.round(totalReadingProgress / totalBooks) : 0;

  const stats: StatItem[] = [
    { label: '书籍', value: totalBooks, icon: 'library' },
    { label: '已下载', value: downloadedBooks, icon: 'cloud-download' },
    { label: '平均进度', value: `${avgProgress}%`, icon: 'trending-up' },
  ];

  const handleEditProfile = useCallback(() => {
    Alert.alert('即将上线', '编辑资料功能将在后续版本开放');
  }, []);

  const handleManageSubscription = useCallback(() => {
    if (!user) {
      navigation.navigate('MemberLogin');
      return;
    }
    if (isVip) {
      navigation.navigate('MemberDetail');
      return;
    }
    navigation.navigate('MemberBenefits');
  }, [navigation, user, isVip]);

  const handleLogout = useCallback(() => {
    Alert.alert('确认', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出登录',
        style: 'destructive',
        onPress: async () => {
          try {
            const apiClient = getApiClient();
            await apiClient.logout();
          } catch {
            // Ignore logout errors
          }
          logout();
          // @ts-ignore
          navigation.replace('Login');
        },
      },
    ]);
  }, [logout, navigation]);

  // Header sync button state
  const [menuVisible, setMenuVisible] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSync = useCallback(async (type: 'full' | 'incremental') => {
    const title = type === 'full' ? '全量更新' : '增量更新';
    const message =
      type === 'full'
        ? '扫描所有本地书籍，新增数据库不存在的，标记已删除的，重新抓取所有现有书籍的元数据。'
        : '仅扫描新数据，现有数据不做处理。';

    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: async () => {
          setSyncing(type);
          try {
            const api = getApiClient();
            const res = await api.syncBooks(type);
            Alert.alert('同步完成', res.data?.message || `${type === 'full' ? '全量' : '增量'}更新成功`);
          } catch (e: any) {
            Alert.alert('同步失败', e?.response?.data?.message || '请求失败');
          } finally {
            setSyncing(null);
            setMenuVisible(false);
          }
        },
      },
    ]);
  }, []);

  // Configure header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
          {user?.role === 'admin' && (
            <TouchableOpacity
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => setMenuVisible(true)}
            >
              <Ionicons name="add" size={26} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => navigation.navigate('ScanLogin')}
          >
            <Ionicons name="scan-outline" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 16, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme, user?.role]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Profile Header */}
      <View style={[styles.profileHeader, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        </View>
        <Text style={styles.username}>{user?.username || '用户'}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        {stats.map((stat, index) => (
          <View key={index} style={[styles.statCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons name={stat.icon as any} size={24} color={theme.colors.primary} />
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Membership Card */}
      <TouchableOpacity
        style={[styles.membershipCard, { backgroundColor: theme.colors.surface }]}
        onPress={handleManageSubscription}
      >
        <View style={styles.membershipHeader}>
          <Ionicons
            name={(user?.membership === 'premium' || isVip) ? 'diamond' : 'diamond-outline'}
            size={24}
            color={(user?.membership === 'premium' || isVip) ? '#FFD700' : theme.colors.textSecondary}
          />
          <View style={styles.membershipInfo}>
            <Text style={styles.membershipTitle}>
              {isVip ? (vipTier === 'LIFETIME' ? '永久会员' : '年卡会员') : user?.membership === 'premium' ? '高级会员' : '免费用户'}
            </Text>
            <Text style={styles.membershipSubtitle}>
              {(user?.membership === 'premium' || isVip)
                ? '已解锁全部功能'
                : '升级解锁更多功能'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={[styles.actionsCard, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={[styles.actionText, { color: theme.colors.error }]}>退出登录</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Sync Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setMenuVisible(false)}>
          <View
            style={{
              position: 'absolute',
              top: 60,
              left: 16,
              width: 160,
              backgroundColor: theme.colors.surface,
              borderRadius: borderRadius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 5,
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.md,
                opacity: syncing ? 0.5 : 1,
              }}
              onPress={() => handleSync('incremental')}
              disabled={!!syncing}
            >
              {syncing === 'incremental' ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="add-circle-outline" size={18} color={theme.colors.text} />
              )}
              <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>增量更新</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: spacing.md }} />

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.md,
                opacity: syncing ? 0.5 : 1,
              }}
              onPress={() => handleSync('full')}
              disabled={!!syncing}
            >
              {syncing === 'full' ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="refresh-circle-outline" size={18} color={theme.colors.text} />
              )}
              <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>全量更新</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    profileHeader: {
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
    },
    avatarContainer: {
      position: 'relative',
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: fontSizes.xxxl,
      fontWeight: 'bold',
      color: '#fff',
    },
    premiumBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: theme.colors.surface,
      borderRadius: borderRadius.full,
      padding: spacing.xs,
      borderWidth: 2,
      borderColor: theme.colors.background,
    },
    username: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: spacing.md,
    },
    roleContainer: {
      marginTop: spacing.sm,
    },
    roleBadge: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.md,
    },
    roleText: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    editButtonText: {
      marginLeft: spacing.xs,
      fontSize: fontSizes.md,
      color: theme.colors.primary,
      fontWeight: '500',
    },
    statsContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    statCard: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    statValue: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: spacing.sm,
    },
    statLabel: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    membershipCard: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    membershipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    membershipInfo: {
      flex: 1,
      marginLeft: spacing.md,
    },
    membershipTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    membershipSubtitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    actionsCard: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    actionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
    },
    actionText: {
      flex: 1,
      marginLeft: spacing.md,
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    divider: {
      height: 1,
      marginHorizontal: spacing.md,
    },
    settingsButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
