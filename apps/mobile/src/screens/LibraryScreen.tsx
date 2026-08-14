import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { useOrientation } from '../hooks/useOrientation';
import { getCoverImageUrl } from '../services/api';
import type { Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

// Adaptive grid: phone = 2 columns, tablet = 3-4 columns based on width
const GAP = 12;

function getGridColumns(screenWidth: number): number {
  if (screenWidth >= 1200) return 8;
  if (screenWidth >= 900) return 7;
  if (screenWidth >= 700) return 6;
  if (screenWidth >= 500) return 4;
  return 3;
}

function getItemWidth(screenWidth: number): number {
  const columns = getGridColumns(screenWidth);
  return (screenWidth - spacing.md * 2 - GAP * (columns - 1)) / columns;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function SearchNavButton() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Search')}
      style={{ marginRight: 16 }}
    >
      <Ionicons name="search" size={22} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

const FORMATS = ['all', 'txt', 'epub', 'pdf', 'mobi'] as const;
const STATUSES = ['all', 'unread', 'reading', 'completed'] as const;

/**
 * getBookGradient — 1:1 复刻 mobile 旧版的封面渐变色选择逻辑。
 * mobile2 暂不引 react-native-linear-gradient(避免 native 依赖),
 * 用第一色作为纯色背景 + 标题首字母大字号覆盖。视觉接近,后续要恢复渐变再接。
 */
function getBookGradient(title: string): string[] {
  const gradients = [
    ['#3B82F6', '#6366F1'],
    ['#8B5CF6', '#A855F7'],
    ['#06B6D4', '#3B82F6'],
    ['#10B981', '#34D399'],
    ['#F59E0B', '#F97316'],
    ['#EF4444', '#F97316'],
    ['#EC4899', '#F43F5E'],
    ['#6366F1', '#8B5CF6'],
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function getStatusLabel(progress: number): string {
  if (progress === 0) return '未读';
  if (progress >= 100) return '已读完';
  return '在读';
}

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  // mobile2 的 useLibraryStore 第一版只暴露 fetchBooks / books / isLoading / error,
  // 暂未引 localBooks / downloadBook / deleteLocalBook（要 react-native-fs 离线下载管理）,
  // 这里只解构已有字段。后续要加离线下载管理再补。
  const {
    books,
    fetchBooks,
    isLoading,
    error,
  } = useLibraryStore();

  const [refreshing, setRefreshing] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showHeaderSearch, setShowHeaderSearch] = useState(false);
  const flatListRef = useRef<FlatList<Book>>(null);

  const orientation = useOrientation();
  const gridColumns = useMemo(() => getGridColumns(orientation.width), [orientation.width]);
  const itemWidth = useMemo(() => getItemWidth(orientation.width), [orientation.width]);

  const styles = useMemo(() => createStyles(theme, itemWidth), [theme, itemWidth]);

  useFocusEffect(
    useCallback(() => {
      fetchBooks();
    }, [fetchBooks])
  );

  const filteredBooks = useMemo(() => {
    let result = [...books];

    // Search
    const query = localSearchQuery.toLowerCase();
    if (query) {
      result = result.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          book.author.toLowerCase().includes(query)
      );
    }

    // Format filter
    if (filterFormat !== 'all') {
      result = result.filter((book) => book.fileType === filterFormat);
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter((book) => {
        const progress = book.readingProgress ?? 0;
        if (filterStatus === 'unread') return progress === 0;
        if (filterStatus === 'reading') return progress > 0 && progress < 100;
        if (filterStatus === 'completed') return progress >= 100;
        return true;
      });
    }

    return result;
  }, [books, localSearchQuery, filterFormat, filterStatus]);

  const stats = useMemo(() => {
    const total = books.length;
    const completed = books.filter((b) => (b.readingProgress ?? 0) >= 100).length;
    const reading = books.filter((b) => {
      const p = b.readingProgress ?? 0;
      return p > 0 && p < 100;
    }).length;
    const unread = total - completed - reading;
    return { total, completed, reading, unread };
  }, [books]);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('BookDetails', { book });
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBooks();
    setRefreshing(false);
  }, [fetchBooks]);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = event.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 400);
    setShowHeaderSearch(y > 60);
  }, []);

  // 同步 headerRight 搜索图标显示状态到导航栏
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => showHeaderSearch ? <SearchNavButton /> : null,
    });
  }, [showHeaderSearch, navigation]);

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderBookItem = useCallback(({ item }: { item: Book }) => {
    const progress = item.readingProgress ?? 0;
    const statusLabel = getStatusLabel(progress);
    const gradStart = getBookGradient(item.title)[0];
    const hasCover = !!item.coverUrl;

    return (
      <Pressable
        style={styles.gridItem}
        onPress={() => handleBookPress(item)}
        android_ripple={{ color: theme.colors.primary + '20' }}
      >
        {/* Cover */}
        <View style={styles.coverContainer}>
          {hasCover ? (
            <Image
              source={{ uri: getCoverImageUrl(item.coverUrl) }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.coverGradient, { backgroundColor: gradStart }]}>
              <Text style={styles.coverInitial}>{item.title.charAt(0)}</Text>
            </View>
          )}

          {/* Format badge */}
          <View style={styles.formatBadge}>
            <Text style={styles.formatBadgeText}>{(item.fileType || item.format || 'unknown').toUpperCase()}</Text>
          </View>

          {/* Progress bar at the bottom of cover if in progress */}
          {progress > 0 && progress < 100 && (
            <View style={styles.coverProgressBarContainer}>
              <View style={[styles.coverProgressBar, { width: `${progress}%` }]} />
            </View>
          )}
        </View>

        {/* Info */}
        <Text style={styles.bookTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>{item.author || '未知作者'}</Text>
        <View style={styles.bookMeta}>
          <Text style={styles.statusText}>{statusLabel}</Text>
          <Text style={styles.sizeText}>{formatFileSize(item.fileSize ?? 0)}</Text>
        </View>
      </Pressable>
    );
  }, [styles, theme, handleBookPress]);

  const handleSearchPress = useCallback(() => {
    navigation.navigate('Search');
  }, [navigation]);

  const renderHeader = () => (
    <View>
      {/* Search - 点击跳转到搜索页 */}
      <TouchableOpacity
        style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}
        onPress={handleSearchPress}
        activeOpacity={0.8}
      >
        <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
        <Text style={[styles.searchPlaceholder, { color: theme.colors.textSecondary }]}>
          搜索书名、作者或简介...
        </Text>
      </TouchableOpacity>

      {/* Format Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FORMATS.map((fmt) => (
          <TouchableOpacity
            key={fmt}
            style={[
              styles.filterChip,
              filterFormat === fmt && { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => setFilterFormat(fmt)}
          >
            <Text
              style={[
                styles.filterChipText,
                filterFormat === fmt && { color: '#fff' },
              ]}
            >
              {fmt === 'all' ? '全部' : fmt.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Status Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUSES.map((st) => (
          <TouchableOpacity
            key={st}
            style={[
              styles.filterChip,
              filterStatus === st && { backgroundColor: theme.colors.primary },
            ]}
            onPress={() => setFilterStatus(st)}
          >
            <Text
              style={[
                styles.filterChipText,
                filterStatus === st && { color: '#fff' },
              ]}
            >
              {st === 'all' ? '全部' : st === 'unread' ? '未读' : st === 'reading' ? '在读' : '已读完'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Count & Stats */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>共 {filteredBooks.length} 本书</Text>
        <Text style={styles.statsText}>
          {stats.unread} 未读 · {stats.completed} 已读完 · <Text style={{ color: theme.colors.primary }}>{stats.reading} 在读</Text>
        </Text>
      </View>
    </View>
  );

  if (isLoading && books.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ color: theme.colors.textSecondary, marginTop: spacing.md }}>Loading books...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        ref={flatListRef}
        data={filteredBooks}
        keyExtractor={(item) => item.id}
        numColumns={gridColumns}
        key={`grid-${gridColumns}`}
        renderItem={renderBookItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContentContainer}
        columnWrapperStyle={styles.gridRow}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="library-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{error || '书库为空'}</Text>
            <Text style={styles.emptySubtext}>下拉刷新</Text>
          </View>
        }
      />
      {showScrollTop && (
        <TouchableOpacity
          style={[styles.scrollTopButton, { backgroundColor: theme.colors.primary }]}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </TouchableOpacity>
      )}

    </View>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function createStyles(theme: ReturnType<typeof getTheme>, itemWidth: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    titleSection: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    statsText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    searchPlaceholder: {
      flex: 1,
      fontSize: fontSizes.md,
    },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
      gap: spacing.sm,
      alignItems: 'center',
    },
    filterChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      backgroundColor: theme.colors.surface,
    },
    filterChipText: {
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },
    countRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    countText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    listContentContainer: {
      paddingBottom: spacing.xl,
    },
    gridRow: {
      paddingHorizontal: spacing.md,
      gap: GAP,
    },
    gridItem: {
      width: itemWidth,
      marginBottom: spacing.md,
    },
    coverContainer: {
      width: '100%',
      aspectRatio: 0.75,
      borderRadius: borderRadius.lg,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      position: 'relative',
    },
    coverImage: {
      width: '100%',
      height: '100%',
      borderRadius: borderRadius.lg,
    },
    coverGradient: {
      flex: 1,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    coverInitial: {
      fontSize: fontSizes.xxxl,
      fontWeight: 'bold',
      color: '#fff',
      zIndex: 1,
    },
    formatBadge: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.25)',
      borderRadius: borderRadius.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    formatBadgeText: {
      fontSize: 10,
      color: '#fff',
      fontWeight: '600',
    },
    coverProgressBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      overflow: 'hidden',
    },
    coverProgressBar: {
      height: '100%',
      backgroundColor: theme.colors.primary,
    },
    bookTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: spacing.xs,
    },
    bookAuthor: {
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    bookMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: spacing.sm,
    },
    statusText: {
      fontSize: 11,
      color: theme.colors.textSecondary,
    },
    sizeText: {
      fontSize: 11,
      color: theme.colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 100,
    },
    emptyText: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: spacing.md,
    },
    emptySubtext: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      marginTop: spacing.xs,
    },
    scrollTopButton: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.xl,
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },

  });
}
