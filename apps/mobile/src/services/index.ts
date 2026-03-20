import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

class NotificationService {
  private permissionGranted = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      this.permissionGranted = finalStatus === 'granted';
      return this.permissionGranted;
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  async scheduleNotification(
    title: string,
    body: string,
    trigger: Notifications.NotificationTriggerInput | null = null,
    data?: Record<string, unknown>
  ): Promise<string | null> {
    if (!this.permissionGranted) {
      const granted = await this.requestPermissions();
      if (!granted) return null;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title, body, data },
        trigger: trigger || null,
      });
      return id;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  }

  async scheduleReadingReminder(hour: number, minute: number): Promise<string | null> {
    const trigger: Notifications.DailyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    };

    return this.scheduleNotification(
      'Time to Read! 📚',
      "Don't forget to continue your reading session today.",
      trigger
    );
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async getBadgeCount(): Promise<number> {
    return Notifications.getBadgeCountAsync();
  }

  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export const notificationService = new NotificationService();

// File System Service
class FileSystemService {
  private booksDir = `${FileSystem.documentDirectory}books/`;

  async ensureBooksDirectory(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.booksDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.booksDir, { intermediates: true });
    }
  }

  async getBookPath(bookId: string, filename: string): Promise<string> {
    await this.ensureBooksDirectory();
    return `${this.booksDir}${bookId}_${filename}`;
  }

  async saveBookFile(bookId: string, filename: string, content: string): Promise<string> {
    const path = await this.getBookPath(bookId, filename);
    await FileSystem.writeAsStringAsync(path, content);
    return path;
  }

  async readBookFile(path: string): Promise<string | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        return await FileSystem.readAsStringAsync(path);
      }
      return null;
    } catch (error) {
      console.error('Failed to read book file:', error);
      return null;
    }
  }

  async deleteBookFile(path: string): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(path);
      }
    } catch (error) {
      console.error('Failed to delete book file:', error);
    }
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(path, { size: true });
      if (fileInfo.exists && 'size' in fileInfo) {
        return fileInfo.size;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  async listDownloadedBooks(): Promise<string[]> {
    try {
      await this.ensureBooksDirectory();
      const files = await FileSystem.readDirectoryAsync(this.booksDir);
      return files;
    } catch {
      return [];
    }
  }

  async getStorageInfo(): Promise<{ used: number; total: number }> {
    try {
      const info = await FileSystem.getFreeDiskStorageAsync();
      return { used: 0, total: info };
    } catch {
      return { used: 0, total: 0 };
    }
  }
}

export const fileSystemService = new FileSystemService();

// Sharing Service
class SharingService {
  async isAvailable(): Promise<boolean> {
    return await Sharing.isAvailableAsync();
  }

  async shareFile(uri: string, mimeType?: string): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new Error('Sharing is not available on this device');
    }

    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: 'Share Book',
    });
  }

  async shareText(text: string, _title?: string): Promise<void> {
    if (Platform.OS === 'web') {
      await WebBrowser.openBrowserAsync(
        `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`
      );
    } else {
      // On native, we can use the clipboard or a share sheet
      // For simplicity, we'll use the file sharing approach
      const tempPath = `${FileSystem.cacheDirectory}share_text.txt`;
      await FileSystem.writeAsStringAsync(tempPath, text);
      await this.shareFile(tempPath, 'text/plain');
    }
  }

  async shareBook(book: { title: string; author: string; localPath?: string }): Promise<void> {
    if (book.localPath) {
      await this.shareFile(book.localPath);
    } else {
      const shareText = `Check out "${book.title}" by ${book.author} on BookDock!`;
      await this.shareText(shareText);
    }
  }
}

export const sharingService = new SharingService();
