/**
 * ScanLoginScreen — mobile2 (1:1 移植自 mobile ScanLoginScreen.tsx)
 *
 * 适配点（mobile → mobile2）:
 *   1. expo-camera (CameraView + useCameraPermissions) → react-native-vision-camera v4
 *      (Camera + useCameraDevice + useCameraPermission + useCodeScanner)
 *   2. plus 接口签名对齐 mobile2:
 *      - createScanLoginSession()        无参数
 *      - getScanLoginSession(sessionId)  无 secret
 *      - claimScanLoginSession(sessionId, payload)    无 secret
 *      - consumeScanLoginSession(sessionId)            无 secret
 *      - subscribeScanLoginSession(sessionId, cb)     2 参数
 *      - reportScanLoginResult(sessionId, result)     无 secret
 *   3. status 大写枚举: 'PENDING' | 'CLAIMED' | 'CONFIRMED' | 'CONSUMED' | 'EXPIRED'
 *   4. mobile 的 status 是对象 { status: 'waiting_scan' | ... }; mobile2 直接用 session.status
 *   5. mobile2 utils/scanLogin.ts 的 applyMobileScanLoginResult 已放宽签名接受任意带 plusAuth 的对象
 *   6. navigation 用 typed useNavigation (与 MemberLoginScreen 对齐)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
} from '../services/plus';
import {
  applyMobileScanLoginResult,
  collectMobileScanLoginPayload,
} from '../utils/scanLogin';
import type { RootStackParamList } from '../navigation/types';

export function ScanLoginScreen() {
  const actualTheme = useThemeStore((s) => s.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [hasCameraPermission, setHasCameraPermission] = useState<
    boolean | null
  >(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(
    null,
  );

  // Request camera permission on mount
  useEffect(() => {
    const requestCameraPermission = async () => {
      if (!hasPermission) {
        const granted = await requestPermission();
        setHasCameraPermission(granted);
        if (!granted) {
          Alert.alert(
            '需要相机权限',
            '请在设置中开启相机权限以使用扫码登录',
            [{ text: '确定', onPress: () => navigation.goBack() }],
          );
        }
      } else {
        setHasCameraPermission(true);
      }
    };
    requestCameraPermission();
  }, [hasPermission, requestPermission, navigation]);

  // For mobile as target: create a session so desktop can scan our QR
  const createTargetSession = useCallback(async () => {
    try {
      const res = await createScanLoginSession();
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
    getScanLoginSession(scanSession.id).catch(console.error);
    const unsubscribe = subscribeScanLoginSession(scanSession.id, (session) => {
      setScanSession(session);
    });
    return () => unsubscribe();
  }, [scanSession?.id]);

  // When desktop confirms the scan login, consume the session to receive the token
  useEffect(() => {
    if (!scanSession || scanSession.status !== 'CONFIRMED') return;
    const consumeConfirmedScan = async () => {
      try {
        setScanBusy(true);
        const res = await consumeScanLoginSession(scanSession.id);
        try {
          if (!res.data) throw new Error('No data returned');
          await applyMobileScanLoginResult(res.data as any);
        } catch (applyErr: any) {
          await reportScanLoginResult(scanSession.id, {
            success: false,
            error: applyErr.message,
          }).catch(console.error);
          reportScanLoginResultViaSocket(scanSession.id, {
            success: false,
            error: applyErr.message,
          });
          throw applyErr;
        }
        await reportScanLoginResult(scanSession.id, {
          success: true,
        }).catch(console.error);
        reportScanLoginResultViaSocket(scanSession.id, { success: true });
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
  }, [scanSession?.id, scanSession?.status, navigation, createTargetSession]);

  // QR code handler — when mobile scans a desktop-side QR (role === 'target'),
  // claim the session and send our plusAuth payload to desktop.
  const handleBarCodeScanned = useCallback(
    async (codes: Code[]) => {
      const data = codes[0]?.value;
      if (!data) return;
      try {
        const parsed = JSON.parse(data);
        if (
          parsed.kind !== 'bookdock-scan-login' &&
          parsed.kind !== 'soundx-scan-login'
        ) {
          Alert.alert('无效的二维码');
          return;
        }

        const { sessionId, role } = parsed;
        if (role === 'target') {
          const payload = await collectMobileScanLoginPayload();
          setScanBusy(true);

          const claimRes = await claimScanLoginSession(sessionId, payload);
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
    },
    [],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: scanBusy ? () => {} : handleBarCodeScanned,
  });

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
          扫码登录
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {hasCameraPermission === true && device ? (
        <>
          <Camera
            style={StyleSheet.absoluteFillObject}
            device={device}
            isActive={hasCameraPermission}
            codeScanner={codeScanner}
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
          <Text style={{ color: theme.colors.textSecondary }}>
            需要相机权限
          </Text>
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