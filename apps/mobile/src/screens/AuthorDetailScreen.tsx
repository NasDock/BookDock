import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
import { getApiClient, type Book, type Author } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AuthorDetailRouteProp = RouteProp<RootStackParamList, 'AuthorDetail'>;

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

export function AuthorDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AuthorDetailRouteProp>();
  const { author: initialAuthor } = route.params;
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const [author, setAuthor] = useState<Author>(initialAuthor);
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const api = getApiClient();
        const [authorRes, booksRes] = await Promise.all([
          api.getAuthor(initialAuthor.id),
          api.getAuthorBooks(initialAuthor.id),
        ]);
        if (!cancelled) {
          if (authorRes.success && authorRes.data) {
            setAuthor(authorRes.data);
          }
          if (booksRes.success && booksRes.data) {
            setBooks(Array.isArray(booksRes.data) ? booksRes.data : []);
          } else {
            setBooks([]);
          }
        }
      } catch (err) {
        console.error('Failed to load author detail:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [initialAuthor.id]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('BookDetails', { book });
  }, [navigation]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingBottom: spacing.xl,
    },
    authorHeader: {
      alignItems: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    avatarText: {
      fontSize: 32,
      fontWeight: 'bold',
      color: '#fff',
    },
    authorName: {
      fontSize: fontSizes.xxl,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: spacing.xs,
    },
    authorMeta: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginBottom: spacing.xs,
    },
    bioSection: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.lg,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: theme.colors.surface,
    },
    bioTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.sm,
    },
    bioText: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
      lineHeight: 22,
    },
    sectionTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      color: theme.colors.text,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    bookGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.md,
      gap: 12,
    },
    bookCard: {
      width: 110,
    },
    bookCover: {
      width: 110,
      height: 165,
      borderRadius: borderRadius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
    },
    bookCoverImage: {
      width: '100%',
      height: '100%',
    },
    coverLetter: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#fff',
    },
    bookTitle: {
      marginTop: spacing.xs,
      fontSize: fontSizes.sm,
      fontWeight: '500',
      color: theme.colors.text,
    },
    emptyText: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: fontSizes.md,
      marginTop: spacing.xl,
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        {/* 作者信息 */}
        <View style={styles.authorHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {author.name?.charAt(0) || '?'}
            </Text>
          </View>
          <Text style={styles.authorName}>{author.name}</Text>
          {author.nationality && (
            <Text style={styles.authorMeta}>{author.nationality}</Text>
          )}
          {author.birthDate && (
            <Text style={styles.authorMeta}>
              {author.birthDate}
              {author.deathDate ? ` - ${author.deathDate}` : ''}
            </Text>
          )}
        </View>

        {/* 作者简介 */}
        {author.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.bioTitle}>作者简介</Text>
            <Text style={styles.bioText}>{author.bio}</Text>
          </View>
        )}

        {/* 书籍列表 */}
        <Text style={styles.sectionTitle}>
          作品 ({books.length})
        </Text>
        {books.length === 0 ? (
          <Text style={styles.emptyText}>暂无书籍</Text>
        ) : (
          <View style={styles.bookGrid}>
            {books.map((book) => (
              <TouchableOpacity
                key={book.id}
                style={styles.bookCard}
                onPress={() => handleBookPress(book)}
                activeOpacity={0.8}
              >
                <View style={styles.bookCover}>
                  {book.coverUrl ? (
                    <Image
                      source={{ uri: getCoverImageUrl(book.coverUrl) }}
                      style={styles.bookCoverImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={getBookGradient(book.title) as [string, string]}
                      style={styles.bookCoverImage}
                    >
                      <Text style={styles.coverLetter}>
                        {book.title.charAt(0)}
                      </Text>
                    </LinearGradient>
                  )}
                </View>
                <Text style={styles.bookTitle} numberOfLines={1}>
                  {book.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}
