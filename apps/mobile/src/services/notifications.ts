/**
 * NotificationService — mobile2 版本
 *
 * expo-notifications → @notifee/react-native 替换:
 * - requestPermissions → notifee.requestPermission()
 * - scheduleNotification (通用) → notifee.createTriggerNotification
 * - scheduleReadingReminder → 同上,用 TimestampTrigger
 * - cancelAllNotifications → notifee.cancelAllNotifications()
 * - getBadgeCount/setBadgeCount → notifee.getBadgeCount/setBadgeCount
 * - addNotificationReceivedListener → notifee.onForegroundEvent (FOREGROUND)
 * - addNotificationResponseListener → notifee.onBackgroundEvent (BACKGROUND)
 *   (返回的 Subscription 类型与原 expo 不同,这里用 EventSubscription 兼容)
 *
 * 接口形状与 mobile/src/services/index.ts 里的 NotificationService 对齐,
 * 让调用方代码零改动:SettingsScreen 等仍然 `import { notificationService } from '../services'`。
 */

import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  EventType,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';

export interface NotificationContent {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * notifee 没有导出 EventSubscription,用 Subscription 兜底(类型)。
 * Subscribe/Unsubscribe 接口形状与 expo-notifications 的 Subscription 对齐。
 */
export interface NotificationSubscription {
  unsubscribe: () => void;
}

class NotificationService {
  private permissionGranted = false;

  async requestPermissions(): Promise<boolean> {
    try {
      const settings = await notifee.requestPermission();
      this.permissionGranted =
        settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
        settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
      return this.permissionGranted;
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  async scheduleNotification(
    title: string,
    body: string,
    trigger: TimestampTrigger | null = null,
    data?: Record<string, unknown>,
  ): Promise<string | null> {
    if (!this.permissionGranted) {
      const granted = await this.requestPermissions();
      if (!granted) return null;
    }

    try {
      // 必须先创建一个 channel,Android 8+ 需要
      const channelId = await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
        importance: AndroidImportance.DEFAULT,
      });

      const id = await notifee.createTriggerNotification(
        {
          title,
          body,
          data: data as any,
          android: { channelId, smallIcon: 'ic_launcher' },
        },
        trigger ?? { type: TriggerType.TIMESTAMP, timestamp: Date.now() },
      );
      return id;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  }

  /**
   * 阅读提醒:每天 hour:minute 触发
   */
  async scheduleReadingReminder(hour: number, minute: number): Promise<string | null> {
    const fireDate = new Date();
    fireDate.setHours(hour, minute, 0, 0);
    if (fireDate.getTime() <= Date.now()) {
      // 已经过了今天的 hour:minute,推到明天
      fireDate.setDate(fireDate.getDate() + 1);
    }

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: fireDate.getTime(),
      repeatFrequency: 1, // 1 = DAILY(单位天,@notifee/react-native 的 RepeatFrequency.DAILY)
    };

    return this.scheduleNotification(
      'Time to Read! 📚',
      "Don't forget to continue your reading session today.",
      trigger,
    );
  }

  async cancelAllNotifications(): Promise<void> {
    await notifee.cancelAllNotifications();
  }

  async getBadgeCount(): Promise<number> {
    return notifee.getBadgeCount();
  }

  async setBadgeCount(count: number): Promise<void> {
    await notifee.setBadgeCount(count);
  }

  /**
   * 前台通知监听
   * notifee 的 onForegroundEvent 与 expo 的 addNotificationReceivedListener 行为略有差异:
   * - expo 触发于"通知到达"(前台时也会触发)
   * - notifee 的 onForegroundEvent 是"前台事件总线",所有事件都过这里
   * 这里过滤 DELIVERED 类型以尽量对齐 expo 语义。
   */
  addNotificationReceivedListener(
    callback: (notification: any) => void,
  ): NotificationSubscription {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.DELIVERED && detail.notification) {
        callback(detail.notification);
      }
    });
    return { unsubscribe: unsub };
  }

  /**
   * 后台通知点击监听
   * notifee.onBackgroundEvent 需要在 index.js 顶部注册,这里返回前台等价物。
   * 后台点击的真实处理通常放在 index.js(由 RN 后台事件触发);
   * 这个前台事件订阅保证 App 在前台时点击能拿到回调。
   */
  addNotificationResponseListener(
    callback: (response: { notification: any }) => void,
  ): NotificationSubscription {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification) {
        callback({ notification: detail.notification });
      }
    });
    return { unsubscribe: unsub };
  }
}

export const notificationService = new NotificationService();