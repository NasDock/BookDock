import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setPlusToken, removePlusToken, plusGetMe } from '../services/plus';

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
  plusUser: any | null;
  isVip: boolean;
  vipTier: string | null;
  vipExpiresAt: string | null;
  login: (user: User) => void;
  logout: () => void;
  setPlusAuth: (token: string, userId: string | number) => void;
  clearPlusAuth: () => void;
  refreshVipStatus: () => Promise<boolean>;
  setPlusUser: (user: any | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      plusToken: null,
      plusUserId: null,
      plusUser: null,
      isVip: false,
      vipTier: null,
      vipExpiresAt: null,
      login: (user) => set({ user, isAuthenticated: true }),
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
      setPlusAuth: (token, userId) => {
        setPlusToken(token);
        localStorage.setItem('bookdock_plus_user_id', JSON.stringify(userId));
        set({ plusToken: token, plusUserId: userId });
      },
      clearPlusAuth: () => {
        removePlusToken();
        localStorage.removeItem('bookdock_plus_user_id');
        localStorage.removeItem('bookdock_plus_user');
        set({ plusToken: null, plusUserId: null, plusUser: null, isVip: false, vipTier: null, vipExpiresAt: null });
      },
      refreshVipStatus: async () => {
        try {
          let stored = localStorage.getItem('bookdock_plus_user');
          let parsed: any = null;
          if (stored) {
            try {
              parsed = JSON.parse(stored);
            } catch {
              parsed = null;
            }
          }
          if (!parsed) {
            const idStr = localStorage.getItem('bookdock_plus_user_id');
            if (idStr) {
              try {
                parsed = { id: JSON.parse(idStr) };
              } catch {
                parsed = null;
              }
            }
          }
          if (!parsed || !parsed.id) {
            set({ isVip: false, vipTier: null, vipExpiresAt: null, plusUser: null });
            return false;
          }
          const res = await plusGetMe(parsed.id);
          if (res.code === 200 && res.data) {
            const me = res.data;
            const currentTier = me?.vipTier;
            const isVipNow = currentTier === 'BASIC' || currentTier === 'LIFETIME';
            const updatedUser = {
              ...parsed,
              ...me,
              isVip: isVipNow,
              level: currentTier === 'LIFETIME' ? 'lifetime' : currentTier === 'BASIC' ? 'year' : 'free',
              expiredAt: me?.vipExpiresAt ?? null,
            };
            localStorage.setItem('bookdock_plus_user', JSON.stringify(updatedUser));
            set({
              isVip: isVipNow,
              vipTier: currentTier || null,
              vipExpiresAt: me?.vipExpiresAt ?? null,
              plusUser: updatedUser,
            });
            return isVipNow;
          }
          // Fallback to cached data on API failure
          const tier = parsed.vipTier || (parsed.level === 'lifetime' ? 'LIFETIME' : parsed.level === 'year' ? 'BASIC' : null);
          const isVipNow = tier === 'BASIC' || tier === 'LIFETIME' || parsed.isVip === true;
          set({
            isVip: isVipNow,
            vipTier: tier || null,
            vipExpiresAt: parsed.expiredAt ?? parsed.vipExpiresAt ?? null,
            plusUser: parsed,
          });
          return isVipNow;
        } catch {
          set({ isVip: false, vipTier: null, vipExpiresAt: null, plusUser: null });
          return false;
        }
      },
      setPlusUser: (user) => {
        if (user) {
          const tier = user.vipTier || (user.level === 'lifetime' ? 'LIFETIME' : user.level === 'year' ? 'BASIC' : null);
          const isVipNow = tier === 'BASIC' || tier === 'LIFETIME';
          const updated = { ...user, isVip: isVipNow, vipTier: tier };
          localStorage.setItem('bookdock_plus_user', JSON.stringify(updated));
          set({
            plusUser: updated,
            isVip: isVipNow,
            vipTier: tier || null,
            vipExpiresAt: user.expiredAt ?? user.vipExpiresAt ?? null,
          });
        } else {
          localStorage.removeItem('bookdock_plus_user');
          set({ plusUser: null, isVip: false, vipTier: null, vipExpiresAt: null });
        }
      },
    }),
    { name: 'bookdock-auth' }
  )
);

