/**
 * BookDetailScreen — mobile2 (1:1 移植自 mobile BookDetailScreen.tsx)
 *
 * 适配点（mobile → mobile2）:
 *   1. @expo/vector-icons → react-native-vector-icons/Ionicons
 *   2. expo-linear-gradient → 纯色 <View> + 取 getBookGradient(title)[0]
 *      (纯色替代视觉差异:封面从双色渐变降级为单色 + 大字号首字)
 *   3. Screen 文件名跟 mobile 对齐: BookDetailsScreen → BookDetailScreen
 *      (route name 仍为 'BookDetails',跟 navigation/types.ts 一致)
 *
 * 其余逻辑（封面懒加载、章节列表、收藏/书单 modal、横竖屏布局、
 * 阅读进度条、笔记/作者跳转）跟 mobile 完全一致。
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { useOrientation } from '../hooks/useOrientation';
import { getCoverImageUrl } from '../services/api';
import { getApiClient, type Book, type Collection } from '@bookdock/api-client';
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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [addingCollectionId, setAddingCollectionId] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const titleRef = useRef<View>(null);

  const orientation = useOrientation();
  const isLandscape = orientation.isLandscape;

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

  const handleTTS = useCallback(() => {
    navigation.navigate('TTSScreen', { book });
  }, [navigation, book]);

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

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    // scroll handler
  }, []);

  const handleOpenCollectionModal = useCallback(async () => {
    try {
      const api = getApiClient();
      const res = await api.getCollections();
      if (res.success && res.data) {
        setCollections(res.data);
      }
      setShowCollectionModal(true);
    } catch {
      Alert.alert('错误', '获取书单失败');
    }
  }, []);

  const handleAddToCollection = useCallback(async (collectionId: string) => {
    setAddingCollectionId(collectionId);
    try {
      const api = getApiClient();
      const res = await api.addBookToCollection(collectionId, book.id);
      if (res.success) {
        Alert.alert('成功', '已添加到书单');
        setShowCollectionModal(false);
      } else {
        Alert.alert('提示', res.message || '添加失败');
      }
    } catch {
      Alert.alert('错误', '添加失败');
    } finally {
      setAddingCollectionId(null);
    }
  }, [book.id]);

  const handleCreateCollection = useCallback(async () => {
    const name = newCollectionName.trim();
    if (!name) {
      Alert.alert('提示', '请输入书单名称');
      return;
    }
    try {
      const api = getApiClient();
      const createRes = await api.createCollection({ name });
      if (createRes.success && createRes.data) {
        const addRes = await api.addBookToCollection(createRes.data.id, book.id);
        if (addRes.success) {
          Alert.alert('成功', '已创建书单并添加书籍');
          setShowCreateCollectionModal(false);
          setShowCollectionModal(false);
          setNewCollectionName('');
        } else {
          Alert.alert('提示', addRes.message || '添加失败');
        }
      } else {
        Alert.alert('提示', createRes.message || '创建失败');
      }
    } catch {
      Alert.alert('错误', '操作失败');
    }
  }, [newCollectionName, book.id]);

  // 封面尺寸
  const coverWidth = isLandscape ? 180 : 160;
  const coverHeight = coverWidth * 1.5;

  // 渲染封面（mobile 用 LinearGradient,mobile2 降级为纯色 View + 首字大字）
  const renderCover = (width: number, height: number) => (
    <View style={[styles.coverContainer, { width, height }]}>
      {book.coverUrl ? (
        <Image
          source={{ uri: getCoverImageUrl(book.coverUrl) }}
          style={{ width, height }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width,
            height,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: getBookGradient(book.title)[0],
          }}
        >
          <Text style={[styles.coverLetter, { fontSize: width * 0.3 }]}>
            {book.title.charAt(0)}
          </Text>
        </View>
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
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleBack} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {book.title}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowMoreMenu(true)} style={styles.headerButton}>
          <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={100}
      >
        {/* 书籍基本信息 */}
        <View style={[styles.bookInfoSection, isLandscape && styles.bookInfoSectionLandscape]}>
          {/* 封面 */}
          {isLandscape ? (
            <View style={styles.coverWrapper}>{renderCover(coverWidth, coverHeight)}</View>
          ) : (
            <View style={styles.coverWrapperCenter}>{renderCover(coverWidth, coverHeight)}</View>
          )}

          {/* 信息区 */}
          <View style={[styles.infoSection, isLandscape && styles.infoSectionLandscape]}>
            {/* 书籍信息 */}
            <View style={styles.bookMetaList}>
              {/* 作者 - 优先使用 authors 数组 */}
              {(book as any).authors?.length > 0 ? (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>作者</Text>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                    {(book as any).authors.map((a: any) => (
                      <TouchableOpacity
                        key={a.id}
                        onPress={() => navigation.navigate('AuthorDetail', { author: a })}
                      >
                        <Text style={[styles.metaValue, { color: theme.colors.primary }]}>
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : book.author ? (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>作者</Text>
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>{book.author}</Text>
                </View>
              ) : null}
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
                      if (date instanceof Date) return date.toISOString().split('T')[0];
                      if (typeof date === 'string') {
                        const d = new Date(date);
                        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                        return date;
                      }
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
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>信息源</Text>
                {metadata.doubanUrl ? (
                  <TouchableOpacity onPress={() => Linking.openURL(metadata.doubanUrl)}>
                    <Text style={[styles.metaValue, { color: theme.colors.primary }]}>豆瓣 ↗</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.metaValue, { color: theme.colors.text }]}>豆瓣</Text>
                )}
              </View>
            </View>

            {/* 操作按钮 */}
            <View style={[styles.actionButtons, !isLandscape && styles.actionButtonsPortrait]}>
              <TouchableOpacity
                style={[styles.readButton, { backgroundColor: theme.colors.primary }, !isLandscape && styles.readButtonPortrait]}
                onPress={handleRead}
              >
                <Ionicons name="book-outline" size={18} color="#fff" />
                <Text style={styles.readButtonText}>阅读</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ttsButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, !isLandscape && styles.ttsButtonPortrait]}
                onPress={handleTTS}
              >
                <Ionicons name="headset-outline" size={18} color={theme.colors.text} />
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

      {/* 添加到书单 Modal */}
      <Modal
        visible={showCollectionModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCollectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>添加到书单</Text>
              <TouchableOpacity onPress={() => setShowCollectionModal(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalList}>
              {collections.length === 0 ? (
                <Text style={[styles.modalEmpty, { color: theme.colors.textSecondary }]}>
                  暂无书单，点击下方创建
                </Text>
              ) : (
                collections.map((col) => (
                  <TouchableOpacity
                    key={col.id}
                    style={[styles.modalItem, { borderBottomColor: theme.colors.border }]}
                    onPress={() => handleAddToCollection(col.id)}
                    disabled={addingCollectionId === col.id}
                  >
                    <View style={styles.modalItemLeft}>
                      <Ionicons name="folder-open-outline" size={20} color={theme.colors.primary} />
                      <Text style={[styles.modalItemText, { color: theme.colors.text }]}>
                        {col.name}
                      </Text>
                    </View>
                    {addingCollectionId === col.id ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <Text style={[styles.modalItemCount, { color: theme.colors.textSecondary }]}>
                        {col.bookCount ?? 0} 本
                      </Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCreateBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                setShowCollectionModal(false);
                setShowCreateCollectionModal(true);
              }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.modalCreateBtnText}>新建书单</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 新建书单 Modal */}
      <Modal
        visible={showCreateCollectionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateCollectionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>新建书单</Text>
              <TouchableOpacity onPress={() => setShowCreateCollectionModal(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalInput, {
                color: theme.colors.text,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }]}
              placeholder="书单名称"
              placeholderTextColor={theme.colors.textSecondary}
              value={newCollectionName}
              onChangeText={setNewCollectionName}
              maxLength={50}
            />
            <TouchableOpacity
              style={[styles.modalCreateBtn, { backgroundColor: theme.colors.primary }]}
              onPress={handleCreateCollection}
            >
              <Text style={styles.modalCreateBtnText}>创建并添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 更多菜单 Modal */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableOpacity
          style={styles.moreMenuOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <View style={[styles.moreMenuContainer, { backgroundColor: theme.colors.background }]}>
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                handleToggleFavorite();
              }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={20}
                color={isFavorite ? theme.colors.error : theme.colors.text}
              />
              <Text style={[styles.moreMenuText, { color: theme.colors.text }]}>
                {isFavorite ? '取消收藏' : '收藏'}
              </Text>
            </TouchableOpacity>
            <View style={[styles.moreMenuDivider, { backgroundColor: theme.colors.border }]} />
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                navigation.navigate('Notes', { bookId: book.id });
              }}
            >
              <Ionicons name="document-text-outline" size={20} color={theme.colors.text} />
              <Text style={[styles.moreMenuText, { color: theme.colors.text }]}>查看笔记</Text>
            </TouchableOpacity>
            <View style={[styles.moreMenuDivider, { backgroundColor: theme.colors.border }]} />
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                handleOpenCollectionModal();
              }}
            >
              <Ionicons name="folder-open-outline" size={20} color={theme.colors.text} />
              <Text style={[styles.moreMenuText, { color: theme.colors.text }]}>添加到书单</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      flex: 1,
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
    bookInfoSectionLandscape: {
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
    infoSectionLandscape: {
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
    actionButtonsPortrait: {
      width: '100%',
    },
    readButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.md,
      width: 200,
    },
    readButtonPortrait: {
      flex: 1,
      width: undefined,
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
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
    },
    ttsButtonPortrait: {
      width: 48,
      paddingHorizontal: 0,
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
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
    },
    modalList: {
      maxHeight: 300,
    },
    modalEmpty: {
      textAlign: 'center',
      paddingVertical: spacing.xl,
      fontSize: fontSizes.md,
    },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
    },
    modalItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    modalItemText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    modalItemCount: {
      fontSize: fontSizes.sm,
    },
    modalCreateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      marginTop: spacing.md,
    },
    modalCreateBtnText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    modalInput: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSizes.md,
      marginVertical: spacing.md,
    },
    // 更多菜单
    moreMenuOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: 80,
      paddingRight: spacing.md,
    },
    moreMenuContainer: {
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm,
      minWidth: 180,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    moreMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    moreMenuText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    moreMenuDivider: {
      height: 1,
      marginHorizontal: spacing.lg,
    },
  });
}