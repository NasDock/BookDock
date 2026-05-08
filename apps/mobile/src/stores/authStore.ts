import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@bookdock/api-client';
import { getApiClient, initApiClient } from '@bookdock/api-client';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setError: (error: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  restoreAuth: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

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
        });
        // Clear AsyncStorage auth data
        AsyncStorage.removeItem('bookdock-auth');
      },

      setLoading: (isLoading) => set({ isLoading }),

      restoreAuth: async () => {
        try {
          // Token is already restored by zustand persist from 'bookdock-auth' key
          const token = get().token;
          const user = get().user;

          if (!token) {
            set({ isLoading: false });
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
    }),
    {
      name: 'bookdock-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Helper to get auth token
export const getAuthToken = () => useAuthStore.getState().token;
