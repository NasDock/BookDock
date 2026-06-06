import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useRef } from "react";
import { LoginScreen } from "../screens/LoginScreen";
import { MemberBenefitsScreen } from "../screens/MemberBenefitsScreen";
import { MemberDetailScreen } from "../screens/MemberDetailScreen";
import { MemberLoginScreen } from "../screens/MemberLoginScreen";
import { ReaderScreen } from "../screens/ReaderScreen";
import { ScanLoginScreen } from "../screens/ScanLoginScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TTSScreen } from "../screens/TTSScreen";
import { AdminUsersScreen } from "../screens/AdminUsersScreen";
import { CollectionDetailScreen } from "../screens/CollectionDetailScreen";
import { BookDetailScreen } from "../screens/BookDetailScreen";
import { AuthorDetailScreen } from "../screens/AuthorDetailScreen";
import { NotesScreen } from "../screens/NotesScreen";
import { SearchScreen } from "../screens/SearchScreen";
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
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigationRef = useNavigationContainerRef();
  const routeNameRef = useRef<string | undefined>();

  // 监听路由变化：从阅读器返回时恢复导航栏颜色
  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const currentRoute = navigationRef.getCurrentRoute();
      const currentName = currentRoute?.name;
      const previousName = routeNameRef.current;
      routeNameRef.current = currentName;

      // 从阅读器页面返回到非阅读器页面时，恢复 App 主题导航栏颜色
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
              name="Reader"
              component={ReaderScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="TTSScreen"
              component={TTSScreen}
              options={{
                title: "听书",
                headerBackTitle: "返回",
              }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                title: "设置",
                headerBackTitle: "返回",
              }}
            />
            <Stack.Screen
              name="AdminUsers"
              component={AdminUsersScreen}
              options={{
                title: "用户管理",
                headerBackTitle: "返回",
              }}
            />
            <Stack.Screen
              name="BookDetails"
              component={BookDetailScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="CollectionDetail"
              component={CollectionDetailScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AuthorDetail"
              component={AuthorDetailScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Search"
              component={SearchScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Notes"
              component={NotesScreen}
              options={{ headerShown: false }}
            />
          </>
        )}
        <Stack.Screen
          name="MemberLogin"
          component={MemberLoginScreen}
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
          name="ScanLogin"
          component={ScanLoginScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
