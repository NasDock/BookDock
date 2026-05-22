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
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import {
  plusLogin,
  plusSendCode,
  setPlusToken,
} from '../services/plus';

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
        await AsyncStorage.setItem('bookdock_plus_user', JSON.stringify({ id: userId }));
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginVertical: spacing.xl,
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
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
});
