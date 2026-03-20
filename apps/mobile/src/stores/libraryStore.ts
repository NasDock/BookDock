import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { Book } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';
import type { LocalBook, ReadingState } from '../types';

// Storage keys
const READING_PROGRESS_KEY = 'bookdock-reading-progress';

interface LibraryState {
  books: Book[];
  localBooks: LocalBook[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  currentPage: number;
  totalBooks: number;
  selectedBook: Book | null;
  viewMode: 'grid' | 'list';
  
  // Actions
  setBooks: (books: Book[]) => void;
  setLocalBooks: (books: LocalBook[]) => void;
  addLocalBook: (book: LocalBook) => void;
  removeLocalBook: (bookId: string) => void;
  setSelectedBook: (book: Book | null) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Reading progress
  getReadingProgress: (bookId: string) => ReaderPosition | null;
  saveReadingProgress: (bookId: string, position: ReaderPosition) => Promise<void>;
  
  // Local file management
  downloadBook: (book: Book) => Promise<string | null>;
  deleteLocalBook: (bookId: string) => Promise<void>;
  getLocalBookPath: (bookId: string) => string | null;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      localBooks: [],
      isLoading: false,
      error: null,
      searchQuery: '',
      currentPage: 1,
      totalBooks: 0,
      selectedBook: null,
      viewMode: 'grid',

      setBooks: (books) => set({ books }),
      
      setLocalBooks: (localBooks) => set({ localBooks }),

      addLocalBook: (book) => set((state) => {
        const exists = state.localBooks.find((b) => b.id === book.id);
        if (exists) {
          return { localBooks: state.localBooks.map((b) => b.id === book.id ? book : b) };
        }
        return { localBooks: [...state.localBooks, book] };
      }),

      removeLocalBook: (bookId) => set((state) => ({
        localBooks: state.localBooks.filter((b) => b.id !== bookId),
      })),

      setSelectedBook: (book) => set({ selectedBook: book }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setViewMode: (mode) => set({ viewMode: mode }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearError: () => set({ error: null }),

      getReadingProgress: (bookId) => {
        // Reading progress is stored in AsyncStorage, not in localBooks
        // This would need to call loadReadingProgress separately
        return null;
      },

      saveReadingProgress: async (bookId, position) => {
        try {
          const key = `${READING_PROGRESS_KEY}_${bookId}`;
          const progressData: ReadingState = {
            bookId,
            position,
            lastReadAt: new Date().toISOString(),
          };
          await AsyncStorage.setItem(key, JSON.stringify(progressData));
        } catch (error) {
          console.error('Failed to save reading progress:', error);
        }
      },

      downloadBook: async (book) => {
        try {
          const localPath = `${FileSystem.documentDirectory}books/${book.id}_${book.title}.${book.fileType}`;
          
          // Check if already downloaded
          const fileInfo = await FileSystem.getInfoAsync(localPath);
          if (fileInfo.exists) {
            return localPath;
          }

          // Create directory if not exists
          const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}books/`);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}books/`, {
              intermediates: true,
            });
          }

          // Note: In a real app, you'd download from your server
          // For now, we'll just return the path as if it was downloaded
          await FileSystem.writeAsStringAsync(localPath, '', {});
          
          const localBook: LocalBook = {
            ...book,
            localPath,
            isDownloaded: true,
            lastSyncedAt: new Date().toISOString(),
          };
          
          get().addLocalBook(localBook);
          return localPath;
        } catch (error) {
          console.error('Failed to download book:', error);
          return null;
        }
      },

      deleteLocalBook: async (bookId) => {
        try {
          const localBook = get().localBooks.find((b) => b.id === bookId);
          if (localBook?.localPath) {
            const fileInfo = await FileSystem.getInfoAsync(localBook.localPath);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(localBook.localPath);
            }
          }
          get().removeLocalBook(bookId);
        } catch (error) {
          console.error('Failed to delete local book:', error);
        }
      },

      getLocalBookPath: (bookId) => {
        const localBook = get().localBooks.find((b) => b.id === bookId);
        return localBook?.localPath || null;
      },
    }),
    {
      name: 'bookdock-library',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        localBooks: state.localBooks,
        viewMode: state.viewMode,
      }),
    }
  )
);

// Helper to load reading progress from AsyncStorage
export async function loadReadingProgress(bookId: string): Promise<ReadingState | null> {
  try {
    const key = `${READING_PROGRESS_KEY}_${bookId}`;
    const data = await AsyncStorage.getItem(key);
    if (data) {
      return JSON.parse(data) as ReadingState;
    }
    return null;
  } catch {
    return null;
  }
}
