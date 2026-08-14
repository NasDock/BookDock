/**
 * CollectionDetailScreen — mobile2 (1:1 移植自 mobile CollectionDetailScreen.tsx)
 *
 * 适配点（mobile → mobile2）:
 *   1. @expo/vector-icons → react-native-vector-icons/Ionicons
 *   2. expo-linear-gradient → react-native-linear-gradient（API 几乎一致）
 *   3. default export → named export（对齐 mobile2 screens/index.ts 现有导出口径）
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
import { getApiClient, type Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CollectionDetailRouteProp = RouteProp<RootStackParamList, 'CollectionDetail'>;

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

export function CollectionDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CollectionDetailRouteProp>();
  const { collectionId } = route.params;
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const [collection, setCollection] = useState<{ name: string; description?: string; books: Book[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const fetchCollection = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getApiClient();
      const res = await api.getCollection(collectionId);
      if (res.success && res.data) {
        setCollection(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch collection:', err);
    } finally {
      setIsLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  const handleRemoveBook = useCallback(async (bookId: string) => {
    Alert.alert('确认', '从书单中移除这本书？', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          try {
            const api = getApiClient();
            await api.removeBookFromCollection(collectionId, bookId);
            fetchCollection();
          } catch {
            Alert.alert('错误', '移除失败');
          }
        },
      },
    ]);
  }, [collectionId, fetchCollection]);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('BookDetails', { book });
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!collection) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: theme.colors.textSecondary }}>书单不存在</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
          {collection.name}
        </Text>
        <View style={styles.backButton} />
      </View>

      {collection.description && (
        <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
          {collection.description}
        </Text>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {collection.books.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="book-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              书单暂无书籍
            </Text>
          </View>
        ) : (
          <View style={styles.bookList}>
            {collection.books.map((book) => (
              <TouchableOpacity
                key={book.id}
                style={[styles.bookCard, { backgroundColor: theme.colors.surface }]}
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
                      colors={getBookGradient(book.title)}
                      style={styles.coverImage}
                    >
                      <Text style={styles.coverLetter}>{book.title.charAt(0)}</Text>
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.bookInfo}>
                  <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>
                    {book.title}
                  </Text>
                  <Text style={[styles.bookAuthor, { color: theme.colors.textSecondary }]}>
                    {book.author || '未知作者'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveBook(book.id)}
                >
                  <Ionicons name="close-circle" size={24} color={theme.colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      // 对齐 StatsScreen 的 header paddingTop (xl + 8),文本离 status bar 远一点。
      paddingTop: spacing.xl + 8,
      paddingBottom: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      flex: 1,
      textAlign: 'center',
    },
    description: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      fontSize: fontSizes.sm,
    },
    content: {
      flex: 1,
    },
    bookList: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    bookCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.sm,
      borderRadius: borderRadius.md,
    },
    coverContainer: {
      width: 60,
      height: 90,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
    },
    coverImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    },
    coverLetter: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#fff',
    },
    bookInfo: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    bookTitle: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    bookAuthor: {
      fontSize: fontSizes.sm,
      marginTop: 2,
    },
    removeButton: {
      padding: spacing.xs,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 100,
    },
    emptyText: {
      marginTop: spacing.md,
      fontSize: fontSizes.md,
    },
  });
}