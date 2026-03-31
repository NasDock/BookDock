import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';

const API_BASE = 'http://10.79.233.188:3000/api';

export function MemberLoginScreen({ navigation }: any) {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const sendCode = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      Alert.alert('错误', '请输入正确的手机号');
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch(`${API_BASE}/vip/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        Alert.alert('错误', data.message || '发送失败');
      }
    } catch {
      Alert.alert('错误', '网络错误，请重试');
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  const handleLogin = useCallback(async () => {
    if (!code || code.length !== 6) {
      Alert.alert('错误', '请输入6位验证码');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vip/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (data.token) {
        await import('@react-native-async-storage/async-storage').then(async ({ default: AsyncStorage }) => {
          await AsyncStorage.setItem('bookdock_vip_token', data.token);
          await AsyncStorage.setItem('bookdock_vip_user', JSON.stringify({
            userId: data.userId, phone: data.phone, level: data.level,
            isVip: data.isVip, expiredAt: data.expiredAt,
          }));
        });
        navigation.replace('MemberBenefits');
      } else {
        Alert.alert('错误', data.message || '登录失败');
      }
    } catch {
      Alert.alert('错误', '网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [phone, code, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.logoContainer}>
            <View style={[styles.logo, { backgroundColor: '#f59e0b' }]}>
              <Text style={styles.logoText}>👑</Text>
            </View>
            <Text style={[styles.title, { color: theme.colors.text }]}>会员登录</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>手机号快捷登录</Text>
          </View>

          <View style={[styles.form, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.label, { color: theme.colors.text }]}>手机号</Text>
            <View style={[styles.inputWrapper, { borderColor: theme.colors.border }]}>
              <Ionicons name="call-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.colors.text }]}
                placeholder="请输入手机号"
                placeholderTextColor={theme.colors.textSecondary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={11}
              />
              <TouchableOpacity onPress={sendCode} disabled={countdown > 0 || isSending}>
                <Text style={[styles.sendCodeText, countdown > 0 && styles.sendCodeDisabled]}>
                  {countdown > 0 ? `${countdown}s` : isSending ? '发送中' : '获取验证码'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: theme.colors.text, marginTop: spacing.md }]}>验证码</Text>
            <View style={[styles.inputWrapper, { borderColor: theme.colors.border }]}>
              <Ionicons name="key-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.colors.text, textAlign: 'center' }]}
                placeholder="6位验证码"
                placeholderTextColor={theme.colors.textSecondary}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#f59e0b' }]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>登录 / 注册</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.linkContainer} onPress={() => navigation.replace('MemberBenefits')}>
            <Text style={[styles.linkText, { color: theme.colors.textSecondary }]}>了解会员权益</Text>
            <Text style={[styles.linkArrow, { color: '#f59e0b' }]}> →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 72, height: 72, borderRadius: borderRadius.xl, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  logoText: { fontSize: 36 },
  title: { fontSize: fontSizes.xxl, fontWeight: 'bold' },
  subtitle: { fontSize: fontSizes.md, marginTop: spacing.xs },
  form: { borderRadius: borderRadius.xl, padding: spacing.lg },
  label: { fontSize: fontSizes.sm, fontWeight: '500', marginBottom: spacing.xs },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm,
  },
  input: { flex: 1, fontSize: fontSizes.md, paddingVertical: spacing.xs },
  sendCodeText: { fontSize: fontSizes.sm, color: '#f59e0b', fontWeight: '600' },
  sendCodeDisabled: { color: '#9ca3af' },
  button: { marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: fontSizes.md, fontWeight: '600' },
  linkContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  linkText: { fontSize: fontSizes.sm },
  linkArrow: { fontSize: fontSizes.sm, fontWeight: '600' },
});
