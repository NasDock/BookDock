import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReaderMode } from '@bookdock/ebook-reader';

interface ReaderState {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  margin: number;
  mode: ReaderMode;
  textDirection: 'ltr' | 'rtl';
  currentBookId: string | null;
  autoSaveProgress: boolean;

  // Actions
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setLineHeight: (height: number) => void;
  setMargin: (margin: number) => void;
  setMode: (mode: ReaderMode) => void;
  setTextDirection: (direction: 'ltr' | 'rtl') => void;
  setCurrentBookId: (bookId: string | null) => void;
  setAutoSaveProgress: (autoSave: boolean) => void;
  resetToDefaults: () => void;
}

const defaultConfig = {
  fontSize: 18,
  fontFamily: 'System',
  lineHeight: 1.8,
  margin: 16,
  mode: 'light' as ReaderMode,
  textDirection: 'ltr' as const,
  currentBookId: null,
  autoSaveProgress: true,
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
      setCurrentBookId: (currentBookId) => set({ currentBookId }),
      setAutoSaveProgress: (autoSaveProgress) => set({ autoSaveProgress }),
      resetToDefaults: () => set(defaultConfig),
    }),
    {
      name: 'bookdock-reader-config',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
