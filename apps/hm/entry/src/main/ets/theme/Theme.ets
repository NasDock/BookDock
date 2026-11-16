// [API 23+] theme/Theme.ets — 1:1 对齐 mobile utils/theme.ts
// mobile 端 light/dark 调色板、spacing、fontSize、borderRadius 全部沿用,
// 18 页面用 getTheme(isDark) 一个开关切换,响应式刷新通过监听 ConfigurationConstant.COLOR_MODE。
import { ConfigurationConstant } from '@kit.AbilityKit';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

export const lightColors: ThemeColors = {
  primary: '#4A90D9',
  secondary: '#6B7280',
  background: '#FFFFFF',
  surface: '#F3F4F6',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B'
};

export const darkColors: ThemeColors = {
  primary: '#60A5FA',
  secondary: '#9CA3AF',
  background: '#111827',
  surface: '#1F2937',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  border: '#374151',
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24'
};

export function getTheme(isDark: boolean): Theme {
  return {
    dark: isDark,
    colors: isDark ? darkColors : lightColors
  };
}

export function isSystemDark(configColorMode: ConfigurationConstant.ColorMode): boolean {
  return configColorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
}

// ─── 通用尺寸(mobile 原版一致) ─────────────────────────────────

export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export const spacing: Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};

export interface FontSizes {
  xs: number;
  s: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
  xxxxl: number;
}

export const fontSizes: FontSizes = {
  xs: 12,
  s: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40
};

export interface BorderRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export const borderRadius: BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999
};

// ─── ThemeStore: 对齐 mobile themeStore ──────────────────────────
// 持久化 + 响应式订阅。ArkTS 没有 zustand,用单例 + AppStorage 简化。

export type ThemeMode = 'light' | 'dark' | 'system';

@Observed
export class ThemeStore {
  private static instance: ThemeStore | null = null;

  mode: ThemeMode = 'system';
  systemDark: boolean = false;

  static shared(): ThemeStore {
    if (!ThemeStore.instance) {
      ThemeStore.instance = new ThemeStore();
    }
    return ThemeStore.instance;
  }

  async load(): Promise<void> {
    const raw = await PreferencesStore.readString(PrefKey.THEME_MODE, 'system');
    this.mode = raw as ThemeMode;
  }

  async setMode(mode: ThemeMode): Promise<void> {
    this.mode = mode;
    await PreferencesStore.writeString(PrefKey.THEME_MODE, mode);
  }

  setSystemDark(dark: boolean): void {
    this.systemDark = dark;
  }

  /** 是否真正深色:mode='dark' 或 mode='system' 且系统是深色 */
  isActualDark(): boolean {
    if (this.mode === 'dark') {
      return true;
    }
    if (this.mode === 'light') {
      return false;
    }
    return this.systemDark;
  }

  getCurrentTheme(): Theme {
    return getTheme(this.isActualDark());
  }
}