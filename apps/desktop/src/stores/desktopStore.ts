import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Book } from '@bookdock/api-client';

export interface LocalFile {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
  modified?: string;
}

export interface AppSettings {
  nasPaths: string[];
  lastOpenedPath?: string;
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  autoPlayTts: boolean;
  ttsVoiceId?: string;
  ttsRate: number;
  ttsVolume: number;
}

export interface TtsState {
  isPlaying: boolean;
  isPaused: boolean;
  bookId?: string;
  currentText?: string;
  progress: number;
}

interface DesktopState {
  // File browser
  currentPath: string;
  files: LocalFile[];
  isLoadingFiles: boolean;

  // Books
  books: Book[];
  selectedBook: Book | null;
  isReaderOpen: boolean;

  // TTS
  ttsState: TtsState;
  isTtsMode: boolean;

  // Settings
  settings: AppSettings;

  // UI
  theme: 'light' | 'dark' | 'system';

  // Actions
  setCurrentPath: (path: string) => void;
  setFiles: (files: LocalFile[]) => void;
  setIsLoadingFiles: (loading: boolean) => void;
  selectBook: (book: Book | null) => void;
  setBooks: (books: Book[]) => void;
  addBook: (book: Book) => void;
  updateBookProgress: (bookId: string, progress: number, currentPage?: number) => void;
  setIsReaderOpen: (open: boolean) => void;
  setTtsState: (state: Partial<TtsState>) => void;
  setIsTtsMode: (mode: boolean) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set, get) => ({
      // File browser
      currentPath: '',
      files: [],
      isLoadingFiles: false,

      // Books
      books: [],
      selectedBook: null,
      isReaderOpen: false,

      // TTS
      ttsState: {
        isPlaying: false,
        isPaused: false,
        progress: 0,
      },
      isTtsMode: false,

      // Settings
      settings: {
        nasPaths: [],
        lastOpenedPath: undefined,
        theme: 'system',
        fontSize: 16,
        autoPlayTts: false,
        ttsVoiceId: undefined,
        ttsRate: 1.0,
        ttsVolume: 1.0,
      },

      // UI
      theme: 'system',

      // Actions
      setCurrentPath: (path) => set({ currentPath: path }),
      setFiles: (files) => set({ files }),
      setIsLoadingFiles: (loading) => set({ isLoadingFiles: loading }),

      selectBook: (book) => set({ selectedBook: book, isReaderOpen: book !== null }),

      setBooks: (books) => set({ books }),

      addBook: (book) => set((state) => ({ books: [book, ...state.books] })),

      updateBookProgress: (bookId, progress, currentPage) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId
              ? { ...b, readingProgress: progress, currentPage: currentPage ?? b.currentPage }
              : b
          ),
          selectedBook:
            state.selectedBook?.id === bookId
              ? { ...state.selectedBook, readingProgress: progress, currentPage: currentPage ?? state.selectedBook.currentPage }
              : state.selectedBook,
        })),

      setIsReaderOpen: (open) => set({ isReaderOpen: open }),

      setTtsState: (state) =>
        set((prev) => ({ ttsState: { ...prev.ttsState, ...state } })),

      setIsTtsMode: (mode) => set({ isTtsMode: mode }),

      updateSettings: (newSettings) =>
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'bookdock-desktop',
      partialize: (state) => ({
        settings: state.settings,
        theme: state.theme,
        currentPath: state.currentPath,
      }),
    }
  )
);
