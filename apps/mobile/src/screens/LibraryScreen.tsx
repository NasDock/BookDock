import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Dimensions,
  Pressable,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { apiClient } from '../services/api';
import type { Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

const { width } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const ITEM_WIDTH = (width - spacing.md * 2 - spacing.sm * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

type SortOption = 'title' | 'author' | 'addedAt' | 'lastReadAt';
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
  { value: 'title', label: 'Title', icon: 'text' },
  { value: 'author', label: 'Author', icon: 'person' },
  { value: 'addedAt', label: 'Date Added', icon: 'calendar' },
  { value: 'lastReadAt', label: 'Recently Read', icon: 'time' },
];

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { books, localBooks, viewMode, setViewMode, setBooks, setLoading } = useLibraryStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('addedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showSortModal, setShowSortModal] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const filteredBooks = useMemo(() => {
    const query = localSearchQuery.toLowerCase();
    let result = query
      ? books.filter(
          (book) =>
            book.title.toLowerCase().includes(query) ||
            book.author.toLowerCase().includes(query)
        )
      : [...books];

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortOption) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'author':
          comparison = a.author.localeCompare(b.author);
          break;
        case 'addedAt':
          comparison = new Date(a.addedAt || 0).getTime() - new Date(b.addedAt || 0).getTime();
          break;
        case 'lastReadAt':
          comparison = new Date(a.lastReadAt || 0).getTime() - new Date(b.lastReadAt || 0).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [books, localSearchQuery, sortOption, sortOrder]);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('Reader', { book });
  }, [navigation]);

  const handleTTSPress = useCallback((book: Book) => {
    navigation.navigate('TTSScreen', { book });
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoading(true);
    try {
      const response = await apiClient.books.getBooks({ sort: sortOption, order: sortOrder });
      if (response.success && response.data) {
        setBooks(response.data.books);
      }
    } catch (error) {
      console.error('Failed to refresh library:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sortOption, sortOrder, setBooks, setLoading]);

  const handleSortChange = useCallback((option: SortOption) => {
    if (option === sortOption) {
      // Toggle order if same option
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortOption(option);
      setSortOrder('asc');
    }
    setShowSortModal(false);
  }, [sortOption]);

  const renderGridItem = useCallback(({ item }: { item: Book }) => {
    const localBook = localBooks.find((b) => b.id === item.id);
    const isDownloaded = !!localBook?.isDownloaded;

    return (
      <Pressable
        style={styles.gridItem}
        onPress={() => handleBookPress(item)}
        android_ripple={{ color: theme.colors.primary + '40' }}
      >
        <View style={[styles.coverPlaceholder, { backgroundColor: theme.colors.surface }]}>
          {item.coverUrl ? (
            <View style={styles.coverImagePlaceholder} />
          ) : (
            <Text style={styles.coverInitial}>{item.title.charAt(0).toUpperCase()}</Text>
          )}
          {isDownloaded && (
            <View style={styles.downloadBadge}>
              <Ionicons name="cloud-done" size={12} color="#fff" />
            </View>
          )}
        </View>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.author}
        </Text>
        {item.readingProgress && item.readingProgress > 0 && (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${item.readingProgress}%`, backgroundColor: theme.colors.primary },
              ]}
            />
          </View>
        )}
      </Pressable>
    );
  }, [styles, theme, localBooks, handleBookPress]);

  const renderListItem = useCallback(({ item }: { item: Book }) => {
    const localBook = localBooks.find((b) => b.id === item.id);
    const isDownloaded = !!localBook?.isDownloaded;

    return (
      <Pressable
        style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
        onPress={() => handleBookPress(item)}
        android_ripple={{ color: theme.colors.primary + '40' }}
      >
        <View style={[styles.listCover, { backgroundColor: theme.colors.border }]}>
          <Text style={styles.coverInitial}>{item.title.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.listContent}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.listAuthor} numberOfLines={1}>
            {item.author}
          </Text>
          <View style={styles.listMeta}>
            <Text style={styles.listMetaText}>
              {item.fileType.toUpperCase()} • {formatFileSize(item.fileSize)}
            </Text>
            {isDownloaded && (
              <View style={styles.downloadBadge}>
                <Ionicons name="cloud-done" size={12} color={theme.colors.primary} />
              </View>
            )}
          </View>
          {item.readingProgress && item.readingProgress > 0 && (
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${item.readingProgress}%`, backgroundColor: theme.colors.primary },
                ]}
              />
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.ttsButton}
          onPress={() => handleTTSPress(item)}
        >
          <Ionicons name="headset" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </Pressable>
    );
  }, [styles, theme, localBooks, handleBookPress, handleTTSPress]);

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search books..."
          placeholderTextColor={theme.colors.textSecondary}
          value={localSearchQuery}
          onChangeText={setLocalSearchQuery}
        />
        {localSearchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setLocalSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
      {/* Sort Button */}
      <TouchableOpacity
        style={[styles.sortButton, { backgroundColor: theme.colors.surface }]}
        onPress={() => setShowSortModal(true)}
      >
        <Ionicons name="swap-vertical" size={18} color={theme.colors.primary} />
        <Text style={[styles.sortButtonText, { color: theme.colors.primary }]}>
          {SORT_OPTIONS.find((o) => o.value === sortOption)?.label || 'Sort'}
        </Text>
      </TouchableOpacity>
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'grid' && { backgroundColor: theme.colors.primary },
          ]}
          onPress={() => setViewMode('grid')}
        >
          <Ionicons
            name="grid"
            size={20}
            color={viewMode === 'grid' ? '#fff' : theme.colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'list' && { backgroundColor: theme.colors.primary },
          ]}
          onPress={() => setViewMode('list')}
        >
          <Ionicons
            name="list"
            size={20}
            color={viewMode === 'list' ? '#fff' : theme.colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSortModal = () => (
    <Modal
      visible={showSortModal}
      animationType="fade"
      transparent
      onRequestClose={() => setShowSortModal(false)}
    >
      <Pressable style={styles.sortModalOverlay} onPress={() => setShowSortModal(false)}>
        <View style={[styles.sortModalContent, { backgroundColor: theme.colors.surface }]}>
          <Text style={styles.sortModalTitle}>Sort By</Text>
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.sortOption,
                sortOption === option.value && { backgroundColor: theme.colors.primary + '20' },
              ]}
              onPress={() => handleSortChange(option.value)}
            >
              <View style={styles.sortOptionLeft}>
                <Ionicons
                  name={option.icon as any}
                  size={20}
                  color={sortOption === option.value ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.sortOptionText,
                    sortOption === option.value && { color: theme.colors.primary },
                  ]}
                >
                  {option.label}
                </Text>
              </View>
              {sortOption === option.value && (
                <Ionicons
                  name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                  size={18}
                  color={theme.colors.primary}
                />
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.sortModalClose, { borderTopColor: theme.colors.border }]}
            onPress={() => setShowSortModal(false)}
          >
            <Text style={styles.sortModalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={filteredBooks}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'grid' ? GRID_COLUMNS : 1}
        key={viewMode}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContentContainer}
        columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
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
            <Text style={styles.emptyText}>Your library is empty</Text>
            <Text style={styles.emptySubtext}>Add books from the web app</Text>
          </View>
        }
      />
      {renderSortModal()}
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

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      gap: spacing.sm,
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
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
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      gap: spacing.xs,
    },
    sortButtonText: {
      fontSize: fontSizes.xs,
      fontWeight: '500',
    },
    viewToggle: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    toggleButton: {
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surface,
    },
    sortModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sortModalContent: {
      width: '80%',
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
    },
    sortModalTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    sortOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    sortOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    sortOptionText: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    sortModalClose: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      alignItems: 'center',
    },
    sortModalCloseText: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
    },
    listContentContainer: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    gridRow: {
      gap: spacing.sm,
    },
    gridItem: {
      width: ITEM_WIDTH,
      marginBottom: spacing.md,
    },
    coverPlaceholder: {
      width: '100%',
      aspectRatio: 0.7,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    coverImagePlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.colors.border,
    },
    coverInitial: {
      fontSize: fontSizes.xxxl,
      fontWeight: 'bold',
      color: theme.colors.textSecondary,
    },
    downloadBadge: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.xs,
      backgroundColor: theme.colors.success,
      borderRadius: borderRadius.full,
      padding: spacing.xs,
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
    },
    progressContainer: {
      height: 3,
      backgroundColor: theme.colors.border,
      borderRadius: borderRadius.full,
      marginTop: spacing.xs,
      overflow: 'hidden',
    },
    progressBar: {
      height: '100%',
      borderRadius: borderRadius.full,
    },
    listItem: {
      flexDirection: 'row',
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.sm,
      alignItems: 'center',
    },
    listCover: {
      width: 60,
      height: 80,
      borderRadius: borderRadius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      flex: 1,
      marginLeft: spacing.md,
    },
    listTitle: {
      fontSize: fontSizes.md,
      fontWeight: '600',
      color: theme.colors.text,
    },
    listAuthor: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    listMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
      gap: spacing.sm,
    },
    listMetaText: {
      fontSize: fontSizes.xs,
      color: theme.colors.textSecondary,
    },
    ttsButton: {
      padding: spacing.md,
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
  });
}
