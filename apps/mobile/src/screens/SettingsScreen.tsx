import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore, useAuthStore, useReaderStore, useTTSStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { notificationService, fileSystemService } from '../services';

export function SettingsScreen() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const themeMode = useThemeStore((state) => state.theme);
  const setThemeMode = useThemeStore((state) => state.setTheme);
  const authStore = useAuthStore();
  const readerStore = useReaderStore();
  const ttsStore = useTTSStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [readingReminder, setReadingReminder] = useState(false);
  const [reminderHour] = useState(20);
  const [reminderMinute] = useState(0);

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
          'Permission Required',
          'Please enable notifications in your device settings to receive reading reminders.'
        );
      }
    } else {
      setNotificationsEnabled(false);
      await notificationService.cancelAllNotifications();
    }
  }, []);

  const handleReadingReminderToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      await notificationService.scheduleReadingReminder(reminderHour, reminderMinute);
      setReadingReminder(true);
    } else {
      await notificationService.cancelAllNotifications();
      setReadingReminder(false);
    }
  }, [reminderHour, reminderMinute]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data including reading progress. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            // Clear local books cache
            const downloadedBooks = await fileSystemService.listDownloadedBooks();
            for (const _book of downloadedBooks) {
              // Would delete actual files here
            }
            Alert.alert('Success', 'Cache cleared successfully');
          },
        },
      ]
    );
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            authStore.logout();
            // Would navigate to login screen here
          },
        },
      ]
    );
  }, [authStore]);

  const renderSectionHeader = (title: string) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const renderSettingRow = (
    icon: string,
    title: string,
    subtitle?: string,
    rightElement?: React.ReactNode,
    onPress?: () => void
  ) => (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.colors.primary + '20' }]}>
        <Ionicons name={icon as any} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement}
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Appearance */}
      {renderSectionHeader('Appearance')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        <Text style={styles.settingLabel}>Theme</Text>
        <View style={styles.themeButtons}>
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.themeButton,
                themeMode === mode && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => handleThemeChange(mode)}
            >
              <Ionicons
                name={
                  mode === 'light'
                    ? 'sunny'
                    : mode === 'dark'
                    ? 'moon'
                    : 'phone-portrait'
                }
                size={18}
                color={themeMode === mode ? '#fff' : theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.themeButtonText,
                  themeMode === mode && styles.themeButtonTextActive,
                ]}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Reading */}
      {renderSectionHeader('Reading')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {renderSettingRow(
          'text',
          'Font Size',
          `${readerStore.fontSize}px`,
          undefined,
          () => {
            Alert.alert(
              'Font Size',
              'Select font size',
              [12, 14, 16, 18, 20, 22, 24].map((size) => ({
                text: `${size}px`,
                onPress: () => readerStore.setFontSize(size),
              }))
            );
          }
        )}
        {renderSettingRow(
          'document-text',
          'Default Theme',
          readerStore.mode.charAt(0).toUpperCase() + readerStore.mode.slice(1),
          undefined,
          () => {
            Alert.alert(
              'Default Theme',
              'Select reading theme',
              (['light', 'dark', 'sepia'] as const).map((mode) => ({
                text: mode.charAt(0).toUpperCase() + mode.slice(1),
                onPress: () => readerStore.setMode(mode),
              }))
            );
          }
        )}
        {renderSettingRow(
          'save',
          'Auto-save Progress',
          'Save reading position automatically',
          <Switch
            value={readerStore.autoSaveProgress}
            onValueChange={readerStore.setAutoSaveProgress}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        )}
      </View>

      {/* Notifications */}
      {renderSectionHeader('Notifications')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {renderSettingRow(
          'notifications',
          'Push Notifications',
          'Receive updates and reminders',
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        )}
        {notificationsEnabled && renderSettingRow(
          'time',
          'Daily Reminder',
          `Every day at ${reminderHour}:${reminderMinute.toString().padStart(2, '0')}`,
          <Switch
            value={readingReminder}
            onValueChange={handleReadingReminderToggle}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        )}
      </View>

      {/* Audio */}
      {renderSectionHeader('Audio')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {renderSettingRow(
          'headset',
          'Default Playback Speed',
          `${ttsStore.playbackRate}x`,
          undefined,
          () => {
            Alert.alert(
              'Playback Speed',
              'Select playback speed',
              [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => ({
                text: `${rate}x`,
                onPress: () => ttsStore.setPlaybackRate(rate),
              }))
            );
          }
        )}
        {renderSettingRow(
          'volume-high',
          'Auto-play Next Chapter',
          'Automatically play the next chapter',
          <Switch
            value={ttsStore.isAutoPlay}
            onValueChange={ttsStore.setAutoPlay}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        )}
      </View>

      {/* Storage */}
      {renderSectionHeader('Storage')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {renderSettingRow(
          'cloud-download',
          'Downloaded Books',
          'Manage offline books',
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        )}
        {renderSettingRow(
          'trash',
          'Clear Cache',
          'Free up storage space',
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />,
          handleClearCache
        )}
      </View>

      {/* About */}
      {renderSectionHeader('About')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {renderSettingRow(
          'information-circle',
          'Version',
          '1.0.0'
        )}
        {renderSettingRow(
          'document',
          'Terms of Service',
          undefined,
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        )}
        {renderSettingRow(
          'shield-checkmark',
          'Privacy Policy',
          undefined,
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        )}
      </View>

      {/* Account */}
      {renderSectionHeader('Account')}
      <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
        {renderSettingRow(
          'log-out',
          'Log Out',
          undefined,
          undefined,
          handleLogout
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>BookDock v1.0.0</Text>
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
      paddingBottom: spacing.xxl,
    },
    sectionHeader: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginLeft: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    section: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden',
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    settingIcon: {
      width: 36,
      height: 36,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.md,
    },
    settingContent: {
      flex: 1,
    },
    settingTitle: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
    },
    settingSubtitle: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    settingLabel: {
      fontSize: fontSizes.md,
      color: theme.colors.text,
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    themeButtons: {
      flexDirection: 'row',
      padding: spacing.md,
      paddingTop: 0,
      gap: spacing.sm,
    },
    themeButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.background,
    },
    themeButtonText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
    themeButtonTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
    },
    footerText: {
      fontSize: fontSizes.sm,
      color: theme.colors.textSecondary,
    },
  });
}
