/**
 * BookDock Mobile2 — App.tsx
 *
 * 移植自 mobile/src/App.tsx,expo-* 替换说明:
 * - expo-status-bar → RN 内置 <StatusBar />
 * - expo-splash-screen → 暂去掉 (开发期不需要)
 * - expo-font → 暂去掉 (后续用 react-native-asset 处理,SettingsScreen 不需要图标字体也能用)
 * - @expo/vector-icons → react-native-vector-icons (在 pages/components 里直接 import)
 * - react-native-safe-area-context → **完全移除** (2026-08-13 用户决定)
 *   不再用 SafeAreaView 库,只用一个全屏 View 铺主题背景 + RN 内置 StatusBar。
 *   横屏黑条问题的根因:Android window.statusBarColor 是 RN 默认 #00000000(透明),
 *   但 RN 0.81 在某些机型上旋转时,系统状态栏仍以 window-level 渲染一条
 *   "letterbox"色,App 顶层 View 盖不上。
 *   修复:Android style 把 statusBarColor / navigationBarColor 显式设 transparent,
 *   让 App 内部 View 的 backgroundColor 真正延伸过去。
 *
 * 保留 mobile 的全部初始化逻辑:
 * 1. setApiBaseUrl + initApiClient
 * 2. restoreAuth
 * 3. setPlusToken (从 AsyncStorage 恢复)
 * 4. notificationService.requestPermissions
 * 5. 系统主题监听 (theme='system' 时跟随)
 * 6. Android 导航栏颜色
 *
 * 横屏兜底:styles.xml 的 statusBarColor/navigationBarColor=transparent + 此处的 backgroundColor。
 */

import { useEffect } from 'react';
import { StatusBar, useColorScheme, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initApiClient } from '@bookdock/api-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation';
import { useAuthStore, useThemeStore } from './src/stores';
import { notificationService } from './src/services';
import { autoSelectServer, getSavedApiBaseUrl, toApiBaseUrl } from './src/utils/network';
import { setApiBaseUrl } from './src/services/api';
import { setPlusToken } from './src/services/plus';
import { setNavigationBarAuto } from './src/utils/navigationBar';
import { getTheme } from './src/utils/theme';

const DEFAULT_API_BASE_URL = 'http://localhost:8088/api';

export default function App() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const themeMode = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setLoading = useAuthStore((state) => state.setLoading);
  const restoreAuth = useAuthStore((state) => state.restoreAuth);

  const systemColorScheme = useColorScheme();

  useEffect(() => {
    const initApp = async () => {
      try {
        setLoading(true);

        // 1. Auto-select best server address
        const bestAddress = await autoSelectServer();
        const activeAddress = bestAddress
          ? toApiBaseUrl(bestAddress)
          : await getSavedApiBaseUrl(DEFAULT_API_BASE_URL);
        setApiBaseUrl(activeAddress);

        // 2. Initialize API client globally
        initApiClient({
          baseURL: activeAddress,
          getAuthToken: () => useAuthStore.getState().token || null,
          onAuthError: () => {
            useAuthStore.getState().logout();
          },
        });

        console.log('[App] API base URL:', activeAddress);

        // 3. Restore auth from storage
        await restoreAuth();

        // 4. Rehydrate Plus API token into the axios `Authorization` header
        const storedPlusToken = await AsyncStorage.getItem('bookdock_plus_token');
        if (storedPlusToken) {
          setPlusToken(storedPlusToken);
        }

        // 5. Request notification permissions (defensive: notifee native module may be
        // unregisteredor its JS shim may fail to load; init must not block app startup).
        try {
          await notificationService.requestPermissions();

          notificationService.addNotificationReceivedListener((notification) => {
            console.log('Notification received:', notification);
          });

          notificationService.addNotificationResponseListener((response) => {
            console.log('Notification response:', response);
            const data = (response as any)?.notification?.request?.content?.data;
            if (data?.bookId) {
              // Would navigate to book reader
            }
          });
        } catch (notifErr) {
          console.warn('[App] notification init skipped:', notifErr);
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // 监听系统主题变化,当设置为 'system' 时自动跟随
  useEffect(() => {
    if (themeMode === 'system' && systemColorScheme) {
      setTheme('system');
    }
  }, [systemColorScheme, themeMode, setTheme]);

  // 同步导航栏主题与 App 主题
  const theme = getTheme(actualTheme === 'dark');
  useEffect(() => {
    setNavigationBarAuto(theme.colors.background);
  }, [theme.colors.background]);

  return (
    <>
      <StatusBar
        barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      {/*
        外层 View 铺整屏主题背景:
        - styles.xml 把 android:statusBarColor / navigationBarColor 设为 transparent,
          让这个 View 真正延伸到系统栏 + 横屏黑条区域。
        - 横屏时 layer 系统状态栏改为显示在"距离摄像头那侧" (即屏幕左侧/右侧),
          backgroundColor 跟着 currentTheme 走,横条主题跟着变。

        关键:GestureHandlerRootView 必须包在所有导航器/可交互组件的最外层。
        缺这一层会导致 Android 上 TouchableOpacity.onPress + native-stack
        侧边返回手势全部失效(View.onTouchStart 还能触发,但 onPress 完全失灵)。
      */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <RootNavigator />
      </GestureHandlerRootView>
    </>
  );
}
