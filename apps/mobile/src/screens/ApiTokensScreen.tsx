import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getApiClient, type ApiKey, type CreatedApiKey } from '@bookdock/api-client';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import type { RootStackParamList } from '../navigation/types';

function formatDate(value: string | null) {
  if (!value) return '永不过期';
  return new Date(value).toLocaleDateString('zh-CN');
}

export function ApiTokensScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [createVisible, setCreateVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('0');
  const [creating, setCreating] = useState(false);

  const [createdToken, setCreatedToken] = useState<CreatedApiKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getApiClient().getApiKeys();
      if (res.success) setKeys(res.data || []);
      else Alert.alert('加载失败', res.error || res.message || '未知错误');
    } catch (e: any) {
      Alert.alert('加载失败', e?.response?.data?.message || e?.message || '未知错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await getApiClient().createApiKey({
        name: newName.trim(),
        expiresInDays: Number(expiresInDays) || 0,
      });
      if (res.success && res.data) {
        setCreateVisible(false);
        setCreatedToken(res.data);
        setNewName('');
        setExpiresInDays('0');
        void load();
      } else {
        Alert.alert('创建失败', res.error || res.message || '未知错误');
      }
    } catch (e: any) {
      Alert.alert('创建失败', e?.response?.data?.message || e?.message || '未知错误');
    } finally {
      setCreating(false);
    }
  }, [newName, expiresInDays, load]);

  const handleToggle = useCallback((key: ApiKey) => {
    void (async () => {
      try {
        const res = await getApiClient().updateApiKey(key.id, { isActive: !key.isActive });
        if (res.success) void load();
        else Alert.alert('操作失败', res.error || res.message || '未知错误');
      } catch (e: any) {
        Alert.alert('操作失败', e?.response?.data?.message || e?.message || '未知错误');
      }
    })();
  }, [load]);

  const handleRename = useCallback((key: ApiKey) => {
    Alert.prompt(
      '重命名令牌',
      '输入新的名称',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '保存',
          onPress: async (value?: string) => {
            if (!value?.trim()) return;
            try {
              const res = await getApiClient().updateApiKey(key.id, { name: value.trim() });
              if (res.success) void load();
              else Alert.alert('保存失败', res.error || res.message || '未知错误');
            } catch (e: any) {
              Alert.alert('保存失败', e?.response?.data?.message || e?.message || '未知错误');
            }
          },
        },
      ],
      'plain-text',
      key.name,
    );
  }, [load]);

  const handleDelete = useCallback((key: ApiKey) => {
    Alert.alert(
      '删除令牌',
      `确定删除「${key.name}」吗？使用此令牌的应用将立即无法访问。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await getApiClient().deleteApiKey(key.id);
              if (res.success) void load();
              else Alert.alert('删除失败', res.error || res.message || '未知错误');
            } catch (e: any) {
              Alert.alert('删除失败', e?.response?.data?.message || e?.message || '未知错误');
            }
          },
        },
      ],
    );
  }, [load]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          令牌可用于在 NAS、脚本或其他设备上访问书仓内容（账号信息除外）。令牌只在创建时显示一次，请妥善保存。
        </Text>

        {loading ? (
          <ActivityIndicator style={styles.loading} color={theme.colors.primary} />
        ) : keys.length === 0 ? (
          <Text style={styles.empty}>暂无令牌，点击下方按钮创建</Text>
        ) : (
          keys.map((key) => (
            <View key={key.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.cardTitle}>{key.name}</Text>
                <View style={[styles.badge, key.isActive ? styles.badgeOn : styles.badgeOff]}>
                  <Text style={[styles.badgeText, key.isActive ? styles.badgeTextOn : styles.badgeTextOff]}>
                    {key.isActive ? '启用' : '已停用'}
                  </Text>
                </View>
              </View>
              <Text style={styles.meta}>创建于 {formatDate(key.createdAt)}</Text>
              <Text style={styles.meta}>到期 {formatDate(key.expiresAt)}</Text>
              <Text style={styles.meta}>
                {key.lastUsedAt
                  ? `最近使用 ${new Date(key.lastUsedAt).toLocaleString('zh-CN')}`
                  : '从未使用'}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleRename(key)}>
                  <Text style={styles.actionText}>改名</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggle(key)}>
                  <Text style={styles.actionText}>{key.isActive ? '停用' : '启用'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(key)}>
                  <Text style={[styles.actionText, { color: '#ef4444' }]}>删除</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCreateVisible(true)}
      >
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>新建令牌</Text>
      </TouchableOpacity>

      {/* 创建弹窗 */}
      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setCreateVisible(false)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>新建 API 令牌</Text>
            <Text style={styles.inputLabel}>名称</Text>
            <TextInput
              style={styles.input}
              placeholder="例如：NAS 同步"
              placeholderTextColor={theme.colors.textSecondary}
              value={newName}
              onChangeText={setNewName}
            />
            <Text style={styles.inputLabel}>有效天数（0 表示永不过期）</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={expiresInDays}
              onChangeText={setExpiresInDays}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSecondary]} onPress={() => setCreateVisible(false)}>
                <Text style={styles.modalBtnTextSecondary}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.colors.primary }, creating && { opacity: 0.6 }]}
                disabled={creating || !newName.trim()}
                onPress={() => void handleCreate()}
              >
                <Text style={styles.modalBtnText}>{creating ? '创建中...' : '创建'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 明文展示一次 */}
      <Modal visible={!!createdToken} transparent animationType="fade" onRequestClose={() => setCreatedToken(null)}>
        <Pressable style={styles.overlay} onPress={() => setCreatedToken(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>令牌已创建</Text>
            <Text style={styles.warn}>请立即复制并保存，关闭后无法再次查看明文。</Text>
            <View style={styles.tokenBox}>
              <Text style={styles.tokenText}>{createdToken?.token}</Text>
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.colors.primary, alignSelf: 'stretch' }]}
              onPress={() => setCreatedToken(null)}
            >
              <Text style={styles.modalBtnText}>我已保存</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: spacing.lg, paddingBottom: 100 },
    hint: { fontSize: fontSizes.sm, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
    loading: { marginTop: 60 },
    empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 60, fontSize: fontSizes.md },
    card: { backgroundColor: theme.colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    cardTitle: { flex: 1, fontSize: fontSizes.md, fontWeight: '600', color: theme.colors.text },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    badgeOn: { backgroundColor: '#dcfce7' },
    badgeOff: { backgroundColor: '#f3f4f6' },
    badgeText: { fontSize: 11 },
    badgeTextOn: { color: '#166534' },
    badgeTextOff: { color: '#6b7280' },
    meta: { fontSize: fontSizes.xs, color: theme.colors.textSecondary, marginTop: 2 },
    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
    actionBtn: { paddingVertical: 4, paddingHorizontal: 8 },
    actionText: { fontSize: fontSizes.sm, color: theme.colors.primary },
    fab: { position: 'absolute', bottom: 24, left: spacing.lg, right: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: borderRadius.lg },
    fabText: { color: '#fff', fontSize: fontSizes.md, fontWeight: '600' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modal: { width: '100%', backgroundColor: theme.colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg },
    modalTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: theme.colors.text, marginBottom: spacing.md },
    inputLabel: { fontSize: fontSizes.sm, color: theme.colors.textSecondary, marginBottom: 4, marginTop: spacing.sm },
    input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, color: theme.colors.text, fontSize: fontSizes.md },
    modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    modalBtn: { flex: 1, paddingVertical: 12, borderRadius: borderRadius.md, alignItems: 'center' },
    modalBtnSecondary: { backgroundColor: theme.colors.border },
    modalBtnText: { color: '#fff', fontWeight: '600', fontSize: fontSizes.md },
    modalBtnTextSecondary: { color: theme.colors.text, fontWeight: '600', fontSize: fontSizes.md },
    warn: { fontSize: fontSizes.sm, color: '#f59e0b', marginBottom: spacing.md, lineHeight: 20 },
    tokenBox: { backgroundColor: theme.colors.background, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
    tokenText: { fontFamily: 'monospace', fontSize: fontSizes.sm, color: theme.colors.text, lineHeight: 20 },
  });
}
