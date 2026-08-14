/**
 * AdminUsersScreen — mobile2 临时占位
 *
 * 管理员用户管理页,后续要 1:1 移植 mobile 旧版时再实现。
 */
import { View, Text, StyleSheet } from 'react-native';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes } from '../utils/theme';

export function AdminUsersScreen() {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
        用户管理占位（仅 admin 角色可见）
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  hint: { fontSize: fontSizes.md, fontStyle: 'italic' },
});
