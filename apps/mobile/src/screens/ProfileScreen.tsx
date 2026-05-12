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
  const navigation = useNavigation();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { user, logout } = useAuthStore();
  const { books, localBooks } = useLibraryStore();

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Calculate stats from real data
  const totalBooks = books.length;
  const downloadedBooks = localBooks.filter((b) => b.isDownloaded).length;
  const totalReadingProgress = books.reduce((acc, book) => acc + (book.readingProgress || 0), 0);
  const avgProgress = totalBooks > 0 ? Math.round(totalReadingProgress / totalBooks) : 0;

  const stats: StatItem[] = [
    { label: 'Books', value: totalBooks, icon: 'library' },
    { label: 'Downloaded', value: downloadedBooks, icon: 'cloud-download' },
    { label: 'Avg Progress', value: `${avgProgress}%`, icon: 'trending-up' },
  ];

  const handleEditProfile = useCallback(() => {
    Alert.alert('Coming Soon', 'Profile editing will be available in a future update.');
  }, []);

  const handleManageSubscription = useCallback(() => {
    // @ts-ignore
    navigation.navigate('MemberLogin');
  }, [navigation]);

  const handleLogout = useCallback(() => {
    Alert.alert('Confirm', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
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
      Alert.alert('Error', 'Failed to refresh user data');
    }
  }, []);

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
          {user?.membership === 'premium' && (
            <View style={styles.premiumBadge}>
              <Ionicons name="star" size={12} color="#FFD700" />
            </View>
          )}
        </View>
        <Text style={styles.username}>{user?.username || 'User'}</Text>
        <Text style={styles.email}>{user?.email || 'No email'}</Text>
        <View style={styles.roleContainer}>
          <View style={[styles.roleBadge, { backgroundColor: theme.colors.primary + '20' }]}>
            <Text style={[styles.roleText, { color: theme.colors.primary }]}>
              {user?.role === 'admin' ? 'Admin' : user?.membership === 'premium' ? 'Premium' : 'Free'}
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
            name={user?.membership === 'premium' ? 'diamond' : 'diamond-outline'}
            size={24}
            color={user?.membership === 'premium' ? '#FFD700' : theme.colors.textSecondary}
          />
          <View style={styles.membershipInfo}>
            <Text style={styles.membershipTitle}>
              {user?.membership === 'premium' ? 'Premium Member' : 'Free Plan'}
            </Text>
            <Text style={styles.membershipSubtitle}>
              {user?.membership === 'premium'
                ? 'All features unlocked'
                : 'Upgrade for more features'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={[styles.actionsCard, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity style={styles.actionItem} onPress={handleRefreshUser}>
          <Ionicons name="refresh" size={20} color={theme.colors.primary} />
          <Text style={styles.actionText}>Refresh User Data</Text>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

        <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
          <Text style={[styles.actionText, { color: theme.colors.error }]}>Sign Out</Text>
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
    email: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
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
  });
}
