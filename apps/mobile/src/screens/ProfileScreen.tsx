import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
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
    // @ts-ignore
    navigation.navigate('MemberLogin');
  }, [navigation]);

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

  const handleRefreshUser = useCallback(async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getCurrentUser();
      if (response.success && response.data) {
        useAuthStore.getState().setUser(response.data);
      }
    } catch {
      Alert.alert('错误', '刷新用户数据失败');
    }
  }, []);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header with Settings button */}
      <View style={styles.headerRow}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Profile Header */}
      <View style={[styles.profileHeader, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.avatarText}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          {(user?.membership === 'premium' || isVip) && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={12} color="#FFD700" />
            </View>
          )}
        </View>
        <Text style={styles.username}>{user?.username || '用户'}</Text>
        <View style={styles.roleContainer}>
          <View style={[styles.roleBadge, { backgroundColor: theme.colors.primary + '20' }]}>
            <Text style={[styles.roleText, { color: theme.colors.primary }]}>
              {user?.role === 'admin' ? '管理员' : isVip ? (vipTier === 'LIFETIME' ? '永久会员' : '年卡会员') : user?.membership === 'premium' ? '高级会员' : '免费用户'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
          <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={styles.actionItem} onPress={handleRefreshUser}>
          <Ionicons name="refresh" size={20} color={theme.colors.primary} />
          <Text style={styles.actionText}>刷新用户数据</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

        <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={[styles.actionText, { color: theme.colors.error }]}>退出登录</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
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
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    headerTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
    },
    settingsButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
