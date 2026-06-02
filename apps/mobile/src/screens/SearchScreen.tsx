import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Keyboard,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
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

export function SearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { books, fetchBooks, isLoading } = useLibraryStore();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // 确保书籍数据已加载
  useEffect(() => {
    if (books.length === 0) {
      fetchBooks();
    }
  }, [books.length, fetchBooks]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return books.filter((book) => {
      const titleMatch = book.title?.toLowerCase().includes(q);
      const authorMatch = book.author?.toLowerCase().includes(q);
      // 简介匹配：尝试从 metadata 中解析
      let descMatch = false;
      try {
        const metadata = typeof (book as any).metadata === 'string' ? JSON.parse((book as any).metadata) : (book as any).metadata;
        const description = metadata?.description || metadata?.summary || metadata?.abstract || '';
        descMatch = description.toLowerCase().includes(q);
      } catch {
        // ignore metadata parse errors
      }
      return titleMatch || authorMatch || descMatch;
    });
  }, [query, books]);

  const handleSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearching(true);
    // 本地搜索是同步的，模拟一下延迟体验更好
    setTimeout(() => setSearching(false), 200);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setSearching(false);
  }, []);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('BookDetails', { book });
  }, [navigation]);

  const renderBookItem = useCallback(({ item }: { item: Book }) => {
    const hasCover = !!item.coverUrl;
    const [gradStart, gradEnd] = getBookGradient(item.title);

    // 尝试获取简介
    let description = '';
    try {
      const metadata = typeof (item as any).metadata === 'string' ? JSON.parse((item as any).metadata) : (item as any).metadata;
      description = metadata?.description || metadata?.summary || metadata?.abstract || '';
    } catch {
      // ignore
    }

    return (
      <TouchableOpacity
        style={[styles.bookItem, { borderBottomColor: theme.colors.border }]}
        onPress={() => handleBookPress(item)}
        activeOpacity={0.8}
      >
        {/* 封面 */}
        <View style={styles.coverWrapper}>
          {hasCover ? (
            <Image
              source={{ uri: getCoverImageUrl(item.coverUrl) }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[gradStart, gradEnd]}
              style={styles.coverImage}
            >
              <Text style={styles.coverLetter}>{item.title.charAt(0)}</Text>
            </LinearGradient>
          )}
        </View>

        {/* 信息 */}
        <View style={styles.infoWrapper}>
          <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.bookAuthor, { color: theme.colors.primary }]} numberOfLines={1}>
            {item.author || '未知作者'}
          </Text>
          {description ? (
            <Text style={[styles.bookDesc, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {description}
            </Text>
          ) : (
            <Text style={[styles.bookDesc, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {item.format?.toUpperCase() || ''} · {(item.totalPages || 0) > 0 ? `${item.totalPages}页` : ''}
            </Text>
          )}
        </View>

        {/* 箭头 */}
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    );
  }, [theme, handleBookPress]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const showEmpty = query.trim().length > 0 && results.length === 0 && !searching && !isLoading;
  const showResults = query.trim().length > 0 && results.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      {/* 搜索栏 */}
      <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.colors.text }]}
          placeholder="搜索书名、作者或简介..."
          placeholderTextColor={theme.colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* 结果列表 */}
      {isLoading && books.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : showResults ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderBookItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: theme.colors.textSecondary }]}>
              找到 {results.length} 本相关书籍
            </Text>
          }
        />
      ) : showEmpty ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            未找到匹配的书籍
          </Text>
          <Text style={[styles.emptySubText, { color: theme.colors.textSecondary }]}>
            试试其他关键词
          </Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="search" size={48} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
            输入关键词搜索书籍
          </Text>
          <Text style={[styles.emptySubText, { color: theme.colors.textSecondary }]}>
            支持书名、作者、简介搜索
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      gap: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: fontSizes.md,
      paddingVertical: 4,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    emptyText: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      marginTop: spacing.md,
    },
    emptySubText: {
      fontSize: fontSizes.md,
      marginTop: spacing.xs,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    resultCount: {
      fontSize: fontSizes.sm,
      paddingVertical: spacing.sm,
    },
    bookItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      gap: spacing.sm,
    },
    coverWrapper: {
      width: 56,
      height: 80,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
      flexShrink: 0,
    },
    coverImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    coverLetter: {
      fontSize: fontSizes.xl,
      fontWeight: 'bold',
      color: '#fff',
    },
    infoWrapper: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
    },
    bookTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    bookAuthor: {
      fontSize: fontSizes.sm,
    },
    bookDesc: {
      fontSize: fontSizes.sm,
      lineHeight: 18,
      marginTop: 2,
    },
  });
}
