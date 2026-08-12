/**
 * membershipGate.ts
 *
 * iOS / Android 端的"会员购买"开关(2026-08-12 加)。
 * - iOS:不开放会员购买(没有微信支付 SDK 集成 + 政策性不允许),所有入口置灰 + 弹友好提示。
 * - Android:开放会员购买(走微信支付,后续可接入支付宝)。
 *
 * 使用约定:
 *  - 入口(ProfileScreen / SettingsScreen / StatsScreen / MemberDetailScreen)
 *    在用户触发"开通会员"动作时,先用 `isMembershipPurchaseAvailable()` 判断,
 *    不通过时弹 `MEMBERSHIP_PURCHASE_DISABLED_ALERT` 并 return。
 *  - 不要在无条件渲染里调用 Alert(避免屏幕首次挂载时弹窗),只在用户触发的事件里调。
 */

import { Alert, Platform } from 'react-native';

export const isMembershipPurchaseAvailable = (): boolean => {
  return Platform.OS === 'android';
};

export const MEMBERSHIP_PURCHASE_DISABLED_TITLE = 'iOS 暂未开通会员购买';

export const MEMBERSHIP_PURCHASE_DISABLED_MESSAGE =
  '当前 BookDock iOS 版本暂未提供会员购买功能。\n\n如需开通会员,请前往 Android 版本,或访问官网 www.audiodock.cn。';

/**
 * 弹一个标准 alert,告诉 iOS 用户会员购买暂未开放。
 * 返回 Promise<void>,便于调用方 await 后 return。
 */
export const alertMembershipPurchaseUnavailable = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    Alert.alert(
      MEMBERSHIP_PURCHASE_DISABLED_TITLE,
      MEMBERSHIP_PURCHASE_DISABLED_MESSAGE,
      [{ text: '好的', onPress: () => resolve() }],
      { onDismiss: () => resolve() },
    );
  });
};