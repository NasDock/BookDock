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
      await notificationService.scheduleReadingReminder(20, 0);
      setReadingReminder(true);
    } else {
      await notificationService.cancelAllNotifications();
      setReadingReminder(false);
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data including downloaded books and reading progress. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const downloadedBooks = await fileSystemService.listDownloadedBooks();
              for (const file of downloadedBooks) {
                const path = `${fileSystemService['booksDir']}${file}`;
                await fileSystemService.deleteBookFile(path);
              }
              Alert.alert('Success', 'Cache cleared successfully');
            } catch {
              Alert.alert('Error', 'Failed to clear cache');
            }
          },
        },
      ]
    );
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This action is irreversible. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const apiClient = getApiClient();
              // Note: Backend may not have delete account endpoint, this is a placeholder
              await apiClient.deleteUser(authStore.user?.id || '');
              authStore.logout();
            } catch {
              Alert.alert('Error', 'Failed to delete account. Please contact support.');
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
    onPress?: () => void
  ) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons name={icon as any} size={20} color={theme.colors.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{value}</View>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Appearance */}
      {renderSection('Appearance',
        <>
          {renderRow('sunny-outline', 'Light', themeMode === 'light' && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />, () => handleThemeChange('light'))}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('moon-outline', 'Dark', themeMode === 'dark' && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />, () => handleThemeChange('dark'))}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('contrast-outline', 'System', themeMode === 'system' && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />, () => handleThemeChange('system'))}
        </>
      )}

      {/* Notifications */}
      {renderSection('Notifications',
        <>
          {renderRow('notifications-outline', 'Enable Notifications',
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            />
          )}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('time-outline', 'Reading Reminder (8:00 PM)',
            <Switch
              value={readingReminder}
              onValueChange={handleReadingReminderToggle}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            />
          )}
        </>
      )}

      {/* Reader Preferences */}
      {renderSection('Reader',
        <>
          {renderRow('text-outline', 'Font Size', <Text style={styles.rowValueText}>{readerStore.fontSize}px</Text>)}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('resize-outline', 'Line Height', <Text style={styles.rowValueText}>{readerStore.lineHeight}x</Text>)}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('save-outline', 'Auto Save Progress',
            <Switch
              value={readerStore.autoSaveProgress}
              onValueChange={(v) => readerStore.setAutoSaveProgress(v)}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            />
          )}
        </>
      )}

      {/* TTS Preferences */}
      {renderSection('Text to Speech',
        <>
          {renderRow('speedometer-outline', 'Playback Rate', <Text style={styles.rowValueText}>{ttsStore.playbackRate}x</Text>)}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          {renderRow('volume-medium-outline', 'Volume', <Text style={styles.rowValueText}>{Math.round(ttsStore.volume * 100)}%</Text>)}
        </>
      )}

      {/* Data Management */}
      {renderSection('Data',
        <>
          <TouchableOpacity style={styles.row} onPress={handleClearCache}>
            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
            <Text style={[styles.rowLabel, { color: theme.colors.error }]}>Clear Cache</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
            <Ionicons name="close-circle-outline" size={20} color={theme.colors.error} />
            <Text style={[styles.rowLabel, { color: theme.colors.error }]}>Delete Account</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            )}
          </TouchableOpacity>
        </>
      )}

      {/* About */}
      <View style={styles.about}>
        <Text style={[styles.aboutText, { color: theme.colors.textSecondary }]}>
          BookDock v1.0.0
        </Text>
        <Text style={[styles.aboutText, { color: theme.colors.textSecondary }]}>
          Built for NAS users
        </Text>
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
      textTransform: 'uppercase',
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
    rowValueText: {
      fontSize: fontSizes.md,
      color: theme.colors.textSecondary,
    },
    divider: {
      height: 1,
      marginLeft: spacing.md + 28,
    },
    about: {
      alignItems: 'center',
      marginTop: spacing.xl,
      gap: spacing.xs,
    },
    aboutText: {
      fontSize: fontSizes.sm,
    },
  });
}
