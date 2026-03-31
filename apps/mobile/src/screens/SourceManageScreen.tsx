import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { apiClient, type EbookSource, type CreateSourceInput, type SourceType } from '../services/api';

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string; icon: string }[] = [
  { value: 'webdav', label: 'WebDAV', icon: 'cloud' },
  { value: 'smb', label: 'SMB / SMB2', icon: 'folder' },
  { value: 'ftp', label: 'FTP / FTPS', icon: 'server' },
];

const FORMAT_OPTIONS = ['epub', 'pdf', 'mobi', 'txt', 'azw3', 'fb2', 'djvu'];

interface FormState {
  name: string;
  type: SourceType;
  // WebDAV
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavBasePath: string;
  // SMB
  smbShare: string;
  smbUsername: string;
  smbPassword: string;
  smbDomain: string;
  smbPort: string;
  smbBasePath: string;
  // FTP
  ftpHost: string;
  ftpPort: string;
  ftpUsername: string;
  ftpPassword: string;
  ftpSecure: boolean;
  ftpBasePath: string;
  // Common
  autoSync: boolean;
  syncIntervalSecs: string;
  formats: string[];
}

const emptyForm = (type: SourceType = 'webdav'): FormState => ({
  name: '',
  type,
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavBasePath: '',
  smbShare: '',
  smbUsername: '',
  smbPassword: '',
  smbDomain: '',
  smbPort: '445',
  smbBasePath: '',
  ftpHost: '',
  ftpPort: '21',
  ftpUsername: '',
  ftpPassword: '',
  ftpSecure: false,
  ftpBasePath: '',
  autoSync: true,
  syncIntervalSecs: '3600',
  formats: ['epub', 'pdf', 'txt'],
});

