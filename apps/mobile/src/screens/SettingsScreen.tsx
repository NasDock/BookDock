import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore, useAuthStore, useReaderStore, useTTSStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { notificationService, fileSystemService } from '../services';
import { getApiClient } from '@bookdock/api-client';

export function SettingsScreen() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const themeMode = useThemeStore((state) => state.theme);
  const setThemeMode = useThemeStore((state) => state.setTheme);
  const authStore = useAuthStore();
  const readerStore = useReaderStore();
  const ttsStore = useTTSStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [readingReminder, setReadingReminder] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const theme = getTheme(actualTheme === 'dark');
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleThemeChange = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setThemeMode(newTheme);
  }, [setThemeMode]);

  const handleNotificationsToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const granted = await notificationService.requestPermissions();
      if (granted) {
        setNotificationsEnabled(true);
      } else {
        Alert.alert(
          '需要权限',
          '请在设备设置中开启通知权限，以接收阅读提醒。'
        );
      }
    } else {
      setNotificationsEnabled(false);
      await notificationService.cancelAllNotifications();
    }
  }, []);

  const handleReadingReminderToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      await notificationService.scheduleReadingReminder(20, 0);
      setReadingReminder(true);
    } else {
      await notificationService.cancelAllNotifications();
      setReadingReminder(false);
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      '清除缓存',
      '这将清除所有缓存数据，包括已下载的书籍和阅读进度。此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            try {
              const downloadedBooks = await fileSystemService.listDownloadedBooks();
              for (const file of downloadedBooks) {
                const path = `${fileSystemService['booksDir']}${file}`;
                await fileSystemService.deleteBookFile(path);
              }
              Alert.alert('成功', '缓存已清除');
            } catch {
              Alert.alert('错误', '清除缓存失败');
            }
          },
        },
      ]
    );
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      '删除账户',
      '此操作不可逆，您的所有数据将被永久删除。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const apiClient = getApiClient();
              await apiClient.deleteUser(authStore.user?.id || '');
              authStore.logout();
            } catch {
              Alert.alert('错误', '删除账户失败，请联系客服');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [authStore]);

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionContent, { backgroundColor: theme.colors.surface }]}>
        {children}
      </View>
    </View>
  );

  const renderRow = (
    icon: string,
    label: string,
    value: React.ReactNode,
    onPress?: () => void,
    iconColor?: string
  ) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons name={icon as any} size={20} color={iconColor || theme.colors.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{value}</View>
    </TouchableOpacity>
  );

  const user = authStore.user;
  const isPremium = user?.membership === 'premium';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Account */}
      {renderSection('账户',
        <>
          {renderRow('person-outline', '用户名', <Text style={styles.rowValueText}>{user?.username || '-'}</Text>)}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('mail-outline', '邮箱', <Text style={styles.rowValueText}>{user?.email || '-'}</Text>)}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('crown-outline', '会员类型',
            <View style={styles.rowValueRow}>
              <Text style={styles.rowValueText}>{isPremium ? '高级会员' : '免费用户'}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </View>,
            () => {}
          )}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('star-outline', '升级到 Premium',
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />,
            () => {}
          )}
        </>
      )}

      {/* Preferences */}
      {renderSection('偏好设置',
        <>
          {renderRow('contrast-outline', '外观',
            <View style={styles.rowValueRow}>
              <Text style={styles.rowValueText}>
                {themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </View>,
            () => handleThemeChange(themeMode === 'light' ? 'dark' : 'light')
          )}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('book-outline', '阅读设置',
            <View style={styles.rowValueRow}>
              <Text style={styles.rowValueText}>字体 {readerStore.fontSize}px · 行距 {readerStore.lineHeight}x</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </View>,
            () => {}
          )}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('volume-high-outline', '语音朗读设置',
            <View style={styles.rowValueRow}>
              <Text style={styles.rowValueText}>语速 {ttsStore.playbackRate}x</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </View>,
            () => {}
          )}
        </>
      )}

      {/* Security */}
      {renderSection('安全',
        <>
          {renderRow('lock-closed-outline', '修改密码',
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />,
            () => {}
          )}
        </>
      )}

      {/* About */}
      {renderSection('关于',
        <>
          {renderRow('server-outline', '存储空间',
            <Text style={styles.rowValueText}>0 GB</Text>
          )}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('information-circle-outline', '关于 BookDock',
            <Text style={styles.rowValueText}>v1.0.0</Text>
          )}
        </>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={authStore.logout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
    },
    section: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginBottom: spacing.sm,
      marginLeft: spacing.sm,
    },
    sectionContent: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
    },
    rowLabel: {
      flex: 1,
      marginLeft: spacing.md,
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    rowValue: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    rowValueText: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
    },
    divider: {
      height: 1,
      marginLeft: spacing.md + 28,
    },
    logoutButton: {
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    logoutText: {
      fontSize: fontSizes.md,
      color: theme.colors.error,
      fontWeight: '500',
    },
  });
}
