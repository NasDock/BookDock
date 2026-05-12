import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  Image,
} from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import {
  plusLogin,
  plusSendCode,
  createScanLoginSession,
  getScanLoginSession,
  claimScanLoginSession,
  subscribeScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  reportScanLoginResultViaSocket,
  setPlusToken,
  type ScanLoginSession,
  type ScanLoginSessionStatus,
} from '../services/plus';
import { applyMobileScanLoginResult, collectMobileScanLoginPayload } from '../utils/scanLogin';

const { width: screenWidth } = Dimensions.get('window');

interface MemberLoginScreenProps {
  navigation: any;
}

export function MemberLoginScreen({ navigation }: MemberLoginScreenProps) {
  const actualTheme = useThemeStore((s) => s.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  // Form state
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scan login state
  const [showScanner, setShowScanner] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanLoginSessionStatus | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  // Countdown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown((p) => p - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // Send verification code
  const handleSendCode = useCallback(async () => {
    if (!phone) {
      setError('请输入手机号');
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      const res = await plusSendCode({ phone });
      if (res.code === 200 || res.code === 201) {
        setCountdown(60);
      } else {
        setError(res.message || '获取验证码失败');
      }
    } catch (e: any) {
      setError(e.message || '网络请求失败');
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  // Phone login
  const handleLogin = useCallback(async () => {
    if (!phone || !code) {
      setError('请输入手机号和验证码');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await plusLogin({ phone, code });
      if (res.code === 200 || res.code === 201) {
        const { token: plusToken, userId } = res.data!;
        await AsyncStorage.setItem('bookdock_plus_token', plusToken);
        await AsyncStorage.setItem('bookdock_plus_user_id', JSON.stringify(userId));
        await setPlusToken(plusToken);
        Alert.alert('登录成功', '会员登录成功');
        navigation.goBack();
      } else {
        setError(res.message || '登录失败');
      }
    } catch (e: any) {
      setError(e.message || '登录失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [phone, code, navigation]);

  // Scanner logic
  const requestCameraPermission = async () => {
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    setHasCameraPermission(status === 'granted');
    if (status !== 'granted') {
      Alert.alert('需要相机权限', '请在设置中开启相机权限以使用扫码登录');
    } else {
      setShowScanner(true);
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    setShowScanner(false);
    try {
      const parsed = JSON.parse(data);
      if (parsed.kind !== 'bookdock-scan-login' && parsed.kind !== 'soundx-scan-login') {
        Alert.alert('无效的二维码');
        return;
      }

      // Claim the session with our auth info
      const { sessionId, secret, role } = parsed;
      if (role === 'target') {
        // We are the scanner, claiming the target session
        const payload = await collectMobileScanLoginPayload();
        setScanBusy(true);

        const claimRes = await claimScanLoginSession(sessionId, { secret, payload });
        if (claimRes.code === 200 || claimRes.code === 201) {
          // Wait for confirm
          Alert.alert('已发送', '请在目标设备上确认登录');
        } else {
          Alert.alert('扫码失败', claimRes.message || '无法认领会话');
        }
      }
    } catch (e: any) {
      Alert.alert('扫码失败', e.message || '二维码格式错误');
    } finally {
      setScanBusy(false);
    }
  };

  // For mobile as target (show QR code for desktop to scan)
  const createTargetSession = useCallback(async () => {
    try {
      const res = await createScanLoginSession({ role: 'target', deviceKind: 'mobile' });
      if (res.data) {
        setScanSession(res.data);
      }
    } catch (err) {
      console.error('Failed to create scan session', err);
    }
  }, []);

  useEffect(() => {
    createTargetSession();
  }, [createTargetSession]);

  useEffect(() => {
    if (!scanSession) return;
    getScanLoginSession(scanSession.sessionId, scanSession.secret).catch(console.error);
    const unsubscribe = subscribeScanLoginSession(
      scanSession.sessionId,
      scanSession.secret,
      (status) => setScanStatus(status),
    );
    return () => unsubscribe();
  }, [scanSession]);

  useEffect(() => {
    if (!scanSession || scanStatus?.status !== 'confirmed') return;
    const consumeConfirmedScan = async () => {
      try {
        setScanBusy(true);
        const res = await consumeScanLoginSession(scanSession.sessionId, {
          secret: scanSession.secret,
        });
        try {
          if (!res.data) throw new Error('No data returned');
          await applyMobileScanLoginResult(res.data);
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
        Alert.alert('扫码登录成功');
        navigation.goBack();
      } catch (error: any) {
        Alert.alert('扫码登录失败', error.message || '未知错误');
        createTargetSession();
      } finally {
        setScanBusy(false);
      }
    };
    consumeConfirmedScan();
  }, [scanSession?.sessionId, scanStatus?.status, navigation, createTargetSession]);

  if (showScanner) {
    return (
      <View style={[styles.scannerContainer, { backgroundColor: theme.colors.background }]}>
        <View style={styles.scannerHeader}>
          <TouchableOpacity onPress={() => setShowScanner(false)} style={styles.scannerCloseBtn}>
            <Ionicons name="close" size={28} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.scannerTitle, { color: theme.colors.text }]}>扫码登录</Text>
          <View style={{ width: 40 }} />
        </View>
        {hasCameraPermission === true ? (
          <BarCodeScanner
            onBarCodeScanned={scanBusy ? undefined : handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <View style={styles.scannerNoPermission}>
            <Text style={{ color: theme.colors.textSecondary }}>需要相机权限</Text>
          </View>
        )}
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerFrame} />
        </View>
        <Text style={[styles.scannerHint, { color: theme.colors.textSecondary }]}>
          对准电脑屏幕上的二维码
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>用户登录</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Logo */}
        <View style={styles.logoSection}>
          <Image source={require('../../assets/logo.png')} style={{ width: 64, height: 64 }} resizeMode="contain" />
          <Text style={[styles.title, { color: theme.colors.text }]}>BookDock</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            书仓会员登录
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>手机号</Text>
            <View style={styles.phoneRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.phoneInput,
                  {
                    color: theme.colors.text,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  },
                ]}
                placeholder="请输入手机号"
                placeholderTextColor={theme.colors.textSecondary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <TouchableOpacity
                style={[
                  styles.codeBtn,
                  { backgroundColor: countdown > 0 || isSending ? theme.colors.border : theme.colors.primary },
                ]}
                onPress={handleSendCode}
                disabled={countdown > 0 || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.codeBtnText, { color: '#fff' }]}>
                    {countdown > 0 ? `${countdown}s` : '验证码'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Code */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: theme.colors.text }]}>验证码</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  textAlign: 'center',
                  letterSpacing: 8,
                  fontSize: 20,
                },
              ]}
              placeholder="6位验证码"
              placeholderTextColor={theme.colors.textSecondary}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error + '40' }]}>
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: theme.colors.primary }]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>登录 / 注册</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Scan login option */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
          <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>或</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        </View>

        <TouchableOpacity
          style={[styles.scanBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          onPress={requestCameraPermission}
          disabled={scanBusy}
        >
          <Ionicons name="scan-outline" size={20} color={theme.colors.primary} />
          <Text style={[styles.scanBtnText, { color: theme.colors.primary }]}>
            {scanBusy ? '处理中...' : '扫码登录'}
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
            登录即代表同意
            <Text style={{ color: theme.colors.primary }}>《隐私政策》</Text>
            和
            <Text style={{ color: theme.colors.primary }}>《用户协议》</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
  },
  logoSection: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.md,
  },
  formCard: {
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: '500',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.md,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  phoneInput: {
    flex: 1,
  },
  codeBtn: {
    width: 100,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: fontSizes.sm,
  },
  loginBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: fontSizes.sm,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  scanBtnText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Scanner
  scannerContainer: {
    flex: 1,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    zIndex: 10,
  },
  scannerCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: '600',
  },
  scannerNoPermission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    fontSize: fontSizes.md,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
