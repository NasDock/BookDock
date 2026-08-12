import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { RootNavigator } from './navigation';
import { useAuthStore, useThemeStore } from './stores';
import { notificationService } from './services';
import { initApiClient } from '@bookdock/api-client';
import { autoSelectServer, getSavedApiBaseUrl, toApiBaseUrl } from './utils/network';
import { setApiBaseUrl } from './services/api';
import { setPlusToken } from './services/plus';
import { setNavigationBarAuto } from './utils/navigationBar';
import { getTheme } from './utils/theme';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

const DEFAULT_API_BASE_URL = 'http://localhost:8088/api';

export default function App() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const themeMode = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setLoading = useAuthStore((state) => state.setLoading);
  const restoreAuth = useAuthStore((state) => state.restoreAuth);

  const [appReady, setAppReady] = useState(false);
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    const initApp = async () => {
      try {
        setLoading(true);

        // Preload icon fonts to prevent glyph map null errors
        await Font.loadAsync(Ionicons.font);

        // Auto-select best server address
        const bestAddress = await autoSelectServer();
        const activeAddress = bestAddress ? toApiBaseUrl(bestAddress) : await getSavedApiBaseUrl(DEFAULT_API_BASE_URL);
        setApiBaseUrl(activeAddress);

        // Initialize API client globally
        initApiClient({
          baseURL: activeAddress,
          getAuthToken: () => useAuthStore.getState().token || null,
          onAuthError: () => {
            useAuthStore.getState().logout();
          },
        });

        console.log('[App] API base URL:', activeAddress);

        // Restore auth from storage
        await restoreAuth();

        // Rehydrate Plus API token into the axios `Authorization` header.
        // Fix 2026-08-12: 之前 `08ce0a6` 重写 plus.ts 后没有这个步骤，导致
        // 冷启动 / 应用重启后 `bookdock_plus_token` 还存在 AsyncStorage 中，
        // 但 axios header 没回灌，触发 plusCreateVipPayment 时后端直接 401。
        // 注意：token 可能已过期，第一次请求失败时 interceptor 会自动清理 +
        // 跳登录页（plusUnauthorizedHandler）。
        const storedPlusToken = await AsyncStorage.getItem('bookdock_plus_token');
        if (storedPlusToken) {
          setPlusToken(storedPlusToken);
        }

        // Request notification permissions
        await notificationService.requestPermissions();

        notificationService.addNotificationReceivedListener((notification) => {
          console.log('Notification received:', notification);
        });

        notificationService.addNotificationResponseListener((response) => {
          console.log('Notification response:', response);
          const data = response.notification.request.content.data;
          if (data?.bookId) {
            // Would navigate to book reader
          }
        });
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setLoading(false);
        setAppReady(true);
        await SplashScreen.hideAsync();
      }
    };

    initApp();
  }, []);

  // 监听系统主题变化，当设置为 'system' 时自动跟随
  useEffect(() => {
    if (themeMode === 'system' && systemColorScheme) {
      setTheme('system');
    }
  }, [systemColorScheme, themeMode, setTheme]);

  // 同步导航栏主题与 App 主题（必须在所有条件 return 之前调用 Hook）
  const theme = getTheme(actualTheme === 'dark');
  useEffect(() => {
    setNavigationBarAuto(theme.colors.background);
  }, [theme.colors.background]);

  if (!appReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={actualTheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
