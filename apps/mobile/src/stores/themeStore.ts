import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeMode } from '@bookdock/ebook-reader';

export type AppTheme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: AppTheme;
  actualTheme: 'light' | 'dark';
  isDark: boolean;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): 'light' | 'dark' {
  // In React Native, we use a listener for system theme changes
  return 'light'; // Default, will be updated by listener
}

function getEffectiveTheme(theme: AppTheme, systemTheme: 'light' | 'dark'): 'light' | 'dark' {
  return theme === 'system' ? systemTheme : theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      actualTheme: 'light',
      isDark: false,

      setTheme: (theme) => {
        const systemTheme = getSystemTheme();
        const actualTheme = getEffectiveTheme(theme, systemTheme);
        set({ 
          theme, 
          actualTheme, 
          isDark: actualTheme === 'dark' 
        });
      },

      toggleTheme: () => {
        const { actualTheme } = get();
        const newTheme = actualTheme === 'dark' ? 'light' : 'dark';
        set({ 
          theme: newTheme, 
          actualTheme: newTheme, 
          isDark: newTheme === 'dark' 
        });
      },
    }),
    {
      name: 'bookdock-theme',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Listen for system theme changes (can be set up with useEffect in App.tsx)
let systemThemeListener: ((theme: 'light' | 'dark') => void) | null = null;

export function setSystemThemeListener(listener: (theme: 'light' | 'dark') => void) {
  systemThemeListener = listener;
}

export function notifySystemThemeChange(theme: 'light' | 'dark') {
  systemThemeListener?.(theme);
}
