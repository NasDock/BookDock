import type { JSX } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from './MainTabNavigator';
import { ReaderScreen } from '../screens/ReaderScreen';
import { TTSScreen } from '../screens/TTSScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MemberLoginScreen } from '../screens/MemberLoginScreen';
import { useAuthStore, useThemeStore } from '../stores';
import { getTheme } from '../utils/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  return (
    <NavigationContainer
      theme={{
        dark: theme.dark,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.error,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.surface,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Reader"
              component={ReaderScreen}
              options={({ route }) => ({
                title: route.params?.book?.title || 'Reader',
                headerBackTitle: 'Back',
              })}
            />
            <Stack.Screen
              name="TTSScreen"
              component={TTSScreen}
              options={{
                title: 'Listen',
                headerBackTitle: 'Back',
              }}
            />
            <Stack.Screen
              name="MemberLogin"
              component={MemberLoginScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
        <Stack.Screen
          name="MemberLogin"
          component={MemberLoginScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
