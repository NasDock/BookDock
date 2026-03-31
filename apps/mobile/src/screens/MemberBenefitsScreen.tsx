import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'http://10.79.233.188:3000/api';

interface VipProduct {
  id: string; name: string; description: string; price: number; badge: string; features: string[];
}

export function MemberBenefitsScreen({ navigation }: any) {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const [products, setProducts] = useState<VipProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem('bookdock_vip_user');
      if (stored) {
        const user = JSON.parse(stored);
        setVipUser(user);
        if (user.isVip) navigation.replace('MemberDetail');
      }
    } catch {}
    try {
      const res = await fetch(`${API_BASE}/vip/products`);
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch {
      setProducts([
        { id: 'year', name: '年卡', description: '1年会员特权', price: 20, badge: '1年', features: ['无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
        { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', price: 60, badge: '永久', features: ['永久会员特权', '无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
      ]);
    }
  };

  const handleBuy = async (productId: string) => {
    const token = await AsyncStorage.getItem('bookdock_vip_token');
    if (!token) { navigation.replace('MemberLogin'); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vip/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, method: 'simulated' }),
      });
      const data = await res.json();
      if (data.orderId) {
        await fetch(`${API_BASE}/vip/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: data.orderId, tradeNo: `SIM_${Date.now()}`, method: 'simulated' }),
        });
        const updatedUser = { ...vipUser, level: productId, isVip: true, expiredAt: productId === 'year' ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() : null };
        await AsyncStorage.setItem('bookdock_vip_user', JSON.stringify(updatedUser));
        navigation.replace('MemberPaymentSuccess');
      } else {
        Alert.alert('错误', data.message || '创建订单失败');
      }
    } catch {
      Alert.alert('错误', '网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const benefitItems = ['📚 无限书籍', '🎧 语音朗读', '⭐ 新功能抢先', '🚫 去除广告', '💬 优先客服', '📖 高级阅读'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: '#f59e0b' }]}>
            <Text style={styles.logoText}>👑</Text>
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>会员特权</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>解锁全部功能</Text>
        </View>

        {/* Banner */}
        <View style={[styles.banner, { backgroundColor: '#f59e0b' }]}>
          <Text style={styles.bannerTitle}>✨ 会员专属特权</Text>
          <View style={styles.benefitGrid}>
            {benefitItems.map((item) => (
              <Text key={item} style={styles.benefitItem}>{item}</Text>
            ))}
          </View>
        </View>

        {/* Products */}
        {products.map((product) => (
          <View key={product.id} style={[styles.productCard, { backgroundColor: theme.colors.surface }]}>
            {product.id === 'lifetime' && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>推荐</Text>
              </View>
            )}
            <View style={styles.productHeader}>
              <Text style={[styles.productName, { color: theme.colors.text }]}>{product.name}</Text>
              <Text style={styles.productPrice}>¥{product.price}</Text>
            </View>
            <Text style={[styles.productDesc, { color: theme.colors.textSecondary }]}>{product.description}</Text>
            <View style={styles.featureList}>
              {product.features.map((f) => (
                <Text key={f} style={[styles.featureItem, { color: theme.colors.text }]}>
                  <Text style={{ color: '#10b981' }}>✓</Text> {f}
                </Text>
              ))}
            </View>
            {vipUser?.level === product.id && vipUser?.isVip ? (
              <View style={[styles.currentBadge, { backgroundColor: '#dcfce7' }]}>
                <Text style={[styles.currentBadgeText, { color: '#16a34a' }]}>✓ 当前方案</Text>
              </View>
            ) : (
              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.wechatBtn, { backgroundColor: '#07c160' }]} onPress={() => handleBuy(product.id)} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>微信支付</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.alipayBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => handleBuy(product.id)} disabled={isLoading}>
                  <Text style={[styles.alipayBtnText, { color: theme.colors.text }]}>支付宝</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* Notice */}
        <View style={[styles.noticeCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>📋 购买须知</Text>
          <Text style={[styles.noticeItem, { color: theme.colors.textSecondary }]}>• 年卡：购买后1年内有效</Text>
          <Text style={[styles.noticeItem, { color: theme.colors.textSecondary }]}>• 永久卡：一次购买，终身有效</Text>
          <Text style={[styles.noticeItem, { color: theme.colors.textSecondary }]}>• 支付成功后立即开通</Text>
        </View>

        {vipUser ? (
          <TouchableOpacity onPress={() => navigation.replace('MemberDetail')}>
            <Text style={[styles.actionLink, { color: '#f59e0b' }]}>查看会员详情 →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => navigation.replace('MemberLogin')}>
            <Text style={[styles.actionLink, { color: '#f59e0b' }]}>会员登录 →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  logo: { width: 64, height: 64, borderRadius: borderRadius.lg, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm },
  logoText: { fontSize: 32 },
  title: { fontSize: fontSizes.xxl, fontWeight: 'bold' },
  subtitle: { fontSize: fontSizes.md, marginTop: spacing.xs },
  banner: { borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  bannerTitle: { color: '#fff', fontWeight: 'bold', fontSize: fontSizes.lg, marginBottom: spacing.md },
  benefitGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  benefitItem: { width: '50%', color: '#fff', fontSize: fontSizes.sm, marginBottom: spacing.xs },
  productCard: { borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.md, position: 'relative' },
  recommendedBadge: { position: 'absolute', top: spacing.md, right: spacing.md, backgroundColor: '#a855f7', borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  recommendedText: { color: '#fff', fontSize: fontSizes.xs, fontWeight: 'bold' },
  productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  productName: { fontSize: fontSizes.xl, fontWeight: 'bold' },
  productPrice: { fontSize: fontSizes.xxl, fontWeight: 'bold', color: '#f59e0b' },
  productDesc: { fontSize: fontSizes.sm, marginBottom: spacing.md },
  featureList: { marginBottom: spacing.md },
  featureItem: { fontSize: fontSizes.sm, marginBottom: 4 },
  currentBadge: { paddingVertical: spacing.sm, borderRadius: borderRadius.lg, alignItems: 'center' },
  currentBadgeText: { fontWeight: '600', fontSize: fontSizes.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  wechatBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, alignItems: 'center' },
  alipayBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.lg, alignItems: 'center', borderWidth: 1 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: fontSizes.sm },
  alipayBtnText: { fontWeight: '600', fontSize: fontSizes.sm },
  noticeCard: { borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  noticeTitle: { fontWeight: '600', fontSize: fontSizes.md, marginBottom: spacing.sm },
  noticeItem: { fontSize: fontSizes.sm, marginBottom: 4 },
  actionLink: { textAlign: 'center', fontWeight: '600', fontSize: fontSizes.md },
});
