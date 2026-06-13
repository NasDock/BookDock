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
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useThemeStore, useAuthStore, useReaderStore, useTTSStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { notificationService, fileSystemService } from '../services';
import { getApiClient } from '@bookdock/api-client';
import type { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { participateInternalTest } from '../services/plus';

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const themeMode = useThemeStore((state) => state.theme);
  const setThemeMode = useThemeStore((state) => state.setTheme);
  const { user, isVip, vipTier } = useAuthStore();
  const readerStore = useReaderStore();
  const ttsStore = useTTSStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [readingReminder, setReadingReminder] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [redeemingInternalTest, setRedeemingInternalTest] = useState(false);

  const theme = getTheme(actualTheme === 'dark');
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleThemeChange = useCallback((newTheme: 'light' | 'dark' | 'system') => {
    setThemeMode(newTheme);
    setThemeModalVisible(false);
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
              await apiClient.deleteUser(user?.id || '');
              useAuthStore.getState().logout();
            } catch {
              Alert.alert('错误', '删除账户失败，请联系客服');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [user]);

  const handleJoinInternalTest = useCallback(async () => {
    if (isVip) {
      Alert.alert('已是内测用户', '您已经参与内测，无需重复申请');
      return;
    }

    const plusUserId = await AsyncStorage.getItem('bookdock_plus_user_id');
    if (!plusUserId) {
      Alert.alert('需要登录', '请先登录会员账号', [
        { text: '取消', style: 'cancel' },
        { text: '去登录', onPress: () => navigation.navigate('MemberLogin') },
      ]);
      return;
    }

    try {
      setRedeemingInternalTest(true);
      const vipStartsAt = new Date();
      const vipEndsAt = new Date(vipStartsAt);
      vipEndsAt.setMonth(vipEndsAt.getMonth() + 1);

      const res = await participateInternalTest({
        vipStartsAt: vipStartsAt.toISOString(),
        vipEndsAt: vipEndsAt.toISOString(),
      });

      const payload = res.data?.data;
      if (res.data?.code !== 200 || !payload?.ok) {
        throw new Error(res.data?.message || '参与内测失败');
      }

      await AsyncStorage.setItem('bookdock_vip_status', 'true');
      await AsyncStorage.setItem(
        'bookdock_vip_data',
        JSON.stringify({
          ...payload,
          vipExpiresAt: payload.vipEndsAt,
        })
      );
      await AsyncStorage.setItem('bookdock_vip_updated_at', Date.now().toString());

      // 更新全局状态
      useAuthStore.setState({ isVip: true, vipTier: payload.vipTier || 'BASIC' });

      Alert.alert('成功', '恭喜！您已成功参与内测，获得1个月会员体验');
    } catch (error) {
      console.error('参与内测失败:', error);
      Alert.alert(
        '失败',
        error instanceof Error ? error.message : '参与内测失败，请稍后重试'
      );
    } finally {
      setRedeemingInternalTest(false);
    }
  }, [isVip, navigation]);

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

  const handleMembershipPress = useCallback(async () => {
    const plusToken = await AsyncStorage.getItem('bookdock_plus_token');
    if (!plusToken) {
      navigation.navigate('MemberLogin');
      return;
    }
    if (isVip) {
      navigation.navigate('MemberDetail');
      return;
    }
    navigation.navigate('MemberBenefits');
  }, [isVip, navigation]);

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
          {renderRow('crown-outline', '会员类型',
            <View style={styles.rowValueRow}>
              <Text style={styles.rowValueText}>{vipTier === 'LIFETIME' ? '永久卡' : vipTier === 'BASIC' ? '年卡' : '免费版'}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </View>,
            handleMembershipPress
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
            () => setThemeModalVisible(true)
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

      {/* 内测计划 */}
      {renderSection('内测计划',
        <>
          {renderRow(
            'flask-outline',
            '参与内测',
            <View style={styles.rowValueRow}>
              <Text style={styles.rowValueText}>
                {isVip ? '已参与' : redeemingInternalTest ? '申请中...' : '点击参与'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </View>,
            handleJoinInternalTest
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
            <Text style={styles.rowValueText}>{require('../../package.json').version}</Text>
          )}
        </>
      )}

      {/* Theme Selection Modal */}
      <Modal visible={themeModalVisible} transparent animationType="fade" onRequestClose={() => setThemeModalVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setThemeModalVisible(false)}>
          <View style={[styles.themeModal, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.themeModalTitle, { color: theme.colors.text }]}>选择外观</Text>
            {[
              { key: 'light' as const, label: '浅色', icon: 'sunny-outline' },
              { key: 'dark' as const, label: '深色', icon: 'moon-outline' },
              { key: 'system' as const, label: '跟随系统', icon: 'phone-portrait-outline' },
            ].map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.themeOption, themeMode === item.key && { backgroundColor: theme.colors.primary + '20' }]}
                onPress={() => handleThemeChange(item.key)}
              >
                <Ionicons name={item.icon as any} size={22} color={themeMode === item.key ? theme.colors.primary : theme.colors.text} />
                <Text style={[styles.themeOptionText, { color: themeMode === item.key ? theme.colors.primary : theme.colors.text }]}>{item.label}</Text>
                {themeMode === item.key && <Ionicons name="checkmark" size={22} color={theme.colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>


      {/* Action Buttons */}
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.colors.error }]}
          onPress={useAuthStore.getState().logout}
        >
          <Text style={[styles.actionButtonText, { color: '#fff' }]}>退出登录</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: theme.colors.error + '20', borderWidth: 1, borderColor: theme.colors.error }]}
          onPress={handleDeleteAccount}
        >
          <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>注销会员账号</Text>
        </TouchableOpacity>
      </View>
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
    actionButtonsContainer: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    actionButton: {
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '500',
    },
    themeModal: {
      width: '80%',
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    themeModalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
    themeOptionText: {
      flex: 1,
      fontSize: fontSizes.md,
    },
  });
}
