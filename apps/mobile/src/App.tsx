import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './navigation';
import { useAuthStore, useThemeStore } from './stores';
import { notificationService } from './services';
import { initApiClient } from '@bookdock/api-client';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

const API_BASE_URL = 'http://localhost:8080/api';

export default function App() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const setLoading = useAuthStore((state) => state.setLoading);
  const restoreAuth = useAuthStore((state) => state.restoreAuth);

  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Initialize API client globally
    initApiClient({
      baseURL: API_BASE_URL,
      getAuthToken: () => useAuthStore.getState().token || null,
      onAuthError: () => {
        useAuthStore.getState().logout();
      },
    });

    const initApp = async () => {
      try {
        setLoading(true);

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
