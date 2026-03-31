import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReaderConfig, ReaderMode } from '@bookdock/ebook-reader';

interface ReaderState extends ReaderConfig {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  margin: number;
  mode: ReaderMode;
  textDirection: 'ltr' | 'rtl';

  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setLineHeight: (height: number) => void;
  setMargin: (margin: number) => void;
  setMode: (mode: ReaderMode) => void;
  setTextDirection: (direction: 'ltr' | 'rtl') => void;
  resetToDefaults: () => void;
}

const defaultConfig: ReaderConfig = {
  fontSize: 18,
  fontFamily: 'Georgia, serif',
  lineHeight: 1.8,
  margin: 40,
  mode: 'light',
  textDirection: 'ltr',
};

export const useReaderStore = create<ReaderState>()(
  persist<ReaderState>(
    (set) => ({
      ...defaultConfig,

      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setMargin: (margin) => set({ margin }),
      setMode: (mode) => set({ mode }),
      setTextDirection: (textDirection) => set({ textDirection }),
      resetToDefaults: () => set(defaultConfig),
    }),
    {
      name: 'bookdock-reader-config',
    }
  )
);

// Alias for compatibility with App.tsx imports
export const useThemeStore = useReaderStore;
