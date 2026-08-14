import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@bookdock/api-client';
import { getApiClient, initApiClient } from '@bookdock/api-client';
import { plusGetMe, removePlusToken } from '../services/plus';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  plusUser: any | null;
  isVip: boolean;
  vipTier: string | null;
  vipExpiresAt: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setError: (error: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  restoreAuth: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshVipStatus: () => Promise<boolean>;
  setPlusUser: (user: any | null) => void;
  clearPlusAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      plusUser: null,
      isVip: false,
      vipTier: null,
      vipExpiresAt: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setToken: (token) => set({ token }),

      setError: (error) => set({ error }),

      login: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      }),

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          // Also clear Plus membership state so VIP UI doesn't linger after logout
          plusUser: null,
          isVip: false,
          vipTier: null,
          vipExpiresAt: null,
        });
        // Clear AsyncStorage auth data
        AsyncStorage.removeItem('bookdock-auth');
        AsyncStorage.removeItem('bookdock_plus_token');
        AsyncStorage.removeItem('bookdock_plus_user');
        AsyncStorage.removeItem('bookdock_plus_user_id');
      },

      setLoading: (isLoading) => set({ isLoading }),

      restoreAuth: async () => {
        try {
          // Token is already restored by zustand persist from 'bookdock-auth' key
          const token = get().token;
          const user = get().user;

          if (!token) {
            set({ isLoading: false });
            // No main account — any persisted Plus membership is stale
            get().clearPlusAuth();
            return;
          }

          // Verify token with server
          try {
            const apiClient = getApiClient();
            const response = await apiClient.getCurrentUser();
            if (response.success && response.data) {
              set({
                user: response.data,
                token,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              // Token invalid - clear auth state
              set({
                user: null,
                token: null,
                isAuthenticated: false,
                isLoading: false,
              });
              get().clearPlusAuth();
            }
          } catch {
            // Server unreachable, use cached data if available
            if (user) {
              set({
                token,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              set({ isLoading: false });
            }
          }
        } catch {
          set({ isLoading: false });
        }
      },

      refreshUser: async () => {
        try {
          const apiClient = getApiClient();
          const response = await apiClient.getCurrentUser();
          if (response.success && response.data) {
            set({ user: response.data });
          }
        } catch (error) {
          console.error('Failed to refresh user:', error);
        }
      },

      refreshVipStatus: async () => {
        try {
          let stored = await AsyncStorage.getItem('bookdock_plus_user');
          let parsed: any = null;
          if (stored) {
            try {
              parsed = JSON.parse(stored);
            } catch {
              parsed = null;
            }
          }
          if (!parsed) {
            const idStr = await AsyncStorage.getItem('bookdock_plus_user_id');
            if (idStr) {
              try {
                parsed = { id: JSON.parse(idStr) };
              } catch {
                parsed = null;
              }
            }
          }
          if (!parsed || !parsed.id) {
            get().clearPlusAuth();
            return false;
          }
          const res = await plusGetMe(parsed.id);
          if (res.code === 200 && res.data) {
            const me: any = res.data;
            const currentTier = me?.vipTier;
            const isVipNow = currentTier === 'BASIC' || currentTier === 'LIFETIME';
            const updatedUser = {
              ...parsed,
              ...me,
              isVip: isVipNow,
              level: currentTier === 'LIFETIME' ? 'lifetime' : currentTier === 'BASIC' ? 'year' : 'free',
              expiredAt: me?.vipExpiresAt ?? null,
            };
            await AsyncStorage.setItem('bookdock_plus_user', JSON.stringify(updatedUser));
            set({ isVip: isVipNow, vipTier: currentTier || null, vipExpiresAt: me?.vipExpiresAt ?? null, plusUser: updatedUser });
            return isVipNow;
          }
          // API failed — fall back to local cache. Only trust the cache
          // if it actually carries membership fields; a bare { id } shell
          // (written right after login) has no VIP info, so keep the
          // existing in-memory plusUser instead of clobbering it.
          const tier = parsed.vipTier || (parsed.level === 'lifetime' ? 'LIFETIME' : parsed.level === 'year' ? 'BASIC' : null);
          const hasMembershipInfo = !!tier || parsed.isVip === true || !!parsed.expiredAt || !!parsed.vipExpiresAt;
          if (!hasMembershipInfo) {
            return get().isVip;
          }
          const isVipNow = tier === 'BASIC' || tier === 'LIFETIME' || parsed.isVip === true;
          set({ isVip: isVipNow, vipTier: tier || null, vipExpiresAt: parsed.expiredAt ?? parsed.vipExpiresAt ?? null, plusUser: parsed });
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
          AsyncStorage.setItem('bookdock_plus_user', JSON.stringify(updated));
          set({ plusUser: updated, isVip: isVipNow, vipTier: tier || null, vipExpiresAt: user.expiredAt ?? user.vipExpiresAt ?? null });
        } else {
          AsyncStorage.removeItem('bookdock_plus_user');
          set({ plusUser: null, isVip: false, vipTier: null, vipExpiresAt: null });
        }
      },

      clearPlusAuth: () => {
        AsyncStorage.removeItem('bookdock_plus_token');
        AsyncStorage.removeItem('bookdock_plus_user');
        AsyncStorage.removeItem('bookdock_plus_user_id');
        removePlusToken();
        set({ plusUser: null, isVip: false, vipTier: null, vipExpiresAt: null });
      },
    }),
    {
      name: 'bookdock-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        plusUser: state.plusUser,
        isVip: state.isVip,
        vipTier: state.vipTier,
        vipExpiresAt: state.vipExpiresAt,
      }),
    }
  )
);

// Helper to get auth token
export const getAuthToken = () => useAuthStore.getState().token;