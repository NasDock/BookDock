import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './navigation';
import { useAuthStore, useThemeStore } from './stores';
import { notificationService } from './services';
import { initApiClient } from '@bookdock/api-client';
import { autoSelectServer, getSavedApiBaseUrl, toApiBaseUrl } from './utils/network';
import { setApiBaseUrl } from './services/api';
import { setNavigationBarAuto } from './utils/navigationBar';
import { getTheme } from './utils/theme';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

const DEFAULT_API_BASE_URL = 'http://localhost:8088/api';

export default function App() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const setLoading = useAuthStore((state) => state.setLoading);
  const restoreAuth = useAuthStore((state) => state.restoreAuth);

  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      try {
        setLoading(true);

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
