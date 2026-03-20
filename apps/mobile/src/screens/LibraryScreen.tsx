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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLibraryStore, useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { Book } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';

const { width } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const ITEM_WIDTH = (width - spacing.md * 2 - spacing.sm * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function LibraryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { books, localBooks, viewMode, searchQuery, setViewMode, setSearchQuery } = useLibraryStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  const styles = useMemo(() => createStyles(theme), [theme]);

  const filteredBooks = useMemo(() => {
    const query = localSearchQuery.toLowerCase();
    if (!query) return books;
    return books.filter(
      (book) =>
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query)
    );
  }, [books, localSearchQuery]);

  const handleBookPress = useCallback((book: Book) => {
    navigation.navigate('Reader', { book });
  }, [navigation]);

  const handleTTSPress = useCallback((book: Book) => {
    navigation.navigate('TTSScreen', { book });
  }, [navigation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Simulate refresh
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

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
    viewToggle: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    toggleButton: {
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.surface,
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
