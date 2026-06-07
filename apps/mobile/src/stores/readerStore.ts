import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderMode } from '@bookdock/ebook-reader';

export type ReadingMode = 'scroll' | 'page';

interface ReaderState {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  margin: number;
  mode: ReaderMode;
  textDirection: 'ltr' | 'rtl';
  readingMode: ReadingMode;
  currentBookId: string | null;
  autoSaveProgress: boolean;
  autoScrollEnabled: boolean;
  autoScrollSpeed: number; // 1-100 (px / 50ms tick)

  // Actions
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setLineHeight: (height: number) => void;
  setMargin: (margin: number) => void;
  setMode: (mode: ReaderMode) => void;
  setTextDirection: (direction: 'ltr' | 'rtl') => void;
  setReadingMode: (mode: ReadingMode) => void;
  setCurrentBookId: (bookId: string | null) => void;
  setAutoSaveProgress: (autoSave: boolean) => void;
  setAutoScrollEnabled: (enabled: boolean) => void;
  setAutoScrollSpeed: (speed: number) => void;
  resetToDefaults: () => void;
}

const defaultConfig = {
  fontSize: 18,
  fontFamily: 'System',
  lineHeight: 1.8,
  margin: 16,
  mode: 'light' as ReaderMode,
  textDirection: 'ltr' as const,
  readingMode: 'scroll' as ReadingMode,
  currentBookId: null,
  autoSaveProgress: true,
  autoScrollEnabled: false,
  autoScrollSpeed: 30,
};

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      ...defaultConfig,

      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setMargin: (margin) => set({ margin }),
      setMode: (mode) => set({ mode }),
      setTextDirection: (textDirection) => set({ textDirection }),
      setReadingMode: (readingMode) => set({ readingMode }),
      setCurrentBookId: (currentBookId) => set({ currentBookId }),
      setAutoSaveProgress: (autoSaveProgress) => set({ autoSaveProgress }),
      setAutoScrollEnabled: (autoScrollEnabled) => set({ autoScrollEnabled }),
      setAutoScrollSpeed: (autoScrollSpeed) => set({ autoScrollSpeed: Math.max(1, Math.min(100, Math.round(autoScrollSpeed))) }),
      resetToDefaults: () => set(defaultConfig),
    }),
    {
      name: 'bookdock-reader-config',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
