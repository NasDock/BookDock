import { useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { useThemeStore } from '../stores';
import { initApiClient } from '@bookdock/api-client';
import {
  loadServerConfig,
  saveServerConfig,
  selectBestServer,
  setActiveServerAddress,
  getActiveServerAddress,
  toApiBaseUrl,
} from '../utils/network';
import { setApiBaseUrl } from '../services/api';
import {
  createScanLoginSession,
  getScanLoginSession,
  subscribeScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  reportScanLoginResultViaSocket,
  type ScanLoginSession,
  type ScanLoginSessionStatus,
} from '../services/plus';

export function LoginScreen() {
  const navigation = useNavigation();
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const authStore = useAuthStore();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Address inputs
  const [internalAddress, setInternalAddress] = useState('');
  const [externalAddress, setExternalAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Scan login state
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanLoginSessionStatus | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);
  const sourceType = 'BookDock';

  // Load saved config on mount
  useEffect(() => {
    const loadConfig = async () => {
      const config = await loadServerConfig();
      setInternalAddress(config.internal || '');
      setExternalAddress(config.external || '');

      // Restore credentials from last used address
      const active = await getActiveServerAddress();
      if (active) {
        await restoreCredentials(active);
      } else if (config.external) {
        await restoreCredentials(config.external);
      } else if (config.internal) {
        await restoreCredentials(config.internal);
      }
    };
    loadConfig();
  }, []);

  const restoreCredentials = async (address: string) => {
    if (!address) return;
    try {
      const credsKey = `creds_${sourceType}_${address}`;
      const savedCreds = await AsyncStorage.getItem(credsKey);
      if (savedCreds) {
        const { username: u, password: p } = JSON.parse(savedCreds);
        if (u) setUsername(u);
        if (p) setPassword(p);
      }
    } catch (e) {
      console.error('Failed to restore credentials', e);
    }
  };

  // --- Scan Login ---
  const createTargetSession = useCallback(async () => {
    try {
      const res = await createScanLoginSession({ role: 'target', deviceKind: 'mobile' });
      if (res.data) {
        setScanSession(res.data);
        setScanStatus({
          sessionId: res.data.sessionId,
          role: res.data.role,
          deviceKind: res.data.deviceKind,
          expiresAt: res.data.expiresAt,
          status: 'waiting_scan',
          sourceBundles: [],
          hasNativeAuth: false,
          hasPlusAuth: false,
        });
      }
    } catch (err) {
      console.error('Failed to create scan session', err);
    }
  }, []);

  useEffect(() => {
    if (!isLandscape) {
      setScanSession(null);
      setScanStatus(null);
      return;
    }
    createTargetSession();
  }, [isLandscape, createTargetSession]);

  useEffect(() => {
    if (!scanSession || !isLandscape) return;
    getScanLoginSession(scanSession.sessionId, scanSession.secret).catch(console.error);
    const unsubscribe = subscribeScanLoginSession(
      scanSession.sessionId,
      scanSession.secret,
      (status) => setScanStatus(status),
    );
    return () => unsubscribe();
  }, [scanSession, isLandscape]);

  useEffect(() => {
    if (!scanSession || scanStatus?.status !== 'confirmed') return;

    const consumeConfirmedScan = async () => {
      try {
        setScanBusy(true);
        const res = await consumeScanLoginSession(scanSession.sessionId, { secret: scanSession.secret });

        try {
          if (!res.data) throw new Error('No data returned');
          // Apply result: save plus token if present
          if (res.data.plusAuth) {
            await AsyncStorage.setItem('bookdock_plus_token', res.data.plusAuth.token);
            await AsyncStorage.setItem('bookdock_plus_user_id', JSON.stringify(res.data.plusAuth.userId));
          }
        } catch (applyErr: any) {
          await reportScanLoginResult(scanSession.sessionId, {
            secret: scanSession.secret,
            success: false,
            error: applyErr.message,
          }).catch(console.error);
          reportScanLoginResultViaSocket(scanSession.sessionId, scanSession.secret, false, applyErr.message);
          throw applyErr;
        }

        await reportScanLoginResult(scanSession.sessionId, {
          secret: scanSession.secret,
          success: true,
        }).catch(console.error);
        reportScanLoginResultViaSocket(scanSession.sessionId, scanSession.secret, true);
        // @ts-ignore
        navigation.replace('Main');
      } catch (err: any) {
        console.error(err);
        Alert.alert('错误', err.message || '确认扫码登录失败');
      } finally {
        setScanBusy(false);
      }
    };

    consumeConfirmedScan();
  }, [scanSession?.sessionId, scanStatus?.status, navigation]);

  // --- Form handlers ---
  const saveConfig = async (internal: string, external: string) => {
    const existingStr = await AsyncStorage.getItem(`sourceConfig_${sourceType}`);
    let existingConfigs: Array<{ id: string; internal: string; external: string; name: string }> = [];

    try {
      if (existingStr) {
        const parsed = JSON.parse(existingStr);
        if (Array.isArray(parsed)) existingConfigs = parsed;
        else {
          existingConfigs = [{
            id: Date.now().toString(),
            internal: parsed.internal || '',
            external: parsed.external || '',
            name: '默认服务器',
          }];
        }
      }
    } catch {
      existingConfigs = [];
    }

    const existingIndex = existingConfigs.findIndex(
      (c) => c.internal === internal && c.external === external,
    );

    if (existingIndex === -1) {
      existingConfigs.push({
        id: Date.now().toString(),
        internal,
        external,
        name: `服务器 ${existingConfigs.length + 1}`,
      });
    }

    await AsyncStorage.setItem(`sourceConfig_${sourceType}`, JSON.stringify(existingConfigs));
    await saveServerConfig({ internal, external, name: '服务器' });
  };

  const handleSubmit = async () => {
    if (!externalAddress && !internalAddress) {
      setError('请至少输入一个服务器地址（内网或外网）');
      return;
    }
    if (!username || !password) {
      setError('请填写用户名和密码');
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const bestAddress = await selectBestServer(internalAddress, externalAddress);

      if (!bestAddress) {
        setError('无法连接到任一服务器地址，请检查网络或地址输入');
        setLoading(false);
        return;
      }

      const apiBaseUrl = toApiBaseUrl(bestAddress);

      setApiBaseUrl(apiBaseUrl);
      await setActiveServerAddress(apiBaseUrl);

      initApiClient({
        baseURL: apiBaseUrl,
        getAuthToken: () => useAuthStore.getState().token || null,
        onAuthError: () => {
          authStore.logout();
        },
      });

      await saveConfig(internalAddress, externalAddress);

      if (isLogin) {
        await AsyncStorage.setItem(
          `creds_${sourceType}_${apiBaseUrl}`,
          JSON.stringify({ username, password }),
        );
      }

      const { getApiClient } = await import('@bookdock/api-client');
      const apiClient = getApiClient();

      if (isLogin) {
        const response = await apiClient.login(username.trim(), password);
        if (response.success && response.data) {
          authStore.login(response.data.user, response.data.token);
          // @ts-ignore
          navigation.replace('Main');
        } else {
          setError(response.error || '登录失败');
        }
      } else {
        const response = await apiClient.register(username.trim(), password, confirmPassword);
        if (response.success && response.data) {
          authStore.login(response.data.user, response.data.token);
          // @ts-ignore
          navigation.replace('Main');
        } else {
          setError(response.error || '注册失败');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || (isLogin ? '登录失败' : '注册失败'));
    } finally {
      setLoading(false);
    }
  };

  const renderScanPanel = () => {
    if (isLandscape) {
      if (scanStatus?.status === 'waiting_confirm') {
        return (
          <View style={[styles.scanCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Text style={[styles.scanTitle, { color: theme.colors.text }]}>等待确认</Text>
            <Text style={[styles.scanDesc, { color: theme.colors.textSecondary }]}>
              手机已扫码。请在手机屏幕上确认登录...
            </Text>
            <ActivityIndicator style={{ marginTop: 24, alignSelf: 'center' }} size="large" color={theme.colors.primary} />
          </View>
        );
      }

      return (
        <View style={[styles.scanCard, styles.scanCardQr, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
          <Text style={[styles.qrLabel, { color: theme.colors.textSecondary }]}>扫码登录</Text>
          <View style={styles.qrBox}>
            {/* QR code placeholder - would use react-native-qrcode-svg */}
            <View style={[styles.qrPlaceholder, { backgroundColor: theme.colors.surface }]}>
              <Ionicons name="qr-code" size={80} color={theme.colors.primary} />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
            onPress={createTargetSession}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>刷新二维码</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return <></>;
  };

  const renderForm = () => (
    <View style={styles.form}>
      <Text style={[styles.label, { color: theme.colors.text }]}>外网地址 (External)</Text>
      <View style={[styles.inputContainer, { marginBottom: spacing.sm }]}>
        <Ionicons name="globe-outline" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={[styles.input, { color: theme.colors.text }]}
          placeholder="https://nas.example.com/api"
          placeholderTextColor={theme.colors.textSecondary}
          value={externalAddress}
          onChangeText={(text) => {
            setExternalAddress(text);
            restoreCredentials(text);
          }}
          autoCapitalize="none"
        />
      </View>

      <Text style={[styles.label, { color: theme.colors.text }]}>内网地址 (Internal)</Text>
      <View style={[styles.inputContainer, { marginBottom: spacing.sm }]}>
        <Ionicons name="wifi-outline" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={[styles.input, { color: theme.colors.text }]}
          placeholder="http://192.168.x.x:8088/api"
          placeholderTextColor={theme.colors.textSecondary}
          value={internalAddress}
          onChangeText={(text) => {
            setInternalAddress(text);
            restoreCredentials(text);
          }}
          autoCapitalize="none"
        />
      </View>

      <Text style={[styles.label, { color: theme.colors.text }]}>用户名</Text>
      <View style={[styles.inputContainer, { marginBottom: spacing.sm }]}>
        <Ionicons name="person-outline" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={[styles.input, { color: theme.colors.text }]}
          placeholder="请输入用户名"
          placeholderTextColor={theme.colors.textSecondary}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
      </View>

      <Text style={[styles.label, { color: theme.colors.text }]}>密码</Text>
      <View style={[styles.inputContainer, { marginBottom: spacing.sm }]}>
        <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={[styles.input, { color: theme.colors.text, flex: 1 }]}
          placeholder="请输入密码"
          placeholderTextColor={theme.colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {!isLogin && (
        <>
          <Text style={[styles.label, { color: theme.colors.text }]}>确认密码</Text>
          <View style={[styles.inputContainer, { marginBottom: spacing.sm }]}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.colors.text, flex: 1 }]}
              placeholder="请再次输入密码"
              placeholderTextColor={theme.colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
            />
          </View>
        </>
      )}

      {error && (
        <Text style={[styles.errorText, { color: theme.colors.error || '#ef4444' }]}>
          {error}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.colors.primary }]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={[styles.buttonText, { color: theme.colors.background }]}>
            {isLogin ? '登录' : '注册'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { setIsLogin(!isLogin); setError(null); }}>
        <Text style={[styles.switchText, { color: theme.colors.primary }]}>
          {isLogin ? '没有账号？去注册' : '已有账号？去登录'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image source={require('../../assets/logo.png')} style={{ width: 64, height: 64 }} resizeMode="contain" />
            <Text style={[styles.title, { color: theme.colors.text }]}>
              BookDock
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              {sourceType} {isLogin ? '登录' : '注册'}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={[styles.content, isLandscape && styles.contentLandscape]}>
          {isLandscape ? renderScanPanel() : null}

          <View style={[styles.formCard, isLandscape && styles.formCardLandscape, { backgroundColor: theme.colors.background }]}>
            {!isLandscape && renderScanPanel()}
            {renderForm()}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: ReturnType<typeof getTheme>) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      padding: spacing.lg,
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    logoContainer: {
      alignItems: 'center',
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSizes.xxl,
      fontWeight: '700',
    },
    subtitle: {
      fontSize: fontSizes.sm,
      marginTop: spacing.xs,
      color: theme.colors.textSecondary,
    },
    content: {
      flex: 1,
      gap: spacing.lg,
      justifyContent: 'center',
      width: '100%',
      maxWidth: 600,
      alignSelf: 'center',
    },
    contentLandscape: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 40,
    },
    formCard: {
      flex: 1,
      minWidth: 0,
      width: '100%',
    },
    formCardLandscape: {
      justifyContent: 'center',
    },
    scanCard: {
      borderWidth: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      width: '100%',
    },
    scanCardQr: {
      width: 200,
      maxWidth: 200,
      padding: 0,
    },
    scanTitle: {
      fontSize: fontSizes.lg,
      fontWeight: '700',
    },
    scanDesc: {
      fontSize: fontSizes.sm,
      lineHeight: 20,
    },
    qrLabel: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
      textAlign: 'center',
    },
    qrBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
    },
    qrPlaceholder: {
      width: 160,
      height: 160,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButton: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
    },
    form: {
      width: '100%',
      gap: spacing.sm,
    },
    label: {
      fontSize: fontSizes.sm,
      fontWeight: '500',
      marginBottom: spacing.xs,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      height: 48,
    },
    input: {
      flex: 1,
      marginLeft: spacing.sm,
      fontSize: fontSizes.md,
    },
    button: {
      height: 48,
      borderRadius: borderRadius.md,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    buttonText: {
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    switchText: {
      textAlign: 'center',
      fontSize: fontSizes.sm,
      fontWeight: '600',
      marginTop: spacing.sm,
    },
    errorText: {
      fontSize: fontSizes.sm,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });
