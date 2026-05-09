import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Book, getApiClient } from '@bookdock/api-client';

interface LibraryState {
  books: Book[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  currentPage: number;
  totalBooks: number;
  selectedBook: Book | null;
  
  // Actions
  fetchBooks: (params?: { page?: number; limit?: number; search?: string }) => Promise<void>;
  addBook: (bookData: Partial<Book>) => Promise<Book | null>;
  updateBook: (id: string, bookData: Partial<Book>) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  selectBook: (book: Book | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
  updateBookProgress: (bookId: string, progress: number, currentPage?: number) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      isLoading: false,
      error: null,
      searchQuery: '',
      currentPage: 1,
      totalBooks: 0,
      selectedBook: null,

      fetchBooks: async (params) => {
        set({ isLoading: true, error: null });
        
        try {
          const apiClient = getApiClient();
          const { searchQuery, currentPage: page } = get();
          const response = await apiClient.getBooks({
            page: params?.page ?? page,
            limit: 20,
            search: params?.search ?? searchQuery,
          });

          if (response.success && response.data) {
            set({
              books: response.data.books,
              totalBooks: response.data.total,
              currentPage: response.data.page,
              isLoading: false,
            });
          } else {
            set({ error: response.error || 'Failed to fetch books', isLoading: false });
          }
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      addBook: async (bookData) => {
        try {
          const apiClient = getApiClient();
          const response = await apiClient.addBook(bookData);
          
          if (response.success && response.data) {
            set((state) => ({
              books: [response.data!, ...state.books],
              totalBooks: state.totalBooks + 1,
            }));
            return response.data;
          } else {
            set({ error: response.error || 'Failed to add book' });
            return null;
          }
        } catch (error) {
          set({ error: (error as Error).message });
          return null;
        }
      },

      updateBook: async (id, bookData) => {
        try {
          const apiClient = getApiClient();
          const response = await apiClient.updateBook(id, bookData);
          
          if (response.success && response.data) {
            set((state) => ({
              books: state.books.map((book) =>
                book.id === id ? response.data! : book
              ),
              selectedBook:
                state.selectedBook?.id === id ? response.data : state.selectedBook,
            }));
          }
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      deleteBook: async (id) => {
        try {
          const apiClient = getApiClient();
          const response = await apiClient.deleteBook(id);
          
          if (response.success) {
            set((state) => ({
              books: state.books.filter((book) => book.id !== id),
              totalBooks: state.totalBooks - 1,
              selectedBook: state.selectedBook?.id === id ? null : state.selectedBook,
            }));
          }
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      selectBook: (book) => {
        set({ selectedBook: book });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      clearError: () => {
        set({ error: null });
      },

      updateBookProgress: async (bookId, progress, currentPage) => {
        try {
          const apiClient = getApiClient();
          await apiClient.updateReadingProgress(bookId, progress, currentPage);
          
          set((state) => ({
            books: state.books.map((book) =>
              book.id === bookId
                ? { ...book, readingProgress: progress, currentPage }
                : book
            ),
          }));
        } catch (error) {
          console.error('Failed to update reading progress:', error);
        }
      },
    }),
    {
      name: 'bookdock-library',
      partialize: (state) => ({
        // Only persist these fields
        selectedBook: state.selectedBook,
      }),
    }
  )
);

// Selectors for optimized re-renders
export const selectBooksByFormat = (books: Book[], format: Book['fileType']) =>
  books.filter((book) => book.fileType === format);

export const selectRecentlyRead = (books: Book[], limit = 5) =>
  books
    .filter((book) => book.lastReadAt)
    .sort((a, b) => {
      const dateA = new Date(a.lastReadAt!).getTime();
      const dateB = new Date(b.lastReadAt!).getTime();
      return dateB - dateA;
    })
    .slice(0, limit);

export const selectBooksByProgress = (books: Book[]) =>
  books
    .filter((book) => book.readingProgress && book.readingProgress > 0 && book.readingProgress < 100)
    .sort((a, b) => (b.readingProgress || 0) - (a.readingProgress || 0));
