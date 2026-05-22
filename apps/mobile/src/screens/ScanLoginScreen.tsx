import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import {
  createScanLoginSession,
  getScanLoginSession,
  claimScanLoginSession,
  subscribeScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  reportScanLoginResultViaSocket,
  type ScanLoginSession,
  type ScanLoginSessionStatus,
} from '../services/plus';
import { applyMobileScanLoginResult, collectMobileScanLoginPayload } from '../utils/scanLogin';

interface ScanLoginScreenProps {
  navigation: any;
}

export function ScanLoginScreen({ navigation }: ScanLoginScreenProps) {
  const actualTheme = useThemeStore((s) => s.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const [permission, requestPermission] = useCameraPermissions();
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanLoginSessionStatus | null>(null);

  // Request camera permission on mount
  useEffect(() => {
    const requestCameraPermission = async () => {
      let currentPermission = permission;
      if (!currentPermission) {
        currentPermission = await requestPermission();
      }
      if (!currentPermission.granted) {
        const result = await requestPermission();
        setHasCameraPermission(result.granted);
        if (!result.granted) {
          Alert.alert('需要相机权限', '请在设置中开启相机权限以使用扫码登录', [
            { text: '确定', onPress: () => navigation.goBack() },
          ]);
        }
      } else {
        setHasCameraPermission(true);
      }
    };
    requestCameraPermission();
  }, [permission, requestPermission, navigation]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.kind !== 'bookdock-scan-login' && parsed.kind !== 'soundx-scan-login') {
        Alert.alert('无效的二维码');
        return;
      }

      const { sessionId, secret, role } = parsed;
      if (role === 'target') {
        const payload = await collectMobileScanLoginPayload();
        setScanBusy(true);

        const claimRes = await claimScanLoginSession(sessionId, { secret, payload });
        if (claimRes.code === 200 || claimRes.code === 201) {
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

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>扫码登录</Text>
        <View style={{ width: 40 }} />
      </View>

      {hasCameraPermission === true ? (
        <>
          <CameraView
            onBarcodeScanned={scanBusy ? undefined : handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          <View style={styles.overlay}>
            <View style={styles.frame} />
          </View>
          <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
            对准电脑屏幕上的二维码
          </Text>
        </>
      ) : hasCameraPermission === false ? (
        <View style={styles.noPermission}>
          <Text style={{ color: theme.colors.textSecondary }}>需要相机权限</Text>
        </View>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    zIndex: 10,
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
  noPermission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: {
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
