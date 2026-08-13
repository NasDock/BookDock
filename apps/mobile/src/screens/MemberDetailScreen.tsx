import React, { useEffect, useState } from 'react';
import { View, Text, Platform, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { removePlusToken } from '../services/plus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { isMembershipPurchaseAvailable } from '../utils/membershipGate';

export function MemberDetailScreen({ navigation }: any) {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const stored = await AsyncStorage.getItem('bookdock_plus_user');
      if (!stored) { navigation.replace('MemberLogin'); return; }
      const user = JSON.parse(stored);
      if (!user.isVip) {
        // iOS 不开放会员购买:非 VIP 用户进到此屏时,直接回到设置页而不是开通页
        navigation.replace(isMembershipPurchaseAvailable() ? 'MemberBenefits' : 'Settings');
        return;
      }
      setVipUser(user);
    } catch {
      navigation.replace('MemberLogin');
    }
  };

  const handleLogout = async () => {
    await removePlusToken();
    useAuthStore.getState().clearPlusAuth();
    navigation.replace('MemberLogin');
  };

  if (!vipUser) return null;

  const isLifetime = vipUser.level === 'lifetime';
  const isYear = vipUser.level === 'year';
  const expiredAt = vipUser.expiredAt ? new Date(vipUser.expiredAt) : null;
  const daysLeft = expiredAt ? Math.ceil((expiredAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const levelName = isLifetime ? '永久卡' : isYear ? '年卡' : '免费版';
  const levelGradient = isLifetime ? ['#a855f7', '#ec4899'] : isYear ? ['#f59e0b', '#ea580c'] : ['#9ca3af', '#6b7280'];

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Member Card */}
        <View style={[styles.memberCard, { backgroundColor: levelGradient[0] }]}>
          <View style={styles.memberInfo}>
            <Text style={styles.memberLabel}>会员等级</Text>
            <Text style={styles.memberLevel}>{levelName}</Text>
          </View>
          <View style={styles.memberExpiry}>
            <Text style={styles.memberLabel}>{isLifetime ? '有效期' : '到期时间'}</Text>
            <Text style={styles.memberExpiryText}>{isLifetime ? '永久有效' : (expiredAt ? expiredAt.toLocaleDateString('zh-CN') : '—')}</Text>
            {isYear && daysLeft !== null && daysLeft > 0 && <Text style={styles.memberDaysLeft}>还有 {daysLeft} 天</Text>}
          </View>
        </View>

        {/* Privileges */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>🎁 会员特权</Text>
          <View style={styles.privilegeGrid}>
            {['📷 扫码登录', '🪟 桌面小组件', '💬 优先客服', '🎧 声仓会员'].map((item) => (
              <View key={item} style={[styles.privilegeItem, { backgroundColor: theme.colors.background }]}>
                <Text style={[styles.privilegeText, { color: theme.colors.text }]}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Renew/Upgrade - iOS 不开放支付,整块隐藏 */}
        {!isLifetime && isMembershipPurchaseAvailable() && (
          <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.renewRow}>
              <View>
                <Text style={[styles.renewTitle, { color: theme.colors.text }]}>{isYear ? '升级永久卡' : '续费年卡'}</Text>
                <Text style={[styles.renewDesc, { color: theme.colors.textSecondary }]}>{isYear ? '永久有效' : '¥20/年'}</Text>
              </View>
              <TouchableOpacity style={[styles.renewBtn, { backgroundColor: '#f59e0b' }]} onPress={() => navigation.replace('MemberBenefits')}>
                <Text style={styles.renewBtnText}>{isYear ? '升级 ¥60' : '续费 ¥20'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Account Info */}
        <View style={[styles.section, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>📱 账户信息</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>手机号</Text>
            <Text style={{ color: theme.colors.text }}>{vipUser.phone ? `${vipUser.phone.slice(0,3)}****${vipUser.phone.slice(-4)}` : '未绑定'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>会员等级</Text>
            <Text style={{ color: '#f59e0b', fontWeight: '600' }}>{levelName}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>状态</Text>
            <Text style={{ color: '#10b981', fontWeight: '500' }}>● 正常</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: '#ef4444' }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.logoutBtnText}>退出会员账号</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  memberCard: { borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between' },
  memberInfo: {},
  memberExpiry: { alignItems: 'flex-end' },
  memberLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontSizes.xs },
  memberLevel: { color: '#fff', fontSize: fontSizes.xxl, fontWeight: 'bold', marginTop: 4 },
  memberExpiryText: { color: '#fff', fontSize: fontSizes.md, fontWeight: 'bold', marginTop: 4 },
  memberDaysLeft: { color: 'rgba(255,255,255,0.8)', fontSize: fontSizes.xs, marginTop: 4 },
  section: { borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { fontWeight: '600', fontSize: fontSizes.md, marginBottom: spacing.md },
  privilegeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  privilegeItem: { width: '48%', padding: spacing.sm, borderRadius: borderRadius.lg },
  privilegeText: { fontSize: fontSizes.sm },
  renewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  renewTitle: { fontWeight: '600', fontSize: fontSizes.md },
  renewDesc: { fontSize: fontSizes.sm, marginTop: 2 },
  renewBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg },
  renewBtnText: { color: '#fff', fontWeight: '600', fontSize: fontSizes.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  infoLabel: { fontSize: fontSizes.sm },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: borderRadius.lg, marginTop: spacing.sm, gap: spacing.sm },
  logoutBtnText: { color: '#fff', fontSize: fontSizes.md, fontWeight: '600' },
});
