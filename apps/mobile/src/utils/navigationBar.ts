/**
 * navigationBar.ts — 设置 Android 底部导航栏颜色 (mobile2)
 *
 * expo-navigation-bar 在 mobile2 没有,改用 RN 内置 + Android Native Module
 * (Platform.OS === 'android' 时通过 NativeModules.NavigationBar 调原生 API)。
 *
 * 行为完全对齐 mobile 版本:
 * - setBackgroundColor + setButtonStyle + setVisibility
 * - 出错时只 warn,不抛出
 */

import { NativeModules, Platform } from 'react-native';

interface NavigationBarNativeModule {
  setBackgroundColor: (color: string) => Promise<void>;
  setButtonStyle: (style: 'light' | 'dark') => Promise<void>;
  setVisibility: (visibility: 'visible' | 'hidden') => Promise<void>;
}

const navBarModule: NavigationBarNativeModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules as any).NavigationBar
    : undefined;

/**
 * 设置安卓底部导航栏(小横条)的背景色和按钮样式
 * @param backgroundColor 导航栏背景色(通常与当前页面背景一致)
 * @param isDarkContent 按钮/横条是否为深色(false=白色按钮,true=黑色按钮)
 */
export async function setNavigationBarColor(
  backgroundColor: string,
  isDarkContent: boolean,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!navBarModule) {
    // 没原生模块时静默通过:不报错,只 warn 一次
    console.warn('[NavigationBar] NativeModule not available, skipping');
    return;
  }

  try {
    await navBarModule.setBackgroundColor(backgroundColor);
    await navBarModule.setButtonStyle(isDarkContent ? 'dark' : 'light');
    await navBarModule.setVisibility('visible');
  } catch (error) {
    console.warn('[NavigationBar] Failed to set color:', error);
  }
}

/**
 * 根据背景色亮度自动判断按钮颜色
 * 简单启发式:如果背景色偏浅,用深色按钮;偏深,用浅色按钮
 */
export function isDarkBackground(backgroundColor: string): boolean {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 128;
}

/**
 * 设置导航栏颜色(自动判断按钮颜色)
 */
export async function setNavigationBarAuto(backgroundColor: string): Promise<void> {
  const isDark = isDarkBackground(backgroundColor);
  await setNavigationBarColor(backgroundColor, !isDark);
}