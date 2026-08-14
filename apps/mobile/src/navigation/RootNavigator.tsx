/**
 * RootNavigator — mobile2 第一版
 *
 * 当前只注册 Settings + 三个 Member 占位页面,
 * 等后续页面迁移过来时按 mobile/src/navigation/RootNavigator.tsx 补全。
 */

import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { SettingsScreen, LoginScreen, MemberLoginScreen, MemberBenefitsScreen, MemberDetailScreen, MemberPaymentSuccessScreen, ScanLoginScreen, BookDetailScreen, ReaderScreen, CollectionDetailScreen, AdminUsersScreen, StatsScreen, SearchScreen, TTSScreen } from "../screens";
import { useAuthStore, useThemeStore } from "../stores";
import { getTheme } from "../utils/theme";
import { setNavigationBarAuto } from "../utils/navigationBar";
import { MainTabNavigator } from "./MainTabNavigator";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === "dark");
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const routeNameRef = useRef<string | undefined>(undefined);

  // 监听路由变化:从阅读器返回时恢复导航栏颜色
  // (Reader 屏还没迁,这里保留接口形状等 ReaderScreen 迁过来再启用)
  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const currentRoute = navigationRef.getCurrentRoute();
      const currentName = currentRoute?.name;
      const previousName = routeNameRef.current;
      routeNameRef.current = currentName;

      if (previousName === 'Reader' && currentName !== 'Reader') {
        setNavigationBarAuto(theme.colors.background);
      }
    });

    return unsubscribe;
  }, [navigationRef, theme.colors.background]);

  return (
    <NavigationContainer
      ref={navigationRef}
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
        // RN 7 主题要求 fonts 字段;mobile2 用系统字体,不自定义。
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: "600",
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
              name="Settings"
              component={SettingsScreen}
              options={{
                title: "设置",
                headerBackTitle: "返回",
              }}
            />
          </>
        )}
        <Stack.Screen
          name="MemberLogin"
          component={MemberLoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ScanLogin"
          component={ScanLoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MemberBenefits"
          component={MemberBenefitsScreen}
          options={{ title: "会员权益", headerBackTitle: "返回" }}
        />
        <Stack.Screen
          name="MemberDetail"
          component={MemberDetailScreen}
          options={{ title: "会员详情", headerBackTitle: "返回" }}
        />
        <Stack.Screen
          name="MemberPaymentSuccess"
          component={MemberPaymentSuccessScreen}
          options={{
            title: "支付成功",
            headerBackTitle: "返回",
            // 成功后禁止返回,只能从两个按钮跳走
            gestureEnabled: false,
            headerLeft: () => null,
          }}
        />
        {/* 后续 1:1 移植的页面占位注册 — 保证 tab 页面里点击跳转不 crash */}
        <Stack.Screen
          name="BookDetails"
          component={BookDetailScreen}
          // 页面自带自定义 header(返回 + 更多按钮),隐藏原生 header 避免双 header
          // (对齐原版 mobile 的注册方式)
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="CollectionDetail"
          component={CollectionDetailScreen}
          // 页面自带自定义 header(返回按钮 + 标题 + 占位),隐藏原生 header 避免双 header。
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminUsers"
          component={AdminUsersScreen}
          options={{ title: "用户管理", headerBackTitle: "返回" }}
        />
        <Stack.Screen
          name="Stats"
          component={StatsScreen}
          // 页面自带自定义 header(返回按钮 + 标题 + 占位),隐藏原生 header 避免双 header。
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Search"
          component={SearchScreen}
          options={{ title: "搜索", headerBackTitle: "返回" }}
        />
        {/* P4: TTS 听书主屏 — 1:1 复刻 mobile 旧版 TTSScreen (2201 行) */}
        <Stack.Screen
          name="TTSScreen"
          component={TTSScreen}
          options={{
            title: "听书",
            headerBackTitle: "返回",
            // TTSScreen 内部自带 header 控件(返回/章节列表/设置/收起),
            // 隐藏 Stack header 避免重复。
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}