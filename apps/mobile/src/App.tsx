import { initApiClient } from '@bookdock/api-client';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';
import { notificationService } from './services';
import { getAuthToken, useAuthStore, useThemeStore } from './stores';

// Initialize API Client for mobile
// Note: Use host machine's IP address instead of localhost for mobile devices
initApiClient({
  baseURL: 'http://10.79.233.188:3000/api',
  getAuthToken: () => getAuthToken(),
});

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

export default function App() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    // Initialize app
    const initApp = async () => {
      try {
        // Request notification permissions
        await notificationService.requestPermissions();
        
        // Set up notification listeners
        notificationService.addNotificationReceivedListener((notification) => {
          console.log('Notification received:', notification);
        });

        notificationService.addNotificationResponseListener((response) => {
          console.log('Notification response:', response);
          // Handle notification tap - navigate to relevant screen
          const data = response.notification.request.content.data;
          if (data?.bookId) {
            // Would navigate to book reader
          }
        });
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setLoading(false);
        await SplashScreen.hideAsync();
      }
    };

    initApp();
  }, [setLoading]);

  return (
    <SafeAreaProvider>
      <StatusBar style={actualTheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
