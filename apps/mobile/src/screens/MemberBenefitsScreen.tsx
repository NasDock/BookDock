/**
 * MemberBenefitsScreen — mobile2 版
 *
 * 1:1 复刻 mobile 旧版（94e4cf0），关键替换：
 * - @expo/vector-icons → react-native-vector-icons (Ionicons / AntDesign)
 * - SafeAreaView → View（mobile2 不用 react-native-safe-area-context，参见 MEMORY.md）
 * - expo-web-browser → react-native-inappbrowser-reborn（mobile2 已装）
 * - 其他 RN 内置 API 不变
 *
 * 保留 mobile 的关键行为：
 * 1. iOS 不开放会员购买：useEffect 里 Platform.OS === 'ios' 直接 replace('Settings')
 * 2. STATIC_PRODUCTS fallback：网络失败时显示 20/60 元兜底价（注释里的 "dead field" 保持一致）
 * 3. 4 免 4 会文案的 4 项 features：扫码登录 / 桌面小组件 / 优先客服 / 声仓会员（MEMORY.md 7 处对齐）
 * 4. 支付 overlay + 轮询 + AppState 监听：BookDock 自己的轮询逻辑，不依赖 AudioDock
 * 5. 拦住 hook usePlusAuthGuard：返回 'is-vip' / 'need-login' 时导航
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Platform, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, AppState, Modal, RefreshControl,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AntDesign from 'react-native-vector-icons/AntDesign';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore, useAuthStore } from '../stores';
import { getTheme, spacing, fontSizes, borderRadius } from '../utils/theme';
import { useOrientation } from '../hooks/useOrientation';
import { usePlusAuthGuard } from '../hooks/usePlusAuthGuard';
import {
  plusCreateVipPayment,
  plusGetMe,
  plusGetCurrentLowestPrice,
  plusGetMyCoupons,
  plusVerifyCoupon,
  plusQueryPaymentStatus,
  plusCancelOrder,
  type PlusCoupon,
  type VipCurrentLowestPriceData,
} from '../services/plus';
import {
  ensureWeChatRegistered,
  isWeChatModuleAvailable,
  payWithWeChat,
  WECHAT_APP_ID,
  type WechatPayPayload,
} from '../services/payments';

// ============ 静态兜底（与后端返回前的占位一致） ============
const STATIC_PRODUCTS: Array<{
  id: 'year' | 'lifetime';
  name: string;
  description: string;
  badge: string;
  fallbackPrice: number;
  features: string[];
}> = [
  { id: 'year', name: '年卡', description: '1 年内畅享全部会员特权', badge: '1 年', fallbackPrice: 20, features: ['扫码登录', '桌面小组件', '优先客服', '声仓会员'] },
  { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', badge: '永久', fallbackPrice: 60, features: ['扫码登录', '桌面小组件', '优先客服', '声仓会员'] },
];

// ============ 类型 ============
type PaymentMethod = 'WECHAT' | 'ALIPAY';

interface PaymentOverlay {
  productId: 'year' | 'lifetime';
  method: PaymentMethod;
  orderId: string;
  amount: number;
}

// ============ 主组件 ============
export function MemberBenefitsScreen({ navigation }: any) {
  const guard = usePlusAuthGuard();

  useEffect(() => {
    // iOS 不开放会员购买 (2026-08-12):任何路径(普通入口或 deep link)进到此屏,直接 redirect 回设置页
    if (Platform.OS === 'ios') {
      navigation.replace('Settings');
      return;
    }
    if (guard === 'need-login') {
      navigation.replace('MemberLogin');
    } else if (guard === 'is-vip') {
      navigation.replace('MemberDetail');
    }
  }, [guard, navigation]);

  const actualTheme = useThemeStore((state) => state.actualTheme);
  const theme = getTheme(actualTheme === 'dark');
  const orientation = useOrientation();
  const isLargeScreen = orientation.screenSize === 'large' || orientation.screenSize === 'xlarge';

  // 状态：选中的套餐、价格、优惠券
  const [selectedPlan, setSelectedPlan] = useState<'year' | 'lifetime'>('lifetime');
  const [pricing, setPricing] = useState<VipCurrentLowestPriceData | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [coupons, setCoupons] = useState<PlusCoupon[]>([]);
  const [selectedCouponCode, setSelectedCouponCode] = useState<string | null>(null);
  const [couponModalVisible, setCouponModalVisible] = useState(false);

  const { plusUser: vipUser, setPlusUser, refreshVipStatus } = useAuthStore();

  // 支付 overlay
  const [paymentOverlay, setPaymentOverlay] = useState<PaymentOverlay | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const activeOrderRef = useRef<{ orderId: string; userId: string; tier: string } | null>(null);

  // 计算当前选中套餐的价格
  const selectedProduct = STATIC_PRODUCTS.find((p) => p.id === selectedPlan)!;
  const basePrice =
    selectedPlan === 'lifetime'
      ? (pricing?.lifetime?.currentPrice ?? selectedProduct.fallbackPrice)
      : (pricing?.annual?.currentPrice ?? selectedProduct.fallbackPrice);
  const selectedCoupon = coupons.find((c) => c.code === selectedCouponCode) || null;
  const finalPrice = selectedCoupon
    ? Number((basePrice * (100 - selectedCoupon.discountPercent) / 100).toFixed(2))
    : basePrice;
  const hasDiscount = !!(selectedCoupon && selectedCoupon.discountPercent > 0 && basePrice > finalPrice);

  // 加载价格 + 优惠券
  // 诊断：之前 catch {} 吞了所有错误，价格拿不到时静默 fallback 到 STATIC_PRODUCTS.fallbackPrice
  // （20/60 元），看起来像没请求。现在打开 console.error 把失败原因打到 logcat。
  const loadData = useCallback(async () => {
    setPricingLoading(true);
    try {
      console.log('[MemberBenefits] → GET /vip/current-lowest-price');
      const priceRes = await plusGetCurrentLowestPrice();
      console.log('[MemberBenefits] ← /vip/current-lowest-price', JSON.stringify(priceRes));
      if (priceRes.code === 200 && priceRes.data) {
        setPricing(priceRes.data);
      } else {
        console.warn('[MemberBenefits] /vip/current-lowest-price non-200 payload', priceRes.code, priceRes.message);
      }
    } catch (err: any) {
      console.error('[MemberBenefits] /vip/current-lowest-price FAILED', {
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
        url: err?.config?.url,
        method: err?.config?.method,
        data: err?.response?.data,
      });
    }
    try {
      console.log('[MemberBenefits] → GET /coupons/mine');
      const couponRes = await plusGetMyCoupons();
      console.log('[MemberBenefits] ← /coupons/mine', JSON.stringify(couponRes));
      if (couponRes.code === 200 && Array.isArray(couponRes.data)) setCoupons(couponRes.data);
    } catch (err: any) {
      console.error('[MemberBenefits] /coupons/mine FAILED', {
        message: err?.message,
        code: err?.code,
        status: err?.response?.status,
      });
    } finally {
      setPricingLoading(false);
    }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);

  // 轮询订单支付结果
  const startPolling = useCallback((orderId: string, userId: string, tier: string) => {
    activeOrderRef.current = { orderId, userId, tier };
    let attempts = 0;
    const maxAttempts = 60;
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        Alert.alert('支付超时', '请刷新页面重试');
        setIsPolling(false);
        activeOrderRef.current = null;
        return;
      }
      if (AppState.currentState !== 'active') return;

      try {
        const res = await plusQueryPaymentStatus(orderId);
        if (res.code === 200 && res.data) {
          const status = res.data.status;
          if (status === 'paid') {
            clearInterval(timer);
            setIsPolling(false);
            activeOrderRef.current = null;
            // 刷新本地 vipUser
            const meRes = await plusGetMe(userId);
            const me: any = meRes.data;
            const currentTier = me?.vipTier;
            const isVipNow = currentTier === 'BASIC' || currentTier === 'LIFETIME';
            const currentVipUser = useAuthStore.getState().plusUser;
            const updatedUser = {
              ...currentVipUser,
              level: currentTier === 'LIFETIME' ? 'lifetime' : currentTier === 'BASIC' ? 'year' : 'free',
              isVip: isVipNow,
              expiredAt: me?.vipExpiresAt ?? null,
            };
            await AsyncStorage.setItem('bookdock_plus_user', JSON.stringify(updatedUser));
            setPlusUser(updatedUser);
            setPaymentOverlay(null);
            navigation.replace('MemberPaymentSuccess');
          } else if (status === 'failed' || status === 'cancelled') {
            clearInterval(timer);
            setIsPolling(false);
            activeOrderRef.current = null;
            Alert.alert('支付失败', '支付失败或已取消');
          }
        }
      } catch {
        // 继续轮询
      }
    }, 3000);
    pollRef.current = timer;
    setIsPolling(true);
  }, [navigation, setPlusUser]);

  // App 回到前台时立刻查一次订单
  const checkOrderStatusImmediately = useCallback(async (orderId: string, userId: string, tier: string) => {
    try {
      const res = await plusQueryPaymentStatus(orderId);
      if (res.code === 200 && res.data && res.data.status === 'paid') {
        if (pollRef.current) clearInterval(pollRef.current);
        setIsPolling(false);
        activeOrderRef.current = null;
        const meRes = await plusGetMe(userId);
        const me: any = meRes.data;
        const currentTier = me?.vipTier;
        const isVipNow = currentTier === 'BASIC' || currentTier === 'LIFETIME';
        const updatedUser = {
          ...(useAuthStore.getState().plusUser || {}),
          level: currentTier === 'LIFETIME' ? 'lifetime' : currentTier === 'BASIC' ? 'year' : 'free',
          isVip: isVipNow,
          expiredAt: me?.vipExpiresAt ?? null,
        };
        await AsyncStorage.setItem('bookdock_plus_user', JSON.stringify(updatedUser));
        setPlusUser(updatedUser);
        setPaymentOverlay(null);
        navigation.replace('MemberPaymentSuccess');
      }
    } catch {}
  }, [navigation, setPlusUser]);

  // 监听 AppState
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (activeOrderRef.current) {
          checkOrderStatusImmediately(
            activeOrderRef.current.orderId,
            activeOrderRef.current.userId,
            activeOrderRef.current.tier,
          );
        }
      }
      appState.current = nextAppState;
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      subscription.remove();
    };
  }, [checkOrderStatusImmediately]);

  // 唤起支付
  const handlePayment = useCallback(async (method: PaymentMethod) => {
    // 1. 拿 userId（zustand → AsyncStorage 兜底，与之前修的 userId 空 bug 一致）
    let userId: string | number | undefined = vipUser?.id;
    if (!userId) {
      const stored = await AsyncStorage.getItem('bookdock_plus_user');
      if (stored) {
        try { userId = JSON.parse(stored)?.id; } catch {}
      }
    }
    if (!userId) {
      const idStr = await AsyncStorage.getItem('bookdock_plus_user_id');
      if (idStr) {
        try { userId = JSON.parse(idStr); } catch {}
      }
    }
    if (!userId) {
      Alert.alert('错误', '请先登录会员账户');
      navigation.replace('MemberLogin');
      return;
    }

    // 2. 前置校验 native module 可用性 —— Fix 2026-08-12
    //    修复"订单已创建 + 微信模块未加载"两个弹窗同时出现的逻辑冲突。
    //    旧逻辑：先去后端创建订单 + set overlay + start polling，再校验 NativeModules.WeChat；
    //    如果 native 不在，订单已经创建、polling 已经在跑、overlay 已经挂着，只剩 alert 弹窗。
    //    新逻辑：native module 可用性必须在校验通过后才允许走到后端，避免悬挂订单。
    //    2026-08-12 改：包已经装上，native module 可用性由 payWithWeChat 内部 throw 接管。
    //    catch 分支会 cancel 订单 + 关 overlay + 弹友好 Alert，不会再出现两弹窗冲突。
    if (method === 'WECHAT' && !isWeChatModuleAvailable()) {
      Alert.alert(
        '微信支付暂不可用',
        '当前环境（开发/模拟器/Expo Go）未接入微信原生模块，请在 Android 真机/打包环境下使用微信支付。',
      );
      return;
    }

    setIsLoading(true);
    let createdOrderId: string | null = null;
    try {
      const vipTier = selectedPlan === 'lifetime' ? 'LIFETIME' : 'BASIC';
      const data = await plusCreateVipPayment({
        userId: String(userId),
        amount: finalPrice,
        method,
        forVip: true,
        forPoints: false,
        vipTier,
        clientType: 'app',
        couponCode: selectedCouponCode || undefined,
      });
      if (data.code !== 200) {
        Alert.alert('错误', data.message || '创建订单失败');
        return;
      }
      const result = data.data;
      if (!result) {
        Alert.alert('错误', '创建订单失败，未返回数据');
        return;
      }
      // 拿住订单号，catch 分支可以 cancel + 收尾
      createdOrderId = result.orderId;

      setPaymentOverlay({
        productId: selectedPlan,
        method,
        orderId: result.orderId,
        amount: result.finalAmount || finalPrice,
      });
      startPolling(result.orderId, String(userId), vipTier);

      if (method === 'WECHAT') {
        const wechatPay = result.wechatPay;
        if (!wechatPay) {
          throw new Error('后端未返回微信支付参数');
        }
        // 注册微信 SDK：只信后端返回的 appId（AudioDock 风格），不再用常量 fallback
        // 2026-08-12:之前 fallback 到 WECHAT_APP_ID='wx1234567890abcdef' 是错的做法，
        //   AudioDock 用的是占位符常量定义但 registerApp 时只用后端 appId。
        //   我们 BookDock 用的是 Plus 后端返回的 AudioDock appid(共享后端),
        //   但 Android 包名是 com.bookdock.app,跟微信开放平台注册 com.audiodock.app 不匹配 → 微信返回 -1。
        const appId = wechatPay.appId || wechatPay.appid;
        if (!appId) {
          throw new Error(`后端未返回微信支付 appId(wechatPay=${JSON.stringify(wechatPay)})`);
        }
        console.log('[MemberBenefits] wechatPay.appId =', appId, 'androidPackage =', 'com.bookdock.app');
        try {
          await ensureWeChatRegistered(appId);
        } catch (regErr) {
          console.warn('WeChat registerApp failed:', regErr);
        }
        const payParams: WechatPayPayload = {
          partnerId: wechatPay.partnerId || wechatPay.partnerid,
          prepayId: wechatPay.prepayId || wechatPay.prepayid,
          nonceStr: wechatPay.nonceStr || wechatPay.noncestr,
          timeStamp: String(wechatPay.timeStamp || wechatPay.timestamp),
          package: wechatPay.package || wechatPay.packageValue || 'Sign=WXPay',
          sign: wechatPay.sign,
        };
        await payWithWeChat(payParams, result.paymentUrl);
      } else if (method === 'ALIPAY') {
        const orderString = result.alipayPay?.orderString || result.alipayPay;
        let alipaySuccess = false;
        if (orderString) {
          try {
            const Alipay = require('@uiw/react-native-alipay').default;
            const alipayResult = await Alipay.alipay(orderString);
            const resultStatus = typeof alipayResult === 'object' ? alipayResult?.resultStatus : (alipayResult?.match(/resultStatus=\{(\d+)\}/)?.[1] || alipayResult);
            if (resultStatus === '9000') alipaySuccess = true;
          } catch (alipayErr) {
            console.warn('Alipay native call failed:', alipayErr);
          }
        }
        if (!alipaySuccess) {
          const paymentUrl = result.paymentUrl;
          if (paymentUrl) {
            try {
              // mobile2 替换 expo-web-browser → react-native-inappbrowser-reborn
              const InAppBrowser = require('react-native-inappbrowser-reborn').default;
              await InAppBrowser.open(paymentUrl);
            } catch (browserErr) {
              const canOpen = await Linking.canOpenURL(paymentUrl);
              if (canOpen) await Linking.openURL(paymentUrl);
            }
          } else {
            Alert.alert('错误', '未返回支付宝支付参数或网页支付链接');
          }
        }
      }
    } catch (e: any) {
      // 错误分类：先看订单是否已创建
      //   - createdOrderId !== null：订单已挂在后端，本地必须 cancel + 关闭 overlay
      //   - createdOrderId === null：订单尚未创建，只是创建/前置阶段出错
      if (createdOrderId) {
        // 唤起支付阶段出错 → 清理订单 + 关 overlay，不让订单悬空
        try { await plusCancelOrder(createdOrderId); } catch (cancelErr) {
          console.warn('[MemberBenefits] cancel order failed', cancelErr);
        }
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        activeOrderRef.current = null;
        setPaymentOverlay(null);
        setIsPolling(false);
        Alert.alert(
          e?.message ? '支付失败' : '支付失败',
          e?.message || '请稍后重试',
        );
        return;
      }
      // 创建订单阶段的错误：401 / 网络 / 5xx / 其他
      const status = e?.response?.status;
      if (status === 401) {
        Alert.alert('登录已过期', '请重新登录会员账户', [
          { text: '取消', style: 'cancel' },
          {
            text: '去登录',
            onPress: () => navigation.replace('MemberLogin'),
          },
        ]);
      } else if (!status && (e?.message?.includes('Network') || e?.code === 'ECONNABORTED' || e?.code === 'ENOTFOUND')) {
        Alert.alert('网络异常', '请检查网络连接后重试');
      } else if (status >= 500) {
        Alert.alert('服务暂不可用', '请稍后重试');
      } else {
        Alert.alert('创建订单失败', e?.message || '请稍后重试');
      }
    } finally {
      setIsLoading(false);
    }
  }, [vipUser, selectedPlan, finalPrice, selectedCouponCode, startPolling, navigation]);

  const closeOverlay = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    activeOrderRef.current = null;
    if (paymentOverlay?.orderId) {
      try { await plusCancelOrder(paymentOverlay.orderId); } catch {}
    }
    setPaymentOverlay(null);
    setIsPolling(false);
  }, [paymentOverlay]);

  const handleLogout = () => {
    Alert.alert('退出登录', '确认要退出会员账号吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('bookdock_plus_token');
          await AsyncStorage.removeItem('bookdock_plus_user');
          await AsyncStorage.removeItem('bookdock_plus_user_id');
          refreshVipStatus();
          navigation.replace('MemberLogin');
        },
      },
    ]);
  };

  // ============ 渲染 ============

  // 对比表数据
  const comparisonData = [
    { feature: '基础功能', free: true, member: true },
    { feature: '云端同步', free: true, member: true },
    { feature: '云端朗读', free: true, member: true },
    { feature: '免广告', free: true, member: true },
    { feature: '扫码登录', free: false, member: true },
    { feature: '桌面小组件', free: false, member: true },
    { feature: '优先客服', free: false, member: true },
    { feature: '声仓会员', free: false, member: true },
  ];

  const formatPrice = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const renderPriceMeta = () => {
    if (!hasDiscount || !selectedCoupon) return null;
    return (
      <View style={styles.priceMeta}>
        <Text style={[styles.originalPriceText, { color: theme.colors.textSecondary }]}>
          原价 <Text style={styles.originalPriceValue}>¥{formatPrice(basePrice)}</Text>
        </Text>
        <Text style={[styles.savedPriceText, { color: theme.colors.textSecondary }]}>
          已优惠 ¥{formatPrice(basePrice - finalPrice)}
        </Text>
      </View>
    );
  };

  return (
    // mobile2 不用 SafeAreaView — React Navigation native-stack header 处理顶部 inset,
    // 这里用普通 <View>;ScrollView 的 paddingBottom: 40 覆盖底部 home indicator。
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={pricingLoading} onRefresh={loadData} />}
      >

        {/* ============ 对比表 ============ */}
        <View style={[styles.tableCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2, color: theme.colors.textSecondary }]}>功能</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center', color: theme.colors.textSecondary }]}>免费</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center', color: theme.colors.textSecondary }]}>会员</Text>
          </View>
          {comparisonData.map((item, index) => (
            <View
              key={index}
              style={[styles.tableRow, { borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: theme.colors.border }]}
            >
              <Text style={[styles.featureText, { flex: 2, color: theme.colors.text }]}>{item.feature}</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Ionicons
                  name={item.free ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={item.free ? theme.colors.primary : theme.colors.textSecondary}
                  style={{ opacity: item.free ? 1 : 0.3 }}
                />
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle" size={22} color="#FFD700" />
              </View>
            </View>
          ))}
        </View>

        {/* ============ 套餐标题 ============ */}
        <View style={styles.dividerContainer}>
          <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>选择套餐</Text>
        </View>

        {/* ============ 套餐卡 ============ */}
        <View style={[styles.plansContainer, isLargeScreen && styles.plansContainerLarge]}>
          {/* 年卡 */}
          <TouchableOpacity
            style={[
              styles.planCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: selectedPlan === 'year' ? theme.colors.primary : theme.colors.border,
              },
              selectedPlan === 'year' && { borderWidth: 2 },
            ]}
            onPress={() => setSelectedPlan('year')}
          >
            <Text style={[styles.planName, { color: theme.colors.text }]}>{STATIC_PRODUCTS[0].name}</Text>
            <View style={styles.priceContainer}>
              <Text style={[styles.currency, { color: theme.colors.primary }]}>¥</Text>
              <Text style={[styles.priceAmount, { color: theme.colors.primary }]}>
                {formatPrice(pricing?.annual?.currentPrice ?? STATIC_PRODUCTS[0].fallbackPrice)}
              </Text>
              <Text style={[styles.unit, { color: theme.colors.textSecondary }]}>/ 年</Text>
            </View>
            {hasDiscount && selectedPlan === 'year' ? (
              <View style={styles.priceMeta}>
                <Text style={[styles.originalPriceText, { color: theme.colors.textSecondary }]}>
                  原价 <Text style={styles.originalPriceValue}>¥{formatPrice(pricing?.annual?.originalPrice ?? STATIC_PRODUCTS[0].fallbackPrice)}</Text>
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {/* 永久卡 */}
          <TouchableOpacity
            style={[
              styles.planCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: selectedPlan === 'lifetime' ? '#FFD700' : theme.colors.border,
              },
              selectedPlan === 'lifetime' && { borderWidth: 2 },
            ]}
            onPress={() => setSelectedPlan('lifetime')}
          >
            <View style={[styles.recommendBadge, { opacity: selectedPlan === 'lifetime' ? 1 : 0.6 }]}>
              <Text style={styles.recommendText}>推荐</Text>
            </View>
            <Text style={[styles.planName, { color: theme.colors.text }]}>{STATIC_PRODUCTS[1].name}</Text>
            <View style={styles.priceContainer}>
              <Text style={[styles.currency, { color: theme.colors.primary }]}>¥</Text>
              <Text style={[styles.priceAmount, { color: theme.colors.primary }]}>
                {formatPrice(pricing?.lifetime?.currentPrice ?? STATIC_PRODUCTS[1].fallbackPrice)}
              </Text>
              <Text style={[styles.unit, { color: theme.colors.textSecondary }]}>永久</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ============ 优惠券 ============ */}
        <View style={styles.dividerContainer}>
          <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>优惠券</Text>
        </View>

        <TouchableOpacity
          style={[styles.couponPicker, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          onPress={() => setCouponModalVisible(true)}
        >
          <Text style={{ color: theme.colors.text }}>
            {selectedCouponCode || '不使用优惠券'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.text} />
        </TouchableOpacity>

        {selectedCoupon ? (
          <View style={styles.couponSummary}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              优惠后价格：
              <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 16 }}>¥{formatPrice(finalPrice)}</Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12, textDecorationLine: 'line-through', marginLeft: 16 }}>
                ¥{formatPrice(basePrice)}
              </Text>
            </Text>
          </View>
        ) : null}

        {/* ============ 优惠券选择 Modal ============ */}
        <Modal
          visible={couponModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCouponModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setCouponModalVisible(false)}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>选择优惠券</Text>
              <ScrollView style={{ maxHeight: 360 }}>
                <TouchableOpacity
                  style={[
                    styles.modalOption,
                    {
                      backgroundColor: selectedCouponCode === null ? theme.colors.primary + '18' : 'transparent',
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.colors.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedCouponCode(null);
                    setCouponModalVisible(false);
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 15 }}>不使用优惠券</Text>
                  {selectedCouponCode === null ? (
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                  ) : null}
                </TouchableOpacity>
                {coupons.map((item) => {
                  const zhe = (100 - item.discountPercent) / 10;
                  const zheLabel = Number.isInteger(zhe) ? `${zhe}折` : `${zhe.toFixed(1)}折`;
                  const isSelected = selectedCouponCode === item.code;
                  return (
                    <TouchableOpacity
                      key={item.code}
                      style={[
                        styles.modalOption,
                        {
                          backgroundColor: isSelected ? theme.colors.primary + '18' : 'transparent',
                          borderBottomWidth: 0.5,
                          borderBottomColor: theme.colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedCouponCode(item.code);
                        setCouponModalVisible(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 15 }}>
                          {item.code} · {zheLabel}
                        </Text>
                      </View>
                      {isSelected ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ============ 支付方式 ============ */}
        <View style={styles.dividerContainer}>
          <Text style={[styles.dividerText, { color: theme.colors.textSecondary }]}>支付方式</Text>
        </View>
        <Text style={[styles.paymentHintText, { color: theme.colors.textSecondary }]}>
          支付即视为同意会员服务协议，虚拟商品一经售出概不退换。
        </Text>

        <View style={styles.paymentMethods}>
          <TouchableOpacity
            style={[
              styles.paymentItem,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: isLoading ? 0.6 : 1 },
            ]}
            onPress={() => handlePayment('WECHAT')}
            disabled={isLoading || basePrice == null}
          >
            <AntDesign name="wechat" size={24} color="#1AAD19" />
            <Text style={[styles.paymentText, { color: theme.colors.text }]}>微信支付</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: isLoading ? 0.6 : 1 }]}
            onPress={() => handlePayment('ALIPAY')}
            disabled={isLoading || basePrice == null}
          >
            <AntDesign name="alipay-circle" size={24} color="#02A9F1" />
            <Text style={[styles.paymentText, { color: theme.colors.text }]}>支付宝</Text>
          </TouchableOpacity>
        </View>

        {/* ============ 已开通入口 / 退出登录 ============ */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.colors.error + '14', borderColor: theme.colors.error }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.colors.error} />
          <Text style={[styles.logoutText, { color: theme.colors.error }]}>退出会员账号</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ============ 支付进度 Overlay ============ */}
      {paymentOverlay ? (
        <View style={[styles.overlayContainer, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.overlayCard, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity style={styles.overlayClose} onPress={closeOverlay}>
              <Text style={{ fontSize: 20, color: theme.colors.textSecondary }}>✕</Text>
            </TouchableOpacity>
            <Text style={[styles.overlayTitle, { color: theme.colors.text }]}>订单已创建</Text>
            <Text style={[styles.overlaySubtitle, { color: theme.colors.textSecondary }]}>
              订单号：{paymentOverlay.orderId} · 金额：¥{paymentOverlay.amount}
            </Text>
            {paymentOverlay.method === 'WECHAT' ? (
              <View style={{ alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}>
                <Text style={{ color: theme.colors.textSecondary }}>已唤起微信支付</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: fontSizes.xs }}>支付完成后将自动跳转</Text>
              </View>
            ) : null}
            {paymentOverlay.method === 'ALIPAY' ? (
              <View style={{ alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}>
                <Text style={{ color: theme.colors.textSecondary }}>已唤起支付宝</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: fontSizes.xs }}>支付完成后将自动跳转</Text>
              </View>
            ) : null}
            {isPolling ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={{ color: theme.colors.textSecondary }}>正在查询支付结果...</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ============ 样式 ============
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  // 对比表
  tableCard: { borderRadius: borderRadius.xl, borderWidth: 1, paddingVertical: 10, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  tableHeaderText: { fontSize: 12, fontWeight: '600' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  featureText: { fontSize: 14, fontWeight: '500' },
  // 套餐
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg },
  dividerText: { fontSize: 12 },
  plansContainer: { flexDirection: 'row', gap: spacing.md + 3 },
  plansContainerLarge: { gap: spacing.lg },
  planCard: { flex: 1, borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 16, fontWeight: '600', marginBottom: spacing.sm },
  priceContainer: { flexDirection: 'row', alignItems: 'baseline' },
  currency: { fontSize: 14, fontWeight: 'bold' },
  priceAmount: { fontSize: 28, fontWeight: 'bold', marginHorizontal: 2 },
  unit: { fontSize: 12 },
  priceMeta: { marginTop: spacing.sm, alignItems: 'center', gap: 2 },
  originalPriceText: { fontSize: 11 },
  originalPriceValue: { textDecorationLine: 'line-through' },
  savedPriceText: { fontSize: 11 },
  recommendBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#FFD700', paddingHorizontal: spacing.sm, paddingVertical: 4, borderTopRightRadius: 14, borderBottomLeftRadius: 10, zIndex: 1 },
  recommendText: { color: '#000', fontSize: 10, fontWeight: 'bold' },
  // 优惠券
  couponPicker: { borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  couponSummary: { marginTop: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  modalContent: { width: '100%', borderRadius: 16, paddingTop: spacing.lg, paddingBottom: spacing.sm + 2, overflow: 'hidden' },
  modalTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: spacing.sm + 4, paddingHorizontal: spacing.lg },
  modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg },
  // 支付方式
  paymentHintText: { fontSize: 12, marginTop: -spacing.sm, marginBottom: spacing.sm + 2 },
  paymentMethods: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md + 3 },
  paymentItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg + 4, borderRadius: 16, borderWidth: 1, flex: 1, justifyContent: 'center' },
  paymentText: { fontSize: 14, fontWeight: '600' },
  // 退出
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, width: '100%', padding: spacing.md + 3, borderRadius: 12, borderWidth: 1, marginTop: spacing.lg + 10 },
  logoutText: { fontSize: 16, fontWeight: '600' },
  // Overlay
  overlayContainer: { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  overlayCard: { borderRadius: borderRadius.xl, padding: spacing.lg, width: '100%', maxWidth: 360, position: 'relative' },
  overlayClose: { position: 'absolute', top: spacing.md, right: spacing.md, padding: spacing.sm },
  overlayTitle: { fontSize: fontSizes.lg, fontWeight: 'bold', textAlign: 'center', marginBottom: spacing.xs },
  overlaySubtitle: { fontSize: fontSizes.sm, textAlign: 'center', marginBottom: spacing.sm },
});
