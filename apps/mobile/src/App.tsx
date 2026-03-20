import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './navigation';
import { useThemeStore, useAuthStore } from './stores';
import { notificationService } from './services';

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

export default function App() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
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

  // Apply theme based on system theme changes
  useEffect(() => {
    if (theme === 'system') {
      // Listen for system theme changes (would need Appearance API in React Native)
      // For now, we'll just check on mount
    }
  }, [theme]);

  return (
    <SafeAreaProvider>
      <StatusBar style={actualTheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
