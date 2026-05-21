import type { JSX } from 'react';
import { useState, useRef, useEffect } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { MainTabParamList } from './types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { useNavigation } from '@react-navigation/native';
import { getApiClient } from '@bookdock/api-client';

const Tab = createBottomTabNavigator<MainTabParamList>();

function ProfileHeaderLeft() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  return (
    <TouchableOpacity
      style={{ marginLeft: 16, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      onPress={() => navigation.navigate('MemberLogin', { initialMode: 'scan' })}
    >
      <Ionicons name="scan-outline" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

function ProfileHeaderRight() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  return (
    <TouchableOpacity
      style={{ marginRight: 16, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      onPress={() => navigation.navigate('Settings')}
    >
      <Ionicons name="settings-outline" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

function ProfileHeaderSyncButton() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const { user } = useAuthStore();
  const [menuVisible, setMenuVisible] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const handleSync = async (type: 'full' | 'incremental') => {
    const title = type === 'full' ? '全量更新' : '增量更新';
    const message =
      type === 'full'
        ? '扫描所有本地书籍，新增数据库不存在的，标记已删除的，重新抓取所有现有书籍的元数据。'
        : '仅扫描新数据，现有数据不做处理。';

    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: async () => {
          setSyncing(type);
          try {
            const api = getApiClient();
            const res = await api.syncBooks(type);
            Alert.alert('同步完成', res.data?.message || `${type === 'full' ? '全量' : '增量'}更新成功`);
          } catch (e: any) {
            Alert.alert('同步失败', e?.response?.data?.message || '请求失败');
          } finally {
            setSyncing(null);
            setMenuVisible(false);
          }
        },
      },
    ]);
  };

  if (user?.role !== 'admin') return null;

  return (
    <>
      <TouchableOpacity
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        onPress={() => setMenuVisible(true)}
      >
        <Ionicons name="add" size={26} color={theme.colors.text} />
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setMenuVisible(false)}>
          <View
            style={{
              position: 'absolute',
              top: 60,
              right: 16,
              width: 160,
              backgroundColor: theme.colors.surface,
              borderRadius: borderRadius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 5,
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.md,
                opacity: syncing ? 0.5 : 1,
              }}
              onPress={() => handleSync('incremental')}
              disabled={!!syncing}
            >
              {syncing === 'incremental' ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="add-circle-outline" size={18} color={theme.colors.text} />
              )}
              <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>增量更新</Text>
            </TouchableOpacity>

            <View style={{ height: 1, backgroundColor: theme.colors.border, marginHorizontal: spacing.md }} />

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                padding: spacing.md,
                opacity: syncing ? 0.5 : 1,
              }}
              onPress={() => handleSync('full')}
              disabled={!!syncing}
            >
              {syncing === 'full' ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="refresh-circle-outline" size={18} color={theme.colors.text} />
              )}
              <Text style={{ fontSize: fontSizes.md, color: theme.colors.text }}>全量更新</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function MainTabNavigator() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
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
          headerLeft: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
              <ProfileHeaderSyncButton />
              <ProfileHeaderLeft />
            </View>
          ),
          headerRight: () => <ProfileHeaderRight />,
        }}
      />
    </Tab.Navigator>
  );
}
