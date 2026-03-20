import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';

interface StatItem {
  label: string;
  value: string | number;
  icon: string;
}

export function ProfileScreen() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { user } = useAuthStore();
  const { books, localBooks } = useLibraryStore();

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Calculate stats
  const totalBooks = books.length;
  const downloadedBooks = localBooks.filter((b) => b.isDownloaded).length;
  const totalReadingProgress = books.reduce((acc, book) => acc + (book.readingProgress || 0), 0);
  const avgProgress = totalBooks > 0 ? Math.round(totalReadingProgress / totalBooks) : 0;

  const stats: StatItem[] = [
    { label: 'Total Books', value: totalBooks, icon: 'library' },
    { label: 'Downloaded', value: downloadedBooks, icon: 'cloud-download' },
    { label: 'Avg Progress', value: `${avgProgress}%`, icon: 'trending-up' },
  ];

  const handleEditProfile = useCallback(() => {
    Alert.alert('Edit Profile', 'Profile editing would open here.');
  }, []);

  const handleManageSubscription = useCallback(() => {
    Alert.alert(
      'Subscription',
      user?.membership === 'premium'
        ? 'You are a Premium member!'
        : 'Upgrade to Premium to unlock all features.'
    );
  }, [user]);

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
        <Text style={styles.username}>{user?.username || 'Guest User'}</Text>
        <Text style={styles.email}>{user?.email || 'Not signed in'}</Text>
        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
          <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Membership Card */}
      <TouchableOpacity
        style={[styles.membershipCard, { backgroundColor: theme.colors.surface }]}
        onPress={handleManageSubscription}
      >
        <View style={styles.membershipLeft}>
          <View style={[styles.membershipIcon, { backgroundColor: theme.colors.primary + '20' }]}>
            <Ionicons
              name={user?.membership === 'premium' ? 'diamond' : 'star-outline'}
              size={24}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.membershipInfo}>
            <Text style={styles.membershipTitle}>
              {user?.membership === 'premium' ? 'Premium Member' : 'Free Plan'}
            </Text>
            <Text style={styles.membershipSubtitle}>
              {user?.membership === 'premium'
                ? 'All features unlocked'
                : 'Upgrade for unlimited access'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>

      {/* Stats */}
      <View style={styles.statsContainer}>
        {stats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              styles.statItem,
              { backgroundColor: theme.colors.surface },
              index === stats.length - 1 && styles.statItemLast,
            ]}
          >
            <View style={[styles.statIcon, { backgroundColor: theme.colors.primary + '20' }]}>
              <Ionicons name={stat.icon as any} size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Storage Info */}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={styles.sectionTitle}>Storage</Text>
        <View style={styles.storageBar}>
          <View
            style={[
              styles.storageUsed,
              {
                width: `${Math.min(100, ((user?.storageUsed || 0) / (user?.storageLimit || 1000000000)) * 100)}%`,
                backgroundColor: theme.colors.primary,
              },
            ]}
          />
        </View>
        <View style={styles.storageInfo}>
          <Text style={styles.storageText}>
            {formatBytes(user?.storageUsed || 0)} used
          </Text>
          <Text style={styles.storageText}>
            {formatBytes(user?.storageLimit || 1000000000)} total
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={[styles.actionsContainer, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="cloud-upload" size={22} color="#10B981" />
            </View>
            <Text style={styles.actionText}>Import Book</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="download" size={22} color="#F59E0B" />
            </View>
            <Text style={styles.actionText}>Downloads</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: '#EF444420' }]}>
              <Ionicons name="time" size={22} color="#EF4444" />
            </View>
            <Text style={styles.actionText}>Reading History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: '#8B5CF620' }]}>
              <Ionicons name="bookmarks" size={22} color="#8B5CF6" />
            </View>
            <Text style={styles.actionText}>Collections</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.activityList, { backgroundColor: theme.colors.surface }]}>
          {books.filter((b) => b.lastReadAt).slice(0, 3).map((book) => (
            <View key={book.id} style={styles.activityItem}>
              <View style={[styles.activityIcon, { backgroundColor: theme.colors.border }]}>
                <Ionicons name="book" size={16} color={theme.colors.textSecondary} />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {book.title}
                </Text>
                <Text style={styles.activitySubtitle}>
                  {book.readingProgress}% complete • {formatTimeAgo(book.lastReadAt)}
                </Text>
              </View>
            </View>
          ))}
          {books.filter((b) => b.lastReadAt).length === 0 && (
            <View style={styles.emptyActivity}>
              <Ionicons name="time-outline" size={32} color={theme.colors.textSecondary} />
              <Text style={styles.emptyActivityText}>No recent activity</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xxl,
    },
    profileHeader: {
      alignItems: 'center',
      padding: spacing.xl,
      borderRadius: borderRadius.xl,
      marginBottom: spacing.md,
    },
    avatarContainer: {
      position: 'relative',
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#fff',
    },
    premiumBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: '#fff',
      borderRadius: 10,
      padding: 2,
    },
    username: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: spacing.md,
    },
    email: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.background,
    },
    editButtonText: {
      fontSize: fontSizes.sm,
      color: theme.colors.primary,
      fontWeight: '500',
    },
    membershipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.md,
    },
    membershipLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    membershipIcon: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    membershipInfo: {
      flex: 1,
    },
    membershipTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    membershipSubtitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    statsContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    statItemLast: {
      marginRight: 0,
    },
    statIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    statValue: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: theme.colors.text,
    },
    statLabel: {
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    section: {
      marginBottom: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.sm,
    },
    seeAllText: {
      fontSize: fontSizes.sm,
      color: theme.colors.primary,
    },
    storageBar: {
      height: 8,
      backgroundColor: theme.colors.border,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: spacing.sm,
    },
    storageUsed: {
      height: '100%',
      borderRadius: 4,
    },
    storageInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    storageText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    actionsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: spacing.sm,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    actionItem: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionText: {
      fontSize: fontSizes.sm,
      color: theme.colors.text,
      flex: 1,
    },
    activityList: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    activityIcon: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    activityContent: {
      flex: 1,
      marginLeft: spacing.md,
    },
    activityTitle: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    activitySubtitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    emptyActivity: {
      alignItems: 'center',
      padding: spacing.xl,
    },
    emptyActivityText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: spacing.sm,
    },
  });
}
