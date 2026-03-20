import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { User, getApiClient, ApiResponse } from '@bookdock/api-client';

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  membership: 'free' | 'premium' | null;
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<ApiResponse<{ token: string; user: User }>>;
  logout: () => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<ApiResponse<{ token: string; user: User }>>;
  updateToken: (token: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'bookdock_auth_token';
const USER_KEY = 'bookdock_auth_user';

interface AuthProviderProps {
  children: ReactNode;
  apiBaseUrl?: string;
  onAuthError?: () => void;
}

export function AuthProvider({ children, apiBaseUrl, onAuthError }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    isAuthenticated: false,
    isLoading: true,
    membership: null,
  });

  // Initialize API client with auth token getter
  useEffect(() => {
    if (apiBaseUrl) {
      try {
        getApiClient(); // Ensure client is initialized
      } catch {
        // Client not initialized yet; App.tsx will initialize it
      }
    }
  }, [apiBaseUrl]);

  // Restore user from localStorage on mount
  useEffect(() => {
    const restoreAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      if (storedToken && storedUser) {
        try {
          const user = JSON.parse(storedUser) as User;
          setState({
            user,
            token: storedToken,
            isAuthenticated: true,
            isLoading: false,
            membership: user.membership,
          });

          // Optionally verify token with server
          try {
            const apiClient = getApiClient();
            const response = await apiClient.getCurrentUser();
            if (response.success && response.data) {
              setState(prev => ({
                ...prev,
                user: response.data,
                membership: response.data.membership,
              }));
              localStorage.setItem(USER_KEY, JSON.stringify(response.data));
            }
          } catch {
            // Token invalid, clear auth
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setState({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              membership: null,
            });
          }
        } catch {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    restoreAuth();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const apiClient = getApiClient();
      const response = await apiClient.login(username, password);

      if (response.success && response.data) {
        const { token, user } = response.data;
        
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return response;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const apiClient = getApiClient();
      await apiClient.logout();
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      
      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        membership: null,
      });

      onAuthError?.();
    }
  }, [onAuthError]);

  const register = useCallback(async (username: string, password: string, email?: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const apiClient = getApiClient();
      const response = await apiClient.register(username, password, email);

      if (response.success && response.data) {
        const { token, user } = response.data;
        
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return response;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const updateToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    setState(prev => ({ ...prev, token }));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.token) return;

    try {
      const apiClient = getApiClient();
      const response = await apiClient.getCurrentUser();
      
      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          user: response.data,
          membership: response.data.membership,
        }));
        localStorage.setItem(USER_KEY, JSON.stringify(response.data));
      }
    } catch {
      // Ignore refresh errors
    }
  }, [state.token]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    register,
    updateToken,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Higher-order component for protected routes
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: { requiredMembership?: 'free' | 'premium' }
) {
  return function AuthenticatedComponent(props: P) {
    const auth = useAuth();

    if (auth.isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      );
    }

    if (!auth.isAuthenticated) {
      // In a real app, redirect to login
      window.location.href = '/login';
      return null;
    }

    if (options?.requiredMembership === 'premium' && auth.membership !== 'premium') {
      // Show upgrade prompt
      window.location.href = '/upgrade';
      return null;
    }

    return <Component {...props} />;
  };
}

// Hook for checking permissions
export function usePermission(permission: 'admin' | 'read' | 'write' | 'upload'): boolean {
  const { user, membership } = useAuth();

  if (!user) return false;

  if (user.role === 'admin') return true;

  switch (permission) {
    case 'admin':
      return false;
    case 'read':
      return true;
    case 'write':
      return membership === 'premium';
    case 'upload':
      return membership === 'premium';
    default:
      return false;
  }
}
