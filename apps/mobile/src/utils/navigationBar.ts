import * as NavigationBar from 'expo-navigation-bar';
import { Platform } from 'react-native';

/**
 * 设置安卓底部导航栏（小横条）的背景色和按钮样式
 * @param backgroundColor 导航栏背景色（通常与当前页面背景一致）
 * @param isDarkContent 按钮/横条是否为深色（false=白色按钮，true=黑色按钮）
 */
export async function setNavigationBarColor(
  backgroundColor: string,
  isDarkContent: boolean
) {
  if (Platform.OS !== 'android') return;

  try {
    await NavigationBar.setBackgroundColorAsync(backgroundColor);
    await NavigationBar.setButtonStyleAsync(isDarkContent ? 'dark' : 'light');
    await NavigationBar.setVisibilityAsync('visible');
  } catch (error) {
    console.warn('[NavigationBar] Failed to set color:', error);
  }
}

/**
 * 根据背景色亮度自动判断按钮颜色
 * 简单启发式：如果背景色偏浅，用深色按钮；偏深，用浅色按钮
 */
export function isDarkBackground(backgroundColor: string): boolean {
  // 提取 RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // 计算亮度 (ITU-R BT.709)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 128;
}

/**
 * 设置导航栏颜色（自动判断按钮颜色）
 */
export async function setNavigationBarAuto(backgroundColor: string) {
  const isDark = isDarkBackground(backgroundColor);
  await setNavigationBarColor(backgroundColor, !isDark);
}
