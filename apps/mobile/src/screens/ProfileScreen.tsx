import { useCallback, useMemo, useState, useLayoutEffect, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore, useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient, type Book, type Collection } from '@bookdock/api-client';
import { getCoverImageUrl } from '../services/api';

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

type TabKey = 'collections' | 'reading' | 'favorites' | 'downloads';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { user, logout, isVip } = useAuthStore();
  const { books, localBooks } = useLibraryStore();

  const [activeTab, setActiveTab] = useState<TabKey>('collections');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [favorites, setFavorites] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const styles = useMemo(() => createStyles(theme), [theme]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getApiClient();
      const [colRes, favRes] = await Promise.all([
        api.getCollections(),
        api.getFavorites(),
      ]);
      if (colRes.success && colRes.data) setCollections(colRes.data);
      if (favRes.success && favRes.data) setFavorites(favRes.data);
    } catch (err) {
      console.error('Failed to fetch profile data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const inProgressBooks = useMemo(
    () => books.filter((b) => (b.readingProgress ?? 0) > 0 && (b.readingProgress ?? 0) < 100),
    [books]
  );

  const downloadedBooks = useMemo(
    () => localBooks.filter((b) => b.isDownloaded),
    [localBooks]
  );

  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) {
      Alert.alert('提示', '请输入书单名称');
      return;
    }
    try {
      const api = getApiClient();
      await api.createCollection({ name: newCollectionName.trim() });
      setNewCollectionName('');
      setShowCreateModal(false);
      fetchData();
    } catch {
      Alert.alert('错误', '创建书单失败');
    }
  }, [newCollectionName, fetchData]);

  const handleSync = useCallback(async (type: 'full' | 'incremental') => {
    const title = type === 'full' ? '全量更新' : '增量更新';
    Alert.alert(title, type === 'full' ? '扫描所有本地书籍...' : '仅扫描新数据...', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: async () => {
          setSyncing(type);
          try {
            const api = getApiClient();
            const res = await api.syncBooks(type);
            Alert.alert('同步完成', res.data?.message || '更新成功');
          } catch (e: any) {
            Alert.alert('同步失败', e?.response?.data?.message || '请求失败');
          } finally {
            setSyncing(null);
            setMenuVisible(false);
          }
        },
      },
    ]);
  }, []);



  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
          <TouchableOpacity
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setMenuVisible(true)}
          >
            <Ionicons name="add" size={26} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
          <TouchableOpacity
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => navigation.navigate('ScanLogin')}
          >
            <Ionicons name="qr-code-outline" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, theme]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'collections', label: '书单' },
    { key: 'reading', label: '在读' },
    { key: 'favorites', label: '收藏' },
    { key: 'downloads', label: '下载' },
  ];

  const renderBookCard = (book: Book) => (
    <TouchableOpacity
      key={book.id}
      style={[styles.bookCard, { backgroundColor: theme.colors.surface }]}
      onPress={() => navigation.navigate('BookDetails', { book })}
      activeOpacity={0.8}
    >
      <View style={styles.coverContainer}>
        {book.coverUrl ? (
          <Image source={{ uri: getCoverImageUrl(book.coverUrl) }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <LinearGradient colors={getBookGradient(book.title) as [string, string]} style={styles.coverImage}>
            <Text style={styles.coverLetter}>{book.title.charAt(0)}</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.bookInfo}>
        <Text style={[styles.bookTitle, { color: theme.colors.text }]} numberOfLines={2}>{book.title}</Text>
        <Text style={[styles.bookAuthor, { color: theme.colors.textSecondary }]}>{book.author || '未知作者'}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    switch (activeTab) {
      case 'collections':
        return (
          <View style={styles.listContainer}>
            {collections.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>暂无书单</Text>
            ) : (
              collections.map((col) => (
                <TouchableOpacity
                  key={col.id}
                  style={[styles.collectionCard, { backgroundColor: theme.colors.surface }]}
                  onPress={() => navigation.navigate('CollectionDetail', { collectionId: col.id })}
                  activeOpacity={0.8}
                >
                  <Ionicons name="folder-open-outline" size={32} color={theme.colors.primary} />
                  <View style={styles.collectionInfo}>
                    <Text style={[styles.collectionName, { color: theme.colors.text }]} numberOfLines={1}>{col.name}</Text>
                    <Text style={[styles.collectionMeta, { color: theme.colors.textSecondary }]}>{col.bookCount} 本书</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      case 'reading':
        return (
          <View style={styles.listContainer}>
            {inProgressBooks.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>暂无在读书籍</Text>
            ) : (
              inProgressBooks.map(renderBookCard)
            )}
          </View>
        );
      case 'favorites':
        return (
          <View style={styles.listContainer}>
            {favorites.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>暂无收藏</Text>
            ) : (
              favorites.map(renderBookCard)
            )}
          </View>
        );
      case 'downloads':
        return (
          <View style={styles.listContainer}>
            {downloadedBooks.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>暂无下载</Text>
            ) : (
              downloadedBooks.map((b) => renderBookCard(b as unknown as Book))
            )}
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <View style={[styles.profileHeader, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.avatarText}>{user?.username?.charAt(0).toUpperCase() || 'U'}</Text>
          </View>
          <View style={styles.usernameRow}>
            <Text style={styles.username}>{user?.username || '用户'}</Text>
            <TouchableOpacity onPress={() => {}}>
              <Ionicons name={isVip ? 'diamond' : 'diamond-outline'} size={20} color={isVip ? '#FFD700' : theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabBar, { backgroundColor: theme.colors.surface }]}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && { borderBottomColor: theme.colors.primary }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab.key ? theme.colors.primary : theme.colors.textSecondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {renderContent()}


      </ScrollView>

      {/* Add Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setShowCreateModal(true); }}>
              <Ionicons name="folder-open-outline" size={18} color={theme.colors.text} />
              <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>新建书单</Text>
            </TouchableOpacity>
            {user?.role === 'admin' && (
              <>
                <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: spacing.md }} />
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); navigation.navigate('AdminUsers'); }}>
                  <Ionicons name="people-outline" size={18} color={theme.colors.text} />
                  <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>用户管理</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => handleSync('incremental')} disabled={!!syncing}>
                  <Ionicons name="add-circle-outline" size={18} color={theme.colors.text} />
                  <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>增量更新</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => handleSync('full')} disabled={!!syncing}>
                  <Ionicons name="refresh-circle-outline" size={18} color={theme.colors.text} />
                  <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>全量更新</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Create Collection Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>新建书单</Text>
            <TextInput
              style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="书单名称"
              placeholderTextColor={theme.colors.textSecondary}
              value={newCollectionName}
              onChangeText={setNewCollectionName}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.colors.border }]} onPress={() => setShowCreateModal(false)}>
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.colors.primary }]} onPress={handleCreateCollection}>
                <Text style={{ color: '#fff' }}>创建</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    profileHeader: {
      alignItems: 'center',
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
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
    usernameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    username: {
      fontSize: fontSizes.xl,
      fontWeight: '700',
      color: theme.colors.text,
    },
    tabBar: {
      flexDirection: 'row',
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    listContainer: {
      gap: spacing.sm,
    },
    collectionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      gap: spacing.sm,
    },
    collectionInfo: {
      flex: 1,
    },
    collectionName: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    collectionMeta: {
      fontSize: fontSizes.sm,
      marginTop: 2,
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
    emptyText: {
      textAlign: 'center',
      padding: spacing.xl,
      fontSize: fontSizes.md,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    logoutText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    menu: {
      position: 'absolute',
      top: 60,
      left: 16,
      width: 180,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    modalContent: {
      width: '80%',
      padding: spacing.lg,
      borderRadius: borderRadius.lg,
      gap: spacing.md,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      textAlign: 'center',
    },
    input: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: fontSizes.md,
    },
    modalButton: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
  });
}
