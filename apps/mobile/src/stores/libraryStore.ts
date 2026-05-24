import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { Book } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';
import type { LocalBook, ReadingState } from '../types';
import { getApiClient } from '@bookdock/api-client';
import { useAuthStore } from './authStore';

// Storage keys
const READING_PROGRESS_KEY = 'bookdock-reading-progress';
const BOOKS_PAGE_SIZE = 100;

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

  // Server API
  fetchBooks: (params?: { page?: number; limit?: number; search?: string }) => Promise<void>;
  searchBooks: (query: string) => Promise<Book[]>;

  // Reading progress
  getReadingProgress: (bookId: string) => ReaderPosition | null;
  saveReadingProgress: (bookId: string, position: ReaderPosition) => Promise<void>;
  syncReadingProgress: (bookId: string) => Promise<void>;

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

      // Server API
      fetchBooks: async (params = {}) => {
        set({ isLoading: true, error: null });
        try {
          const apiClient = getApiClient();
          const request = {
            ...params,
            limit: params.limit ?? BOOKS_PAGE_SIZE,
            page: params.page ?? 1,
          };
          const response = await apiClient.getBooks(request);
          if (response.success && response.data) {
            const firstPage = response.data;
            let books = firstPage.books;

            if (!params.page && firstPage.totalPages > firstPage.page) {
              const remainingPages = Array.from(
                { length: firstPage.totalPages - firstPage.page },
                (_, index) => firstPage.page + index + 1,
              );
              const pageResponses = await Promise.all(
                remainingPages.map((nextPage) =>
                  apiClient.getBooks({ ...request, page: nextPage }),
                ),
              );

              books = [
                ...books,
                ...pageResponses.flatMap((pageResponse) =>
                  pageResponse.success && pageResponse.data
                    ? pageResponse.data.books
                    : [],
                ),
              ];
            }

            set({
              books,
              totalBooks: firstPage.total,
              currentPage: firstPage.page,
              isLoading: false,
            });
          } else {
            set({ error: response.error || 'Failed to load books', isLoading: false });
          }
        } catch (error) {
          set({ error: (error as Error).message || 'Network error', isLoading: false });
        }
      },

      searchBooks: async (query) => {
        try {
          const apiClient = getApiClient();
          const response = await apiClient.getBooks({ search: query, limit: BOOKS_PAGE_SIZE });
          if (response.success && response.data) {
            const firstPage = response.data;
            if (firstPage.totalPages <= firstPage.page) {
              return firstPage.books;
            }

            const pageResponses = await Promise.all(
              Array.from(
                { length: firstPage.totalPages - firstPage.page },
                (_, index) => firstPage.page + index + 1,
              ).map((page) => apiClient.getBooks({ search: query, limit: BOOKS_PAGE_SIZE, page })),
            );

            return [
              ...firstPage.books,
              ...pageResponses.flatMap((pageResponse) =>
                pageResponse.success && pageResponse.data
                  ? pageResponse.data.books
                  : [],
              ),
            ];
          }
          return [];
        } catch {
          return [];
        }
      },

      getReadingProgress: (_bookId) => {
        return null;
      },

      saveReadingProgress: async (bookId, position) => {
        try {
          const apiClient = getApiClient();
          await apiClient.updateReadingProgress(
            bookId,
            position.percentage,
            position.currentPage,
            position.scrollOffset
          );

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

      syncReadingProgress: async (bookId) => {
        try {
          const apiClient = getApiClient();
          const response = await apiClient.getReadingProgress(bookId);
          if (response.success && response.data) {
            const key = `${READING_PROGRESS_KEY}_${bookId}`;
            const progressData: ReadingState = {
              bookId,
              position: {
                percentage: response.data.progressPct,
                currentPage: response.data.currentChapter,
                scrollOffset: response.data.scrollOffset,
              },
              lastReadAt: new Date().toISOString(),
            };
            await AsyncStorage.setItem(key, JSON.stringify(progressData));
          }
        } catch (error) {
          console.error('Failed to sync reading progress:', error);
        }
      },

      downloadBook: async (book) => {
        try {
          const apiClient = getApiClient();
          const booksDir = `${FileSystem.documentDirectory}books/`;

          // Create directory
          const dirInfo = await FileSystem.getInfoAsync(booksDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(booksDir, { intermediates: true });
          }

          const localPath = `${booksDir}${book.id}_${book.title}.${book.fileType}`;

          // Check if already downloaded
          const fileInfo = await FileSystem.getInfoAsync(localPath);
          if (fileInfo.exists) {
            const localBook: LocalBook = {
              ...book,
              localPath,
              isDownloaded: true,
              lastSyncedAt: new Date().toISOString(),
            };
            get().addLocalBook(localBook);
            return localPath;
          }

          // Download from server via API
          const response = await fetch(
            `${apiClient.baseURL}/books/${book.id}/download`,
            {
              headers: {
                Authorization: `Bearer ${useAuthStore.getState().token || ''}`,
              },
            }
          );

          if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
          }

          const blob = await response.blob();
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = reader.result as string;
              resolve(base64.split(',')[1]);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(blob);
          const base64Data = await base64Promise;

          await FileSystem.writeAsStringAsync(localPath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });

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
