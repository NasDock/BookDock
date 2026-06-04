import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { getApiClient, type Note } from '@bookdock/api-client';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type NotesRouteProp = RouteProp<RootStackParamList, 'Notes'>;

export function NotesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<NotesRouteProp>();
  const { bookId, author: routeAuthor } = route.params || {};
  
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchAuthor, setSearchAuthor] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const api = getApiClient();
      const params: { bookId?: string; author?: string } = {};
      if (bookId) params.bookId = bookId;
      if (routeAuthor) params.author = routeAuthor;
      
      const res = await api.getNotes(params);
      if (res.success && res.data) {
        setNotes(res.data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, routeAuthor]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotes();
    setRefreshing(false);
  }, [fetchNotes]);

  const handleDeleteNote = useCallback((noteId: string) => {
    Alert.alert('删除笔记', '确定要删除这条笔记吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(noteId);
          try {
            const api = getApiClient();
            await api.deleteNote(noteId);
            setNotes((prev) => prev.filter((n) => n.id !== noteId));
          } catch {
            Alert.alert('错误', '删除失败');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }, []);

  const handleNavigateToReader = useCallback((note: Note) => {
    navigation.navigate('Reader', {
      book: {
        id: note.bookId,
        title: note.bookTitle || '未知书籍',
        author: note.author || '',
      } as any,
    });
  }, [navigation]);

  const handleSearchByAuthor = useCallback(() => {
    if (!searchAuthor.trim()) {
      Alert.alert('提示', '请输入作者名称');
      return;
    }
    navigation.navigate('Notes', { author: searchAuthor.trim() });
    setShowSearchModal(false);
    setSearchAuthor('');
  }, [searchAuthor, navigation]);

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
        {bookId ? '书籍笔记' : routeAuthor ? `作者: ${routeAuthor}` : '全部笔记'}
      </Text>
      <TouchableOpacity onPress={() => setShowSearchModal(true)} style={styles.backButton}>
        <Ionicons name="search" size={22} color={theme.colors.text} />
      </TouchableOpacity>
    </View>
  );

  const renderNoteItem = (note: Note) => (
    <TouchableOpacity
      key={note.id}
      style={[styles.noteCard, { backgroundColor: theme.colors.surface }]}
      onPress={() => handleNavigateToReader(note)}
      activeOpacity={0.8}
    >
      {/* 书名和作者 */}
      <View style={styles.noteHeader}>
        <View style={styles.noteHeaderLeft}>
          <Ionicons name="book-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.noteBookTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {note.bookTitle || '未知书籍'}
          </Text>
        </View>
        <Text style={[styles.noteAuthor, { color: theme.colors.textSecondary }]}>
          {note.author || '未知作者'}
        </Text>
      </View>

      {/* 选中的文本 */}
      <View style={[styles.quoteBox, { backgroundColor: theme.colors.background, borderLeftColor: theme.colors.primary }]}>
        <Text style={[styles.quoteText, { color: theme.colors.text }]} numberOfLines={3}>
          {note.text}
        </Text>
      </View>

      {/* 笔记内容 */}
      {note.note && (
        <View style={styles.noteContentRow}>
          <Ionicons name="create-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={[styles.noteContent, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {note.note}
          </Text>
        </View>
      )}

      {/* 底部：时间和删除按钮 */}
      <View style={styles.noteFooter}>
        <Text style={[styles.noteDate, { color: theme.colors.textSecondary }]}>
          {new Date(note.createdAt).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        <TouchableOpacity
          onPress={() => handleDeleteNote(note.id)}
          disabled={deletingId === note.id}
          style={styles.deleteButton}
        >
          {deletingId === note.id ? (
            <ActivityIndicator size="small" color={theme.colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {renderHeader()}
      
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        {isLoading && notes.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : notes.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {bookId ? '这本书暂无笔记' : routeAuthor ? '该作者暂无笔记' : '暂无笔记'}
            </Text>
            <TouchableOpacity
              style={[styles.addNoteButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.addNoteButtonText}>去阅读添加笔记</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {notes.map(renderNoteItem)}
          </View>
        )}
      </ScrollView>

      {/* 搜索作者 Modal */}
      <Modal
        visible={showSearchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>按作者搜索</Text>
            <TextInput
              style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
              placeholder="输入作者名称"
              placeholderTextColor={theme.colors.textSecondary}
              value={searchAuthor}
              onChangeText={setSearchAuthor}
              onSubmitEditing={handleSearchByAuthor}
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.border }]}
                onPress={() => setShowSearchModal(false)}
              >
                <Text style={{ color: theme.colors.text }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleSearchByAuthor}
              >
                <Text style={{ color: '#fff' }}>搜索</Text>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xl,
      paddingBottom: spacing.sm,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      flex: 1,
      textAlign: 'center',
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    center: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl * 2,
      gap: spacing.md,
    },
    emptyText: {
      fontSize: fontSizes.md,
      textAlign: 'center',
    },
    addNoteButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md,
      marginTop: spacing.md,
    },
    addNoteButtonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    listContainer: {
      gap: spacing.md,
    },
    noteCard: {
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
    },
    noteHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    noteHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    noteBookTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      flex: 1,
    },
    noteAuthor: {
      fontSize: fontSizes.sm,
      marginLeft: spacing.sm,
    },
    quoteBox: {
      padding: spacing.sm,
      borderRadius: borderRadius.sm,
      borderLeftWidth: 3,
      marginTop: spacing.xs,
    },
    quoteText: {
      fontSize: fontSizes.sm,
      lineHeight: 22,
      fontStyle: 'italic',
    },
    noteContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    noteContent: {
      fontSize: fontSizes.sm,
      lineHeight: 20,
      flex: 1,
    },
    noteFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    noteDate: {
      fontSize: fontSizes.xs,
    },
    deleteButton: {
      padding: spacing.xs,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
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
    modalInput: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: fontSizes.md,
    },
    modalButtonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modalButton: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
  });
}
