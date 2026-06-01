import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
import { getApiClient } from '@bookdock/api-client';
import type { Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CARD_WIDTH = 110;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const REC_GAP = 12;

function getRecColumns(screenWidth: number): number {
  if (screenWidth >= 700) return 5;
  if (screenWidth >= 500) return 4;
  return 3;
}

function getRecItemWidth(screenWidth: number): number {
  const columns = getRecColumns(screenWidth);
  return (screenWidth - spacing.md * 2 - REC_GAP * (columns - 1)) / columns;
}

export function RecommendScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { books, fetchBooks, isLoading } = useLibraryStore();
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [recommended, setRecommended] = useState<Book[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  const screenWidth = Dimensions.get('window').width;
  const recItemWidth = useMemo(() => getRecItemWidth(screenWidth), [screenWidth]);
  const recItemHeight = recItemWidth * 1.5;

  // 首次进入：优先展示缓存，后台静默刷新
  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded) {
        setHasLoaded(true);
        // 有缓存数据时后台刷新，无缓存时显示 loading
        if (books.length > 0) {
          fetchBooks().catch(() => {});
        } else {
          fetchBooks();
        }
      }
    }, [hasLoaded, books.length, fetchBooks])
  );

  // 获取推荐数据
  useEffect(() => {
    let cancelled = false;
    async function loadRecommendations() {
      setRecLoading(true);
      try {
        const api = getApiClient();
        const res = await api.getRecommendations(12);
        if (!cancelled && res.success && res.data) {
          setRecommended(res.data.books);
        }
      } catch (err) {
        console.error('Failed to load recommendations:', err);
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    }
    loadRecommendations();
    return () => { cancelled = true; };
  }, []);

  // 下拉刷新：强制从服务器获取并更新缓存
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchBooks();
      // 同时刷新推荐
      const api = getApiClient();
      const res = await api.getRecommendations(12);
      if (res.success && res.data) {
        setRecommended(res.data.books);
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchBooks]);

  const inProgress = useMemo(
    () =>
      books
        .filter((b) => (b.readingProgress ?? 0) > 0 && (b.readingProgress ?? 0) < 100)
        .sort((a, b) => (b.readingProgress || 0) - (a.readingProgress || 0)),
    [books]
  );

  const recentlyRead = useMemo(
    () =>
      books
        .filter((b) => b.lastReadAt)
        .sort((a, b) => new Date(b.lastReadAt!).getTime() - new Date(a.lastReadAt!).getTime())
        .slice(0, 5),
    [books]
  );

  const handleBookPress = (book: Book) => {
    navigation.navigate('BookDetails', { book });
  };

  const styles = useMemo(() => createStyles(theme, recItemWidth, recItemHeight), [theme, recItemWidth, recItemHeight]);

  // 首次无缓存数据时显示 loading
  if (isLoading && books.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const hasContent = inProgress.length > 0 || recentlyRead.length > 0 || recommended.length > 0;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {!hasContent ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>开始阅读书籍后，这里会显示你的阅读推荐</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Continue Reading */}
          {inProgress.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>继续阅读</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.cardRow}>
                  {inProgress.map((book) => (
                    <TouchableOpacity
                      key={book.id}
                      style={styles.card}
                      onPress={() => handleBookPress(book)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.coverContainer}>
                        {book.coverUrl ? (
                          <Image
                            source={{ uri: getCoverImageUrl(book.coverUrl) }}
                            style={styles.coverImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={getBookGradient(book.title) as [string, string]}
                            style={styles.coverImage}
                          >
                            <Text style={styles.coverLetter}>
                              {book.title.charAt(0)}
                            </Text>
                          </LinearGradient>
                        )}
                        {/* Progress bar */}
                        <View style={styles.progressBg}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${book.readingProgress || 0}%` },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {book.title}
                      </Text>
                      <Text style={styles.cardMeta}>已读 {book.readingProgress}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* 为你推荐 —— flexWrap 自动换行 */}
          {(recommended.length > 0 || recLoading) && (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, styles.sectionHeaderBetween]}>
                <Text style={styles.sectionTitle}>为你推荐</Text>
                <TouchableOpacity onPress={handleRefresh} disabled={recLoading}>
                  <Ionicons name="refresh" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
              {recLoading && recommended.length === 0 ? (
                <View style={styles.recRow}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <View key={i} style={[styles.recCard, { width: recItemWidth }]}>
                      <View style={[styles.recCover, { backgroundColor: theme.colors.surface }]}>
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.recRow}>
                  {recommended.map((book) => (
                    <TouchableOpacity
                      key={book.id}
                      style={[styles.recCard, { width: recItemWidth }]}
                      onPress={() => handleBookPress(book)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.recCover, { backgroundColor: theme.colors.surface }]}>
                        {book.coverUrl ? (
                          <Image
                            source={{ uri: getCoverImageUrl(book.coverUrl) }}
                            style={styles.recCoverImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={getBookGradient(book.title) as [string, string]}
                            style={styles.recCoverImage}
                          >
                            <Text style={styles.coverLetter}>
                              {book.title.charAt(0)}
                            </Text>
                          </LinearGradient>
                        )}
                      </View>
                      <Text style={styles.recCardTitle} numberOfLines={1}>
                        {book.title}
                      </Text>
                      <Text style={styles.recCardAuthor} numberOfLines={1}>
                        {book.author || '未知作者'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Recently Read */}
          {recentlyRead.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>最近阅读</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.cardRow}>
                  {recentlyRead.map((book) => (
                    <TouchableOpacity
                      key={book.id}
                      style={styles.card}
                      onPress={() => handleBookPress(book)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.coverContainer}>
                        {book.coverUrl ? (
                          <Image
                            source={{ uri: getCoverImageUrl(book.coverUrl) }}
                            style={styles.coverImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <LinearGradient
                            colors={getBookGradient(book.title) as [string, string]}
                            style={styles.coverImage}
                          >
                            <Text style={styles.coverLetter}>
                              {book.title.charAt(0)}
                            </Text>
                          </LinearGradient>
                        )}
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {book.title}
                      </Text>
                      <Text style={styles.cardMeta}>{formatDate(book.lastReadAt)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(
  theme: ReturnType<typeof getTheme>,
  recItemWidth: number,
  recItemHeight: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionHeaderBetween: {
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
    },
    // 为你推荐 - flexWrap 换行布局
    recRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.md,
      gap: REC_GAP,
    },
    recCard: {
      marginBottom: spacing.sm,
    },
    recCover: {
      width: recItemWidth,
      height: recItemHeight,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
    },
    recCoverImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    recCardTitle: {
      marginTop: spacing.xs,
      fontSize: fontSizes.sm,
      fontWeight: '500',
      color: theme.colors.text,
    },
    recCardAuthor: {
      marginTop: 2,
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
    },
    // 继续阅读 / 最近阅读 - 横向滚动
    cardRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    card: {
      width: CARD_WIDTH,
    },
    coverContainer: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    coverImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    coverLetter: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#fff',
    },
    progressBg: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: 'rgba(255,255,255,0.3)',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.colors.primary,
    },
    cardTitle: {
      marginTop: spacing.xs,
      fontSize: fontSizes.sm,
      fontWeight: '500',
      color: theme.colors.text,
    },
    cardMeta: {
      marginTop: 2,
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 120,
      paddingHorizontal: spacing.xl,
    },
    emptyText: {
      marginTop: spacing.md,
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
  });
}
