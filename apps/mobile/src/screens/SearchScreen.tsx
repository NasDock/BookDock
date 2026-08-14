/**
 * SearchScreen — mobile2 临时占位
 *
 * mobile 旧版有完整 SearchScreen(搜索 + 结果列表 + 历史记录),后续要 1:1 移植时再实现。
 * 当前只放一个简单 input,保证点首页/书库的搜索框不会 crash。
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const [query, setQuery] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: '搜索' });
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <TextInput
          style={[styles.input, { color: theme.colors.text }]}
          placeholder="搜索书名、作者..."
          placeholderTextColor={theme.colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      </View>
      <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
        搜索结果占位 — 完整 SearchScreen 待后续 1:1 移植。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: { flex: 1, fontSize: fontSizes.md, paddingVertical: 4 },
  hint: { fontSize: fontSizes.sm, marginTop: spacing.md, fontStyle: 'italic', textAlign: 'center' },
});
