import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function MemberPaymentSuccessScreen({ navigation }: any) {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const [countdown, setCountdown] = useState(3);
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    loadUser();
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem('bookdock_vip_user');
      if (stored) setVipUser(JSON.parse(stored));
    } catch {}
  };

  const levelName = vipUser?.level === 'lifetime' ? '永久卡' : vipUser?.level === 'year' ? '年卡' : '会员';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={[styles.successIcon, { backgroundColor: '#10b981' }]}>
          <Text style={styles.successIconText}>✅</Text>
        </View>

        <Text style={[styles.title, { color: theme.colors.text }]}>支付成功！</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          恭喜您已成为 BookDock {levelName} 🎉
        </Text>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <View style={[styles.cardBadge, { backgroundColor: '#dcfce7' }]}>
            <Text style={styles.cardBadgeIcon}>👑</Text>
            <View>
              <Text style={[styles.cardLevel, { color: theme.colors.text }]}>{levelName}</Text>
              <Text style={[styles.cardExpiry, { color: '#16a34a' }]}>
                {vipUser?.level === 'lifetime' ? '永久有效' : '1年有效期'}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>
            会员特权已开通，可随时在"我的会员"中查看
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace('MemberDetail')}>
            <Text style={styles.primaryBtnText}>👑 查看会员详情</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: theme.colors.surface }]} onPress={() => navigation.getParent()?.goBack()}>
            <Text style={[styles.secondaryBtnText, { color: theme.colors.text }}]}>📚 返回书架</Text>
          </TouchableOpacity>
        </View>

        {countdown > 0 && (
          <Text style={[styles.countdown, { color: theme.colors.textSecondary }]}>
            {countdown} 秒后自动返回
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  successIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  successIconText: { fontSize: 40 },
  title: { fontSize: fontSizes.xxl, fontWeight: 'bold', marginBottom: spacing.xs },
  subtitle: { fontSize: fontSizes.md, marginBottom: spacing.xl },
  card: { width: '100%', borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.xl },
  cardBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  cardBadgeIcon: { fontSize: 28 },
  cardLevel: { fontWeight: 'bold', fontSize: fontSizes.lg },
  cardExpiry: { fontSize: fontSizes.sm },
  cardDesc: { fontSize: fontSizes.sm, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm },
  primaryBtn: { backgroundColor: '#10b981', paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: fontSizes.md },
  secondaryBtn: { paddingVertical: spacing.md, borderRadius: borderRadius.lg, alignItems: 'center' },
  secondaryBtnText: { fontWeight: '600', fontSize: fontSizes.md },
  countdown: { marginTop: spacing.lg, fontSize: fontSizes.xs },
});
