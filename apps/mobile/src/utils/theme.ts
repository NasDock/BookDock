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
  warning: '#F59E0B',
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
  warning: '#FBBF24',
};

export function getTheme(isDark: boolean): Theme {
  return {
    dark: isDark,
    colors: isDark ? darkColors : lightColors,
  };
}

export function useThemeColors(actualTheme: 'light' | 'dark'): ThemeColors {
  return actualTheme === 'dark' ? darkColors : lightColors;
}

// Common spacing values
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Common font sizes
export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Common border radius
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};
