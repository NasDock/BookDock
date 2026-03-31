import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabNavigator } from './MainTabNavigator';
import { ReaderScreen } from '../screens/ReaderScreen';
import { TTSScreen } from '../screens/TTSScreen';
import { TTSReaderScreen } from '../screens/TTSReaderScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MemberLoginScreen } from '../screens/MemberLoginScreen';
import { MemberBenefitsScreen } from '../screens/MemberBenefitsScreen';
import { MemberDetailScreen } from '../screens/MemberDetailScreen';
import { MemberPaymentSuccessScreen } from '../screens/MemberPaymentSuccessScreen';
import { SourceManageScreen } from '../screens/SourceManageScreen';
import { useAuthStore, useThemeStore } from '../stores';
import { getTheme } from '../utils/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

async function getVipStatus() {
  try {
    const stored = await AsyncStorage.getItem('bookdock_vip_user');
    if (stored) {
      const user = JSON.parse(stored);
      return { isVip: user.isVip === true, level: user.level || 'free' };
    }
  } catch {}
  return { isVip: false, level: 'free' };
}

function NoVipModal({ navigation }: any) {
  const actualTheme = useThemeStore((s) => s.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  return (
    <Stack.Screen name="MemberBenefits" component={MemberBenefitsScreen} options={{ headerShown: false }} />
  );
}

export function RootNavigator() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { isAuthenticated } = useAuthStore();

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
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {/* Member pages - accessible without auth */}
        <Stack.Screen
          name="MemberLogin"
          component={MemberLoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MemberBenefits"
          component={MemberBenefitsScreen}
          options={{ title: '会员权益', headerShown: false }}
        />
        <Stack.Screen
          name="MemberDetail"
          component={MemberDetailScreen}
          options={{ title: '我的会员', headerShown: false }}
        />
        <Stack.Screen
          name="MemberPaymentSuccess"
          component={MemberPaymentSuccessScreen}
          options={{ title: '支付成功', headerShown: false }}
        />

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
              options={{ title: 'Listen', headerBackTitle: 'Back' }}
            />
            <Stack.Screen
              name="TTSReader"
              component={TTSReaderScreen}
              options={{
                headerShown: false,
                presentation: 'fullScreenModal',
              }}
            />
            <Stack.Screen
              name="SourceManage"
              component={SourceManageScreen}
              options={{
                title: '书源管理',
                headerBackTitle: 'Back',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
