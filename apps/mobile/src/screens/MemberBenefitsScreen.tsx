import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { plusCreateVipPayment, plusGetMe, plusGetCurrentLowestPrice, plusGetMyCoupons, plusVerifyCoupon, plusQueryPaymentStatus, plusCancelOrder } from '../services/plus';

const STATIC_PRODUCTS: VipProduct[] = [
  { id: 'year', name: '年卡', description: '1年会员特权', price: 20, badge: '1年', features: ['无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
  { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', price: 60, badge: '永久', features: ['永久会员特权', '无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
];

interface VipProduct {
  id: string; name: string; description: string; price: number; badge: string; features: string[];
}

interface PaymentOverlay {
  productId: string;
  method: 'WECHAT' | 'ALIPAY';
  orderId: string;
  amount: number;
}

export function MemberBenefitsScreen({ navigation }: any) {
  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const [products, setProducts] = useState<VipProduct[]>(STATIC_PRODUCTS);
  const [isLoading, setIsLoading] = useState(false);
  const { plusUser: vipUser, setPlusUser, refreshVipStatus } = useAuthStore();
  const [lowestPrice, setLowestPrice] = useState<{ annual?: number; lifetime?: number }>({});
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Payment overlay state
  const [paymentOverlay, setPaymentOverlay] = useState<PaymentOverlay | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const vip = await refreshVipStatus();
      if (vip) navigation.replace('MemberDetail');
    } catch {}
    try {
      const priceRes = await plusGetCurrentLowestPrice();
      if (priceRes.code === 0 && priceRes.data) {
        const annualRaw = priceRes.data.annual ?? priceRes.data.annualPrice;
        const lifetimeRaw = priceRes.data.lifetime ?? priceRes.data.lifetimePrice;
        const annual = typeof annualRaw === 'object' && annualRaw !== null ? annualRaw.currentPrice : annualRaw;
        const lifetime = typeof lifetimeRaw === 'object' && lifetimeRaw !== null ? lifetimeRaw.currentPrice : lifetimeRaw;
        setLowestPrice({
          annual: annual !== undefined ? Number(annual) : undefined,
          lifetime: lifetime !== undefined ? Number(lifetime) : undefined,
        });
      }
    } catch {}
    try {
      const couponRes = await plusGetMyCoupons();
      if (couponRes.code === 0 && Array.isArray(couponRes.data)) setCoupons(couponRes.data);
    } catch {}
  };

  const startPolling = useCallback((orderId: string, userId: string, tier: string) => {
    let attempts = 0;
    const maxAttempts = 60;
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        Alert.alert('支付超时', '请刷新页面重试');
        setIsPolling(false);
        return;
      }
      try {
        const res = await plusQueryPaymentStatus(orderId);
        if (res.code === 0 && res.data) {
          const status = res.data.status;
          if (status === 'paid') {
            clearInterval(timer);
            setIsPolling(false);
            const meRes = await plusGetMe(userId);
            const me = meRes.data;
            const currentTier = me?.vipTier;
            const isVipNow = currentTier === 'BASIC' || currentTier === 'LIFETIME';
            const updatedUser = { ...vipUser, level: currentTier === 'LIFETIME' ? 'lifetime' : currentTier === 'BASIC' ? 'year' : 'free', isVip: isVipNow, expiredAt: me?.vipExpiresAt ?? null };
            await AsyncStorage.setItem('bookdock_plus_user', JSON.stringify(updatedUser));
            setPlusUser(updatedUser);
            setPaymentOverlay(null);
            navigation.replace('MemberPaymentSuccess');
          } else if (status === 'failed' || status === 'cancelled') {
            clearInterval(timer);
            setIsPolling(false);
            Alert.alert('支付失败', '支付失败或已取消');
          }
        }
      } catch {
        // continue polling
      }
    }, 3000);
    pollRef.current = timer;
    setIsPolling(true);
  }, [vipUser, navigation]);

  const handleBuy = async (productId: string, method: 'WECHAT' | 'ALIPAY') => {
    const token = await AsyncStorage.getItem('bookdock_plus_token');
    if (!token) { navigation.replace('MemberLogin'); return; }
    setIsLoading(true);
    try {
      const userId = vipUser?.id;
      if (!userId) {
        Alert.alert('错误', '请先登录会员账户');
        navigation.replace('MemberLogin');
        return;
      }
      const rawAmount = productId === 'lifetime' ? (lowestPrice.lifetime ?? 60) : (lowestPrice.annual ?? 20);
      const amount = Number((rawAmount * (100 - couponDiscount) / 100).toFixed(2));
      const vipTier = productId === 'lifetime' ? 'LIFETIME' : 'BASIC';
      const data = await plusCreateVipPayment({ userId, amount, method, forVip: true, forPoints: false, vipTier, clientType: 'app', couponCode: couponCode || undefined });
      if (data.code !== 0) {
        Alert.alert('错误', data.message || '创建订单失败');
        return;
      }
      const result = data.data;
      if (!result) {
        Alert.alert('错误', '创建订单失败，未返回数据');
        return;
      }
      if (method === 'WECHAT' && result.qrCode) {
        const canOpen = await Linking.canOpenURL(result.qrCode);
        if (canOpen) await Linking.openURL(result.qrCode);
      } else if (method === 'ALIPAY' && result.paymentUrl) {
        const canOpen = await Linking.canOpenURL(result.paymentUrl);
        if (canOpen) await Linking.openURL(result.paymentUrl);
      }
      setPaymentOverlay({ productId, method, orderId: result.orderId, amount: result.finalAmount || amount });
      startPolling(result.orderId, userId, vipTier);
    } catch {
      Alert.alert('错误', '网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const closeOverlay = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (paymentOverlay?.orderId) {
      try {
        await plusCancelOrder(paymentOverlay.orderId);
      } catch {
        // ignore cancel error
      }
    }
    setPaymentOverlay(null);
    setIsPolling(false);
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

        <View style={[styles.noticeCard, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.text }]}>🎟 优惠券</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput value={couponCode} onChangeText={setCouponCode} placeholder="输入优惠码" style={[styles.couponInput, { borderColor: theme.colors.border, color: theme.colors.text }]} />
            <TouchableOpacity style={[styles.wechatBtn, { backgroundColor: '#f59e0b', flex: 0 }]} onPress={async () => {
              if (!vipUser?.id || !couponCode) return;
              const res = await plusVerifyCoupon(couponCode, vipUser.id);
              if (res.code === 0 && res.data?.valid) setCouponDiscount(res.data.discountPercent || 0);
              else Alert.alert('提示', res.message || '优惠券不可用');
            }}>
              <Text style={styles.btnText}>使用</Text>
            </TouchableOpacity>
          </View>
          {couponDiscount > 0 && <Text style={{ color: '#16a34a', marginTop: 8 }}>已优惠 {couponDiscount}%</Text>}
          {coupons.length > 0 && <Text style={[styles.noticeItem, { color: theme.colors.textSecondary }]}>可用：{coupons.map((c) => `${c.code}(${c.discountPercent}%)`).join('，')}</Text>}
        </View>

        {/* Products */}
        {products.map((product) => {
          const displayPrice = product.id === 'lifetime' ? (lowestPrice.lifetime ?? product.price) : (lowestPrice.annual ?? product.price);
          return (
          <View key={product.id} style={[styles.productCard, { backgroundColor: theme.colors.surface }]}>
            {product.id === 'lifetime' && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>推荐</Text>
              </View>
            )}
            <View style={styles.productHeader}>
              <Text style={[styles.productName, { color: theme.colors.text }]}>{product.name}</Text>
              <Text style={styles.productPrice}>¥{displayPrice}</Text>
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
                <TouchableOpacity style={[styles.wechatBtn, { backgroundColor: '#07c160' }]} onPress={() => handleBuy(product.id, 'WECHAT')} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>微信支付</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.alipayBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={() => handleBuy(product.id, 'ALIPAY')} disabled={isLoading}>
                  <Text style={[styles.alipayBtnText, { color: theme.colors.text }]}>支付宝</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )})}

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

      {/* Payment Overlay */}
      {paymentOverlay && (
        <View style={[styles.overlayContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.overlayCard, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity style={styles.overlayClose} onPress={closeOverlay}>
              <Text style={{ fontSize: 20, color: theme.colors.textSecondary }}>✕</Text>
            </TouchableOpacity>
            <Text style={[styles.overlayTitle, { color: theme.colors.text }]}>订单已创建</Text>
            <Text style={[styles.overlaySubtitle, { color: theme.colors.textSecondary }]}>
              订单号：{paymentOverlay.orderId} · 金额：¥{paymentOverlay.amount}
            </Text>
            {paymentOverlay.method === 'WECHAT' && (
              <View style={{ alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}>
                <Text style={{ color: theme.colors.textSecondary }}>已唤起微信支付</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: fontSizes.xs }}>支付完成后将自动跳转</Text>
              </View>
            )}
            {paymentOverlay.method === 'ALIPAY' && (
              <View style={{ alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}>
                <Text style={{ color: theme.colors.textSecondary }}>已唤起支付宝</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: fontSizes.xs }}>支付完成后将自动跳转</Text>
              </View>
            )}
            {isPolling && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={{ color: theme.colors.textSecondary }}>正在查询支付结果...</Text>
              </View>
            )}
          </View>
        </View>
      )}
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
  couponInput: { flex: 1, borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  actionLink: { textAlign: 'center', fontWeight: '600', fontSize: fontSizes.md },
  overlayContainer: { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  overlayCard: { borderRadius: borderRadius.xl, padding: spacing.lg, width: '100%', maxWidth: 360, position: 'relative' },
  overlayClose: { position: 'absolute', top: spacing.md, right: spacing.md, padding: spacing.sm },
  overlayTitle: { fontSize: fontSizes.lg, fontWeight: 'bold', textAlign: 'center', marginBottom: spacing.xs },
  overlaySubtitle: { fontSize: fontSizes.sm, textAlign: 'center', marginBottom: spacing.sm },
});
