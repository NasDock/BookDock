import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { User, Subscription, MembershipPlan, getApiClient, ApiResponse } from '@bookdock/api-client';

export type { Subscription, MembershipPlan };

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  membership: 'free' | 'premium' | null;
  subscription: Subscription | null;
  isPremium: boolean; // annual or lifetime
}

export interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<ApiResponse<{ token: string; user: User }>>;
  logout: () => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<ApiResponse<{ token: string; user: User }>>;
  updateToken: (token: string) => void;
  refreshUser: () => Promise<void>;
  // Phone + SMS
  sendSmsCode: (phone: string) => Promise<ApiResponse<{ message: string; expiresIn?: number }>>;
  loginWithPhone: (phone: string, code: string) => Promise<ApiResponse<{ token: string; user: User }>>;
  registerWithPhone: (phone: string, code: string, username?: string) => Promise<ApiResponse<{ token: string; user: User }>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'bookdock_auth_token';
const USER_KEY = 'bookdock_auth_user';
const SUB_KEY = 'bookdock_auth_subscription';

function isPremiumPlan(plan?: MembershipPlan | string | null): boolean {
  return plan === 'annual' || plan === 'lifetime' || plan === 'premium';
}

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
    subscription: null,
    isPremium: false,
  });

  useEffect(() => {
    if (apiBaseUrl) {
      try {
        getApiClient();
      } catch {
        // Client not initialized yet
      }
    }
  }, [apiBaseUrl]);

  const loadSubscription = useCallback(async (token: string): Promise<Subscription | null> => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getSubscription();
      if (response.success && response.data) {
        localStorage.setItem(SUB_KEY, JSON.stringify(response.data));
        return response.data;
      }
    } catch {
      // Ignore subscription load errors
    }
    return null;
  }, []);

  const restoreAuth = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    const storedSub = localStorage.getItem(SUB_KEY);

    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser) as User;
        const sub = storedSub ? JSON.parse(storedSub) as Subscription : null;

        setState({
          user,
          token: storedToken,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
          subscription: sub,
          isPremium: isPremiumPlan(sub?.plan || user.membership),
        });

        // Verify token with server and refresh subscription
        try {
          const apiClient = getApiClient();
          const [userResponse, subResponse] = await Promise.all([
            apiClient.getCurrentUser(),
            apiClient.getSubscription().catch(() => null),
          ]);

          if (userResponse.success && userResponse.data) {
            setState(prev => {
              const newSub = subResponse?.data || prev.subscription;
              return {
                ...prev,
                user: userResponse.data,
                membership: (userResponse.data as any).membership || prev.membership,
                subscription: newSub,
                isPremium: isPremiumPlan(newSub?.plan || (userResponse.data as any).membership),
              };
            });
            localStorage.setItem(USER_KEY, JSON.stringify(userResponse.data));
            if (subResponse?.data) {
              localStorage.setItem(SUB_KEY, JSON.stringify(subResponse.data));
            }
          }
        } catch {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          localStorage.removeItem(SUB_KEY);
          setState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            membership: null,
            subscription: null,
            isPremium: false,
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
  }, []);

  useEffect(() => {
    restoreAuth();
  }, [restoreAuth]);

  const login = useCallback(async (username: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const apiClient = getApiClient();
      const response = await apiClient.login(username, password);

      if (response.success && response.data) {
        const { token, user } = response.data;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        const sub = await loadSubscription(token);

        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
          subscription: sub,
          isPremium: isPremiumPlan(sub?.plan || user.membership),
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return response;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [loadSubscription]);

  const logout = useCallback(async () => {
    try {
      const apiClient = getApiClient();
      await apiClient.logout();
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SUB_KEY);

      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        membership: null,
        subscription: null,
        isPremium: false,
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

        const sub = await loadSubscription(token);

        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
          subscription: sub,
          isPremium: isPremiumPlan(sub?.plan || user.membership),
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return response;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [loadSubscription]);

  const sendSmsCode = useCallback(async (phone: string) => {
    const apiClient = getApiClient();
    return apiClient.sendSmsCode(phone);
  }, []);

  const loginWithPhone = useCallback(async (phone: string, code: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const apiClient = getApiClient();
      const response = await apiClient.loginWithPhone(phone, code);

      if (response.success && response.data) {
        const { token, user } = response.data;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        const sub = await loadSubscription(token);

        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
          subscription: sub,
          isPremium: isPremiumPlan(sub?.plan || user.membership),
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return response;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [loadSubscription]);

  const registerWithPhone = useCallback(async (phone: string, code: string, username?: string) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const apiClient = getApiClient();
      const response = await apiClient.registerWithPhone(phone, code, username);

      if (response.success && response.data) {
        const { token, user } = response.data;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        const sub = await loadSubscription(token);

        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          membership: user.membership,
          subscription: sub,
          isPremium: isPremiumPlan(sub?.plan || user.membership),
        });
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }

      return response;
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [loadSubscription]);

  const updateToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    setState(prev => ({ ...prev, token }));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.token) return;

    try {
      const apiClient = getApiClient();
      const [userResponse, subResponse] = await Promise.all([
        apiClient.getCurrentUser(),
        apiClient.getSubscription().catch(() => null),
      ]);

      if (userResponse.success && userResponse.data) {
        const newSub = subResponse?.data || null;
        setState(prev => ({
          ...prev,
          user: userResponse.data,
          membership: (userResponse.data as any).membership || prev.membership,
          subscription: newSub,
          isPremium: isPremiumPlan(newSub?.plan || (userResponse.data as any).membership),
        }));
        localStorage.setItem(USER_KEY, JSON.stringify(userResponse.data));
        if (newSub) localStorage.setItem(SUB_KEY, JSON.stringify(newSub));
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
    sendSmsCode,
    loginWithPhone,
    registerWithPhone,
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

// Premium gate - redirects non-premium users to membership page
export function withPremium<P extends object>(Component: React.ComponentType<P>) {
  return function PremiumComponent(props: P) {
    const { isPremium, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      );
    }

    if (!isPremium) {
      window.location.href = '/membership';
      return null;
    }

    return <Component {...props} />;
  };
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
      window.location.href = '/login';
      return null;
    }

    if (options?.requiredMembership === 'premium' && !auth.isPremium) {
      window.location.href = '/membership';
      return null;
    }

    return <Component {...props} />;
  };
}

// Hook for checking permissions
export function usePermission(permission: 'admin' | 'read' | 'write' | 'upload' | 'tts'): boolean {
  const { user, isPremium } = useAuth();

  if (!user) return false;
  if (user.role === 'admin') return true;

  switch (permission) {
    case 'admin': return false;
    case 'read': return true;
    case 'write': return isPremium;
    case 'upload': return isPremium;
    case 'tts': return isPremium;
    default: return false;
  }
}

// Premium badge component
export function PremiumBadge({ className = '' }: { className?: string }) {
  const { isPremium, subscription } = useAuth();

  if (!isPremium) return null;

  const label = subscription?.plan === 'lifetime' ? '永久会员' : subscription?.plan === 'annual' ? '年卡会员' : 'Premium';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 bg-size-200 text-white rounded-full shadow-sm ${className}`}>
      ⭐ {label}
    </span>
  );
}

// Premium feature lock component
export function PremiumFeatureLock({ feature, className = '' }: { feature: string; className?: string }) {
  const { isPremium } = useAuth();

  if (isPremium) return null;

  return (
    <div className={`flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 ${className}`}>
      <span>🔒</span>
      <span>{feature}</span>
      <a href="/membership" className="text-blue-500 hover:text-blue-600 font-medium ml-1">
        升级会员
      </a>
    </div>
  );
}
