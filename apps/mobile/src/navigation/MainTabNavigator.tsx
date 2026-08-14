/**
 * MainTabNavigator — mobile2 版本,1:1 复刻 mobile/src/navigation/MainTabNavigator.tsx
 *
 * 3 个 tab:推荐 / 书仓 / 我的
 * TTSMiniPlayer 在 P4 落地,挂到 Tab.Navigator 兄弟节点位置,绝对定位底部覆盖 tab 栏。
 *
 * 主要替换点:
 * - @expo/vector-icons → react-native-vector-icons/Ionicons
 * - settings: 三 tab 的 tabBarIcon / title / headerTitle 跟 mobile 旧版一致
 */

import type { JSX } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { View } from 'react-native';
import { LibraryScreen } from '../screens/LibraryScreen';
import { RecommendScreen } from '../screens/RecommendScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TTSMiniPlayer } from '../components/TTSMiniPlayer';
import { useThemeStore } from '../stores';
import { getTheme } from '../utils/theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabNavigator(): JSX.Element {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
          },
          headerStyle: {
            backgroundColor: theme.colors.background,
            // 去掉 header 底边框/阴影 — 用户只要求这一项:
            //   iOS — RN 默认会渲底 hairline + 1px shadow
            //   Android — 默认 elevation=4 留阴影
            // mobile 原版没禁,expo 上视觉差较小;mobile2 在 RN-CLI 默认
            // 下底边阴影明显,按用户要求关掉。
            height: 85, // RN 默认 header 高度 ≈ 56,不设置会被 shadowOffset/opacity/width 影响
            borderBottomWidth: 0,
            borderBottomColor: 'transparent',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
            elevation: 0, // Android
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerShadowVisible: false, // iOS 显式关底阴影(react-navigation v6+ 官方字段)
        }}
      >
        <Tab.Screen
          name="Recommend"
          component={RecommendScreen}
          options={{
            title: '推荐',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="sparkles" size={size} color={color} />
            ),
            headerTitle: '推荐',
          }}
        />
        <Tab.Screen
          name="Library"
          component={LibraryScreen}
          options={{
            title: '书仓',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="library" size={size} color={color} />
            ),
            headerTitle: '我的书仓',
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: '我的',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
            headerTitle: '',
          }}
        />
      </Tab.Navigator>
      {/* P4: 全局底部 mini 播放器,绝对定位覆盖 tabBar 上方
          (mobile src/style 定位 bottom: 48,对应 tab 栏 height ≈ 49-56;数值后续若重叠再调) */}
      <TTSMiniPlayer />
    </View>
  );
}
