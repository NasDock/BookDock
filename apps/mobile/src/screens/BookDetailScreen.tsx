import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getCoverImageUrl } from '../services/api';
import { getApiClient, type Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type BookDetailRouteProp = RouteProp<RootStackParamList, 'BookDetails'>;

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

function parseMetadata(metadata: string | object | undefined | any) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_TABLET = SCREEN_WIDTH >= 700;

export function BookDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BookDetailRouteProp>();
  const { book: initialBook } = route.params;
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { isVip } = useAuthStore();

  const [book, setBook] = useState<Book>(initialBook);
  const [chapters, setChapters] = useState<{ title: string; index: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);

  const metadata = useMemo(() => parseMetadata((book as any).metadata), [(book as any).metadata]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  // 加载书籍详情和章节
  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      setIsLoading(true);
      try {
        const api = getApiClient();
        const [bookRes, chapterRes, favRes] = await Promise.all([
          api.getBook(book.id),
          api.getChapters(book.id),
          api.checkFavorite(book.id).catch(() => ({ success: false, data: { isFavorite: false } })),
        ]);
        if (!cancelled) {
          if (bookRes.success && bookRes.data) {
            setBook(bookRes.data);
          }
          if (chapterRes.success && chapterRes.data) {
            setChapters(chapterRes.data);
          }
          if (favRes.success && favRes.data) {
            setIsFavorite(favRes.data.isFavorite);
          }
        }
      } catch (err) {
        console.error('Failed to load book details:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadDetails();
    return () => { cancelled = true; };
  }, [book.id]);

  const handleRead = useCallback(() => {
    navigation.navigate('Reader', { book });
  }, [navigation, book]);

  const handleTTS = useCallback(async () => {
    if (!isVip) {
      Alert.alert('提示', '听书功能需要会员权限');
      return;
    }
    navigation.navigate('TTSScreen', { book });
  }, [navigation, book, isVip]);

  const handleToggleFavorite = useCallback(async () => {
    try {
      const api = getApiClient();
      if (isFavorite) {
        await api.removeFavorite(book.id);
        setIsFavorite(false);
      } else {
        await api.addFavorite(book.id);
        setIsFavorite(true);
      }
    } catch {
      Alert.alert('错误', '操作失败');
    }
  }, [book.id, isFavorite]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // 封面尺寸
  const coverWidth = IS_TABLET ? 200 : 160;
  const coverHeight = coverWidth * 1.5;

  // 渲染封面
  const renderCover = (width: number, height: number) => (
    <View style={[styles.coverContainer, { width, height }]}>
      {book.coverUrl ? (
        <Image
          source={{ uri: getCoverImageUrl(book.coverUrl) }}
          style={{ width, height }}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={getBookGradient(book.title) as [string, string]}
          style={{ width, height, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={[styles.coverLetter, { fontSize: width * 0.3 }]}>
            {book.title.charAt(0)}
          </Text>
        </LinearGradient>
      )}
    </View>
  );

  // 渲染信息行
  const renderInfoRow = (label: string, value?: string | number) => {
    if (!value) return null;
    return (
      <Text style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>{label}：</Text>
        <Text style={[styles.infoValue, { color: theme.colors.text }]}>{value}</Text>
      </Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleToggleFavorite} style={styles.headerButton}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={isFavorite ? theme.colors.error : theme.colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 书籍基本信息 */}
        <View style={[styles.bookInfoSection, IS_TABLET && styles.bookInfoSectionTablet]}>
          {/* 封面 */}
          {IS_TABLET ? (
            <View style={styles.coverWrapper}>{renderCover(coverWidth, coverHeight)}</View>
          ) : (
            <View style={styles.coverWrapperCenter}>{renderCover(coverWidth, coverHeight)}</View>
          )}

          {/* 信息区 */}
          <View style={[styles.infoSection, IS_TABLET && styles.infoSectionTablet]}>
            <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>
              {book.title}
            </Text>

            {book.author && (
              <TouchableOpacity style={styles.authorRow}>
                <Text style={[styles.authorText, { color: theme.colors.primary }]}>
                  {book.author}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
              </TouchableOpacity>
            )}

            {/* 书籍信息 */}
            <View style={styles.bookMetaList}>
              {metadata.tags && metadata.tags.length > 0 && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>标签</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{metadata.tags.join('、')}</Text>
                </View>
              )}
              {metadata.category && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>分类</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                    {Array.isArray(metadata.category) ? metadata.category.join(' > ') : metadata.category}
                  </Text>
                </View>
              )}
              {metadata.series && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>丛书</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{metadata.series}</Text>
                </View>
              )}
              {book.publisher && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>出版社</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{book.publisher}</Text>
                </View>
              )}
              {((book as any).publishedDate || metadata.publishedDate || metadata.published || metadata.pub_date) && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>出版日期</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                    {(() => {
                      const date = (book as any).publishedDate || metadata.publishedDate || metadata.published || metadata.pub_date;
                      if (typeof date === 'string') return date;
                      if (date instanceof Date) return date.toISOString().split('T')[0];
                      return String(date);
                    })()}
                  </Text>
                </View>
              )}
              {(book.totalPages || metadata.pages) && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>页数</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                    {book.totalPages || metadata.pages} 页
                  </Text>
                </View>
              )}
              {book.isbn && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>ISBN</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{book.isbn}</Text>
                </View>
              )}
              {book.language && book.language !== 'zh' && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>语言</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{book.language}</Text>
                </View>
              )}
              {book.format && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>格式</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{book.format.toUpperCase()}</Text>
                </View>
              )}
              {metadata.rating && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>豆瓣评分</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.warning }]}>★ {metadata.rating}</Text>
                </View>
              )}
              {book.fileSize && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>文件大小</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>
                    {(book.fileSize / 1024 / 1024).toFixed(1)} MB
                  </Text>
                </View>
              )}
            </View>

            {/* 操作按钮 */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.readButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleRead}
              >
                <Ionicons name="book-outline" size={18} color="#fff" />
                <Text style={styles.readButtonText}>阅读</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ttsButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                onPress={handleTTS}
              >
                <Ionicons name="headset-outline" size={18} color={theme.colors.text} />
                <Text style={[styles.ttsButtonText, { color: theme.colors.text }]}>听书</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 阅读进度 */}
        {(book.readingProgress !== undefined && book.readingProgress > 0) && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>阅读进度</Text>
              <TouchableOpacity
                style={[styles.continueButton, { borderColor: theme.colors.primary }]}
                onPress={handleRead}
              >
                <Text style={[styles.continueButtonText, { color: theme.colors.primary }]}>
                  继续阅读
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.progressRow}>
              <Text style={[styles.progressPercent, { color: theme.colors.primary }]}>
                {Math.round(book.readingProgress)}%
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${book.readingProgress}%`, backgroundColor: theme.colors.primary },
                ]}
              />
            </View>
            {book.currentPage !== undefined && (
              <Text style={[styles.progressMeta, { color: theme.colors.textSecondary }]}>
                上次阅读到：第 {book.currentPage} 页
              </Text>
            )}
          </View>
        )}

        {/* 内容简介 */}
        {(book.description || metadata.summary) && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>内容简介</Text>
            <Text
              style={[styles.descriptionText, { color: theme.colors.text }]}
              numberOfLines={descExpanded ? undefined : 5}
            >
              {book.description || metadata.summary}
            </Text>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setDescExpanded(!descExpanded)}
            >
              <Text style={[styles.expandText, { color: theme.colors.primary }]}>
                {descExpanded ? '收起' : '展开'}
              </Text>
              <Ionicons
                name={descExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* 作者简介 */}
        {metadata.authorIntro && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>作者简介</Text>
            <View style={styles.authorIntroRow}>
              <View style={[styles.authorAvatar, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.authorAvatarText}>
                  {book.author?.charAt(0) || '?'}
                </Text>
              </View>
              <View style={styles.authorIntroContent}>
                <Text style={[styles.authorIntroName, { color: theme.colors.text }]}>
                  {book.author}
                </Text>
                <Text
                  style={[styles.authorIntroText, { color: theme.colors.textSecondary }]}
                  numberOfLines={3}
                >
                  {metadata.authorIntro}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 目录 */}
        {chapters.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.chapterHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>目录</Text>
              <Text style={[styles.chapterCount, { color: theme.colors.textSecondary }]}>
                共 {chapters.length} 章
              </Text>
            </View>
            {(showAllChapters ? chapters : chapters.slice(0, 5)).map((chapter, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.chapterItem}
                onPress={() => navigation.navigate('Reader', { book })}
              >
                <Text style={[styles.chapterIndex, { color: theme.colors.textSecondary }]}>
                  {idx + 1}.
                </Text>
                <Text style={[styles.chapterTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {chapter.title}
                </Text>
                {idx < (book.currentPage || 0) && (
                  <Text style={[styles.chapterRead, { color: theme.colors.success }]}>已读</Text>
                )}
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ))}
            {chapters.length > 5 && (
              <TouchableOpacity
                style={styles.viewAllChapters}
                onPress={() => setShowAllChapters(!showAllChapters)}
              >
                <Text style={[styles.viewAllText, { color: theme.colors.primary }]}>
                  {showAllChapters ? '收起目录' : '查看全部目录'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    // 书籍信息区
    bookInfoSection: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: spacing.lg,
    },
    bookInfoSectionTablet: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xl,
    },
    coverWrapper: {
      alignSelf: 'center',
    },
    coverWrapperCenter: {
      alignSelf: 'center',
    },
    coverContainer: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    coverLetter: {
      fontWeight: 'bold',
      color: '#fff',
    },
    infoSection: {
      gap: spacing.sm,
    },
    infoSectionTablet: {
      flex: 1,
      gap: spacing.md,
    },
    bookTitle: {
      fontSize: fontSizes.xxl,
      fontWeight: '700',
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    authorText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    infoList: {
      gap: 4,
      marginTop: spacing.sm,
    },
    infoRow: {
      fontSize: fontSizes.sm,
      lineHeight: 22,
    },
    infoLabel: {
      fontSize: fontSizes.sm,
    },
    infoValue: {
      fontSize: fontSizes.sm,
    },
    actionButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    readButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.md,
      flex: 1,
    },
    readButtonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    ttsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      flex: 1,
    },
    ttsButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    // 卡片
    card: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    cardTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
    },
    // 阅读进度
    progressHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    progressRow: {
      marginTop: spacing.sm,
    },
    progressPercent: {
      fontSize: fontSizes.xxxl,
      fontWeight: '700',
    },
    progressBarBg: {
      height: 4,
      backgroundColor: theme.colors.border,
      borderRadius: borderRadius.full,
      marginTop: spacing.sm,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: borderRadius.full,
    },
    progressMeta: {
      fontSize: fontSizes.sm,
      marginTop: spacing.xs,
    },
    continueButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },
    continueButtonText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    // 内容简介
    descriptionText: {
      fontSize: fontSizes.md,
      lineHeight: 24,
    },
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 2,
      marginTop: spacing.xs,
    },
    expandText: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
    },
    // 作者简介
    authorIntroRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    authorAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    authorAvatarText: {
      fontSize: fontSizes.xl,
      fontWeight: 'bold',
      color: '#fff',
    },
    authorIntroContent: {
      flex: 1,
      gap: 2,
    },
    authorIntroName: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    authorIntroText: {
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    // 目录
    chapterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    chapterCount: {
      fontSize: fontSizes.sm,
    },
    chapterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    chapterIndex: {
      fontSize: fontSizes.sm,
      width: 28,
    },
    chapterTitle: {
      flex: 1,
      fontSize: fontSizes.md,
    },
    chapterRead: {
      fontSize: fontSizes.xs,
      marginRight: spacing.xs,
    },
    viewAllChapters: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    viewAllText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    // 书籍信息
    bookMetaList: {
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    metaLabel: {
      fontSize: fontSizes.sm,
      width: 72,
      flexShrink: 0,
      lineHeight: 20,
    },
    metaValue: {
      fontSize: fontSizes.sm,
      flex: 1,
      lineHeight: 20,
    },
  });
}