export function SourceManageScreen() {
  const actualTheme = useThemeStore((s) => s.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const [sources, setSources] = useState<EbookSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<EbookSource | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.sources.getSources();
      if (res.success && res.data) {
        setSources(res.data);
      }
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const openAddModal = () => {
    setEditingSource(null);
    setForm(emptyForm());
    setTestResult(null);
    setShowModal(true);
  };

  const openEditModal = (source: EbookSource) => {
    setEditingSource(source);
    setTestResult(null);
    const isType = source.type;
    setForm({
      name: source.name,
      type: isType,
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      webdavBasePath: source.basePath || '',
      smbShare: source.url || '',
      smbUsername: source.username || '',
      smbPassword: '',
      smbDomain: '',
      smbPort: '445',
      smbBasePath: source.basePath || '',
      ftpHost: source.host || '',
      ftpPort: '21',
      ftpUsername: source.username || '',
      ftpPassword: '',
      ftpSecure: false,
      ftpBasePath: source.basePath || '',
      autoSync: source.autoSync,
      syncIntervalSecs: String(source.syncIntervalSecs),
      formats: source.formats || ['epub', 'pdf', 'txt'],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSource(null);
    setTestResult(null);
  };

  const buildCreateInput = (): CreateSourceInput => {
    const base = {
      name: form.name,
      type: form.type,
      autoSync: form.autoSync,
      syncIntervalSecs: parseInt(form.syncIntervalSecs) || 3600,
      formats: form.formats,
    };

    if (form.type === 'webdav') {
      return {
        ...base,
        webdavConfig: {
          url: form.webdavUrl,
          username: form.webdavUsername || undefined,
          password: form.webdavPassword || undefined,
          basePath: form.webdavBasePath || undefined,
        },
      };
    } else if (form.type === 'smb') {
      return {
        ...base,
        smbConfig: {
          share: form.smbShare,
          username: form.smbUsername || undefined,
          password: form.smbPassword || undefined,
          domain: form.smbDomain || undefined,
          port: parseInt(form.smbPort) || 445,
          basePath: form.smbBasePath || undefined,
        },
      };
    } else {
      return {
        ...base,
        ftpConfig: {
          host: form.ftpHost,
          port: parseInt(form.ftpPort) || 21,
          username: form.ftpUsername || undefined,
          password: form.ftpPassword || undefined,
          secure: form.ftpSecure,
          basePath: form.ftpBasePath || undefined,
        },
      };
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('错误', '请输入书源名称');
      return;
    }
    setSaving(true);
    try {
      const input = buildCreateInput();
      let res;
      if (editingSource) {
        res = await apiClient.sources.updateSource(editingSource.id, input);
      } else {
        res = await apiClient.sources.createSource(input);
      }
      if (res.success) {
        await loadSources();
        closeModal();
      } else {
        Alert.alert('保存失败', res.error || '未知错误');
      }
    } catch (err) {
      Alert.alert('保存失败', String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (source: EbookSource) => {
    Alert.alert(
      '确认删除',
      `确定要删除书源「${source.name}」吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            const res = await apiClient.sources.deleteSource(source.id);
            if (res.success) {
              setSources((prev) => prev.filter((s) => s.id !== source.id));
            } else {
              Alert.alert('删除失败', res.error || '未知错误');
            }
          },
        },
      ]
    );
  };

  const handleSync = async (source: EbookSource) => {
    setSyncingId(source.id);
    try {
      const res = await apiClient.sources.syncSource(source.id);
      if (res.success && res.data) {
        const { booksAdded, status } = res.data;
        Alert.alert('同步完成', `状态: ${status}\n新增书籍: ${booksAdded}`);
        await loadSources();
      } else {
        Alert.alert('同步失败', res.error || '未知错误');
      }
    } catch (err) {
      Alert.alert('同步失败', String(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const input = buildCreateInput();
      const res = await apiClient.sources.testSourceConfig(input);
      if (res.success && res.data) {
        setTestResult(res.data);
      } else {
        setTestResult({ success: false, error: res.error || '测试失败' });
      }
    } catch (err) {
      setTestResult({ success: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const toggleFormat = (fmt: string) => {
    setForm((prev) => ({
      ...prev,
      formats: prev.formats.includes(fmt)
        ? prev.formats.filter((f) => f !== fmt)
        : [...prev.formats, fmt],
    }));
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const getAddress = (source: EbookSource) => {
    if (source.type === 'ftp') return source.host || '-';
    return source.url || '-';
  };

  const getSourceIcon = (type: SourceType) => {
    return SOURCE_TYPE_OPTIONS.find((s) => s.value === type)?.icon || 'help';
  };

  const renderSourceItem = ({ item }: { item: EbookSource }) => {
    const isSyncing = syncingId === item.id;
    const hasError = !!item.lastError;

    return (
      <View style={[styles.sourceCard, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.sourceHeader}>
          <View style={styles.sourceIconContainer}>
            <Ionicons
              name={getSourceIcon(item.type) as any}
              size={22}
              color={theme.colors.primary}
            />
          </View>
          <View style={styles.sourceInfo}>
            <Text style={[styles.sourceName, { color: theme.colors.text }]}>{item.name}</Text>
            <View style={styles.sourceMeta}>
              <View style={[styles.typeBadge, { backgroundColor: theme.colors.primary + '20' }]}>
                <Text style={[styles.typeBadgeText, { color: theme.colors.primary }]}>
                  {SOURCE_TYPE_OPTIONS.find((s) => s.value === item.type)?.label}
                </Text>
              </View>
              <Text style={[styles.sourceAddress, { color: theme.colors.textSecondary }]}>
                {getAddress(item)}
              </Text>
            </View>
            <View style={styles.sourceStats}>
              <Text style={[styles.sourceStatText, { color: theme.colors.textSecondary }]}>
                📚 {item.bookCount} 本
              </Text>
              {item.lastSyncAt && (
                <Text style={[styles.sourceStatText, { color: theme.colors.textSecondary }]}>
                  🕒 {new Date(item.lastSyncAt).toLocaleDateString('zh-CN')}
                </Text>
              )}
              {hasError && (
                <Text style={[styles.sourceStatText, { color: theme.colors.error }]}>
                  ⚠️ {item.lastError}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.sourceActions}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.primary + '15' }]}
            onPress={() => handleSync(item)}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Ionicons name="sync" size={16} color={theme.colors.primary} />
            )}
            <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>同步</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.border }]}
            onPress={() => openEditModal(item)}
          >
            <Ionicons name="pencil" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.actionButtonText, { color: theme.colors.textSecondary }]}>编辑</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.colors.error + '15' }]}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash" size={16} color={theme.colors.error} />
            <Text style={[styles.actionButtonText, { color: theme.colors.error }]}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderForm = () => (
    <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
      <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity onPress={closeModal}>
            <Text style={[styles.modalCancelText, { color: theme.colors.textSecondary }]}>取消</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
            {editingSource ? '编辑书源' : '添加书源'}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={[styles.modalSaveText, { color: theme.colors.primary }]}>保存</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Name */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: theme.colors.text }]}>书源名称 *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
              placeholder="例如：我的 NAS 书库"
              placeholderTextColor={theme.colors.textSecondary}
              value={form.name}
              onChangeText={(v) => setField('name', v)}
            />
          </View>

          {/* Type selector */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: theme.colors.text }]}>类型</Text>
            <View style={styles.typeSelector}>
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.typeOption,
                    form.type === opt.value
                      ? { backgroundColor: theme.colors.primary }
                      : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                  onPress={() => setField('type', opt.value)}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={18}
                    color={form.type === opt.value ? '#fff' : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeOptionText,
                      { color: form.type === opt.value ? '#fff' : theme.colors.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* WebDAV fields */}
          {form.type === 'webdav' && (
            <>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>WebDAV URL *</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="https://nas.example.com/dav"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.webdavUrl}
                  onChangeText={(v) => setField('webdavUrl', v)}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>用户名</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="（可选）"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.webdavUsername}
                  onChangeText={(v) => setField('webdavUsername', v)}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>密码</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder={editingSource ? '（不修改请留空）' : '（可选）'}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.webdavPassword}
                  onChangeText={(v) => setField('webdavPassword', v)}
                  secureTextEntry
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>书库路径</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="/ebooks"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.webdavBasePath}
                  onChangeText={(v) => setField('webdavBasePath', v)}
                />
              </View>
            </>
          )}

          {/* SMB fields */}
          {form.type === 'smb' && (
            <>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>SMB 共享路径 *</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="smb://192.168.1.100/library"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.smbShare}
                  onChangeText={(v) => setField('smbShare', v)}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>用户名</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="（可选）"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.smbUsername}
                  onChangeText={(v) => setField('smbUsername', v)}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>密码</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder={editingSource ? '（不修改请留空）' : '（可选）'}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.smbPassword}
                  onChangeText={(v) => setField('smbPassword', v)}
                  secureTextEntry
                />
              </View>
              <View style={styles.rowFields}>
                <View style={[styles.formSection, { flex: 1 }]}>
                  <Text style={[styles.formLabel, { color: theme.colors.text }]}>域</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                    placeholder="WORKGROUP"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={form.smbDomain}
                    onChangeText={(v) => setField('smbDomain', v)}
                  />
                </View>
                <View style={[styles.formSection, { flex: 1, marginLeft: spacing.sm }]}>
                  <Text style={[styles.formLabel, { color: theme.colors.text }]}>端口</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                    placeholder="445"
                    placeholderTextColor={theme.colors.textSecondary}
                    value={form.smbPort}
                    onChangeText={(v) => setField('smbPort', v)}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>书库路径</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="/ebooks"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.smbBasePath}
                  onChangeText={(v) => setField('smbBasePath', v)}
                />
              </View>
            </>
          )}

          {/* FTP fields */}
          {form.type === 'ftp' && (
            <>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>FTP 主机 *</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="192.168.1.100"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.ftpHost}
                  onChangeText={(v) => setField('ftpHost', v)}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>端口</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="21"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.ftpPort}
                  onChangeText={(v) => setField('ftpPort', v)}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>用户名</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="（可选）"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.ftpUsername}
                  onChangeText={(v) => setField('ftpUsername', v)}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>密码</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder={editingSource ? '（不修改请留空）' : '（可选）'}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.ftpPassword}
                  onChangeText={(v) => setField('ftpPassword', v)}
                  secureTextEntry
                />
              </View>
              <View style={styles.formSection}>
                <View style={styles.switchRow}>
                  <Text style={[styles.formLabel, { color: theme.colors.text }]}>使用 FTPS (TLS)</Text>
                  <Switch
                    value={form.ftpSecure}
                    onValueChange={(v) => setField('ftpSecure', v)}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                    thumbColor={form.ftpSecure ? theme.colors.primary : '#f4f3f4'}
                  />
                </View>
              </View>
              <View style={styles.formSection}>
                <Text style={[styles.formLabel, { color: theme.colors.text }]}>书库路径</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.colors.surface, color: theme.colors.text, borderColor: theme.colors.border }]}
                  placeholder="/ebooks"
                  placeholderTextColor={theme.colors.textSecondary}
                  value={form.ftpBasePath}
                  onChangeText={(v) => setField('ftpBasePath', v)}
                />
              </View>
            </>
          )}

          {/* Formats */}
          <View style={styles.formSection}>
            <Text style={[styles.formLabel, { color: theme.colors.text }]}>支持格式</Text>
            <View style={styles.formatGrid}>
              {FORMAT_OPTIONS.map((fmt) => (
                <TouchableOpacity
                  key={fmt}
                  style={[
                    styles.formatChip,
                    form.formats.includes(fmt)
                      ? { backgroundColor: theme.colors.primary }
                      : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  ]}
                  onPress={() => toggleFormat(fmt)}
                >
                  <Text
                    style={[
                      styles.formatChipText,
                      { color: form.formats.includes(fmt) ? '#fff' : theme.colors.textSecondary },
                    ]}
                  >
                    {fmt.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Auto sync */}
          <View style={styles.formSection}>
            <View style={styles.switchRow}>
              <Text style={[styles.formLabel, { color: theme.colors.text }]}>自动同步</Text>
              <Switch
                value={form.autoSync}
                onValueChange={(v) => setField('autoSync', v)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary + '80' }}
                thumbColor={form.autoSync ? theme.colors.primary : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Test connection */}
          <View style={styles.formSection}>
            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              onPress={handleTestConnection}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="wifi" size={18} color={theme.colors.primary} />
              )}
              <Text style={[styles.testButtonText, { color: theme.colors.primary }]}>测试连接</Text>
            </TouchableOpacity>

            {testResult && (
              <View
                style={[
                  styles.testResult,
                  {
                    backgroundColor: testResult.success ? theme.colors.success + '15' : theme.colors.error + '15',
                    borderColor: testResult.success ? theme.colors.success + '40' : theme.colors.error + '40',
                  },
                ]}
              >
                <Ionicons
                  name={testResult.success ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={testResult.success ? theme.colors.success : theme.colors.error}
                />
                <Text
                  style={[
                    styles.testResultText,
                    { color: testResult.success ? theme.colors.success : theme.colors.error },
                  ]}
                >
                  {testResult.success ? (testResult.message || '连接成功') : (testResult.error || '连接失败')}
                </Text>
              </View>
            )}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>书源管理</Text>
        <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.colors.primary }]} onPress={openAddModal}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addButtonText}>添加书源</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : sources.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.colors.text }]}>暂无书源</Text>
          <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
            添加 NAS 书源，同步书籍到书库
          </Text>
          <TouchableOpacity style={[styles.emptyAddButton, { backgroundColor: theme.colors.primary }]} onPress={openAddModal}>
            <Text style={styles.emptyAddButtonText}>添加第一个书源</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sources}
          keyExtractor={(item) => item.id}
          renderItem={renderSourceItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {renderForm()}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof getTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
    },
    headerTitle: {
      fontSize: fontSizes.xl,
      fontWeight: '600',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.lg,
      gap: spacing.xs,
    },
    addButtonText: {
      color: '#fff',
      fontSize: fontSizes.sm,
      fontWeight: '600',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    emptyText: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
      marginTop: spacing.md,
    },
    emptySubtext: {
      fontSize: fontSizes.md,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    emptyAddButton: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
    },
    emptyAddButtonText: {
      color: '#fff',
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    listContent: {
      padding: spacing.md,
    },
    sourceCard: {
      borderRadius: borderRadius.lg,
      padding: spacing.md,
    },
    sourceHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    sourceIconContainer: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.md,
      backgroundColor: theme.colors.primary + '15',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sourceInfo: {
      flex: 1,
    },
    sourceName: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    sourceMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    typeBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    typeBadgeText: {
      fontSize: fontSizes.xs,
      fontWeight: '600',
    },
    sourceAddress: {
      fontSize: fontSizes.xs,
      flex: 1,
    },
    sourceStats: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    sourceStatText: {
      fontSize: fontSizes.xs,
    },
    sourceActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      gap: spacing.xs,
    },
    actionButtonText: {
      fontSize: fontSizes.xs,
      fontWeight: '500',
    },
    modalContainer: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
    },
    modalCancelText: {
      fontSize: fontSizes.md,
    },
    modalTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '600',
    },
    modalSaveText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    modalContent: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
    formSection: {
      marginTop: spacing.lg,
    },
    formLabel: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      marginBottom: spacing.sm,
    },
    textInput: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: fontSizes.md,
    },
    typeSelector: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    typeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      gap: spacing.xs,
    },
    typeOptionText: {
      fontSize: fontSizes.xs,
      fontWeight: '600',
    },
    rowFields: {
      flexDirection: 'row',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    formatGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    formatChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    formatChipText: {
      fontSize: fontSizes.xs,
      fontWeight: '600',
    },
    testButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      gap: spacing.sm,
    },
    testButtonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    testResult: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      marginTop: spacing.md,
    },
    testResultText: {
      flex: 1,
      fontSize: fontSizes.sm,
    },
  });
}