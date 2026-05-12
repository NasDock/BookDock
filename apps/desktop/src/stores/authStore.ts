import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setPlusToken, removePlusToken } from '../services/plus';

interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  actualTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      actualTheme: getSystemTheme(),

      setTheme: (theme) => {
        const actualTheme = theme === 'system' ? getSystemTheme() : theme;
        applyTheme(actualTheme);
        set({ theme, actualTheme });
      },

      toggleTheme: () => {
        const { actualTheme } = get();
        const newTheme = actualTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        set({ theme: newTheme, actualTheme: newTheme });
      },
    }),
    {
      name: 'bookdock-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const actualTheme = state.theme === 'system' ? getSystemTheme() : state.theme;
          applyTheme(actualTheme);
          state.actualTheme = actualTheme;
        }
      },
    }
  )
);

// Listen for system theme changes
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      const newTheme = e.matches ? 'dark' : 'light';
      applyTheme(newTheme);
      useThemeStore.setState({ actualTheme: newTheme });
    }
  });
}

import type { User } from '@bookdock/api-client';

// Auth store with Plus support
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  plusToken: string | null;
  plusUserId: string | number | null;
  isVip: boolean;
  login: (user: User) => void;
  logout: () => void;
  setPlusAuth: (token: string, userId: string | number) => void;
  clearPlusAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      plusToken: null,
      plusUserId: null,
      isVip: false,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        removePlusToken();
        set({ user: null, isAuthenticated: false, plusToken: null, plusUserId: null, isVip: false });
      },
      setPlusAuth: (token, userId) => {
        setPlusToken(token);
        localStorage.setItem('bookdock_plus_user_id', JSON.stringify(userId));
        set({ plusToken: token, plusUserId: userId });
      },
      clearPlusAuth: () => {
        removePlusToken();
        localStorage.removeItem('bookdock_plus_user_id');
        set({ plusToken: null, plusUserId: null, isVip: false });
      },
    }),
    { name: 'bookdock-auth' }
  )
);

