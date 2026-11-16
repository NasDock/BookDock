// [API 23+] screens/MemberBenefitsScreen.ets — 1:1 对齐 mobile MemberBenefitsScreen.tsx
// 会员权益页:4免4会对比表 / 套餐卡(年卡/永久卡) / 优惠券选择 / 微信支付 / 支付轮询
// mobile → hm 关键差异:
//   1. usePlusAuthGuard → aboutToAppear 内手动判断(need-login → MemberLogin,is-vip → MemberDetail)
//   2. 微信支付(native module)→ @tencent/wechat_open_sdk 集成属另一专项,本页先接
//      创建订单 + 轮询链路;wechatPay 唤起留 toast 占位(后端仍返回 wechatPay 参数)
//   3. 支付宝 → hm 端无 alipay SDK,按钮展示但点击 toast「暂不支持」
//   4. AppState 监听 → 暂未接入,轮询本身保留(3s/60 次)
//   5. Ionicons/AntDesign → AppIcon/几何字符(wechat 绿块 W,alipay 蓝块 支)
//   6. RN Modal(优惠券) → Stack 全屏 overlay
//   7. RefreshControl → 暂不支持,用 pricingLoading 状态即可
import { promptAction } from '@kit.ArkUI';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { replaceRoute, RouteName } from '../router/AppRouter';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { AuthStore, PlusUser } from '../store/AuthStore';
import {
  plusCreateVipPayment,
  plusGetMe,
  plusGetCurrentLowestPrice,
  plusGetMyCoupons,
  plusQueryPaymentStatus,
  plusCancelOrder,
  ISuccessResponse,
  PaymentMethod,
  PlusCoupon,
  VipCurrentLowestPriceData,
  CreatePaymentResult,
  PaymentStatusResult
} from '../network/PlusClient';

// ─── 静态兜底套餐(对齐 mobile STATIC_PRODUCTS)─────────────────────────
interface StaticProduct {
  id: string; // 'year' | 'lifetime'
  name: string;
  description: string;
  badge: string;
  fallbackPrice: number;
}

const STATIC_PRODUCTS: StaticProduct[] = [
  { id: 'year', name: '年卡', description: '1 年内畅享全部会员特权', badge: '1 年', fallbackPrice: 20 },
  { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', badge: '永久', fallbackPrice: 60 }
];

// ─── 对比表数据(对齐 mobile comparisonData,「4 免 4 会」)──────────────────
interface ComparisonItem {
  feature: string;
  free: boolean;
  member: boolean;
}

const COMPARISON_DATA: ComparisonItem[] = [
  { feature: '基础功能', free: true, member: true },
  { feature: '云端同步', free: true, member: true },
  { feature: '云端朗读', free: true, member: true },
  { feature: '免广告', free: true, member: true },
  { feature: '扫码登录', free: false, member: true },
  { feature: '桌面小组件', free: false, member: true },
  { feature: '优先客服', free: false, member: true },
  { feature: '声仓会员', free: false, member: true }
];

// ─── 支付 overlay 数据(对齐 mobile PaymentOverlay)─────────────────────────
interface PaymentOverlayData {
  productId: string;
  method: string;
  orderId: string;
  amount: number;
}

// 对齐 mobile formatPrice
function formatPrice(n: number): string {
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toFixed(2);
}

@Component
export struct MemberBenefitsScreen {
  @State private selectedPlan: string = 'lifetime';
  @State private pricing: VipCurrentLowestPriceData | null = null;
  @State private pricingLoading: boolean = true;
  @State private coupons: PlusCoupon[] = [];
  @State private selectedCouponCode: string = '';
  @State private hasSelectedCoupon: boolean = false;
  @State private couponModalVisible: boolean = false;
  @State private paymentOverlay: PaymentOverlayData | null = null;
  @State private isPolling: boolean = false;
  @State private isLoading: boolean = false;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  private pollTimer: number = -1;

  aboutToAppear(): void {
    this.applyTheme();
    // 对齐 mobile usePlusAuthGuard:未登录 → MemberLogin;已 VIP → MemberDetail
    const auth: AuthStore = AuthStore.shared();
    if (auth.isVip) {
      replaceRoute(RouteName.MEMBER_DETAIL);
      return;
    }
    void this.checkLoginAndLoad();
  }

  aboutToDisappear(): void {
    this.clearPoll();
  }

  private async checkLoginAndLoad(): Promise<void> {
    const plusToken: string = await PreferencesStore.readString(PrefKey.PLus_TOKEN, '');
    if (plusToken.length === 0) {
      replaceRoute(RouteName.MEMBER_LOGIN);
      return;
    }
    void this.loadData();
  }

  private applyTheme(): void {
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
  }

  private clearPoll(): void {
    if (this.pollTimer >= 0) {
      clearInterval(this.pollTimer);
      this.pollTimer = -1;
    }
  }

  // ─── 价格/优惠券加载(对齐 mobile loadData)─────────────────────────────
  private async loadData(): Promise<void> {
    this.pricingLoading = true;
    try {
      const priceRes: ISuccessResponse<VipCurrentLowestPriceData> = await plusGetCurrentLowestPrice();
      if (priceRes.code === 200 && priceRes.data) {
        this.pricing = priceRes.data;
      }
    } catch {
      // 失败时静默 fallback 到 STATIC_PRODUCTS.fallbackPrice(对齐 mobile)
    }
    try {
      const couponRes: ISuccessResponse<PlusCoupon[]> = await plusGetMyCoupons();
      if (couponRes.code === 200 && Array.isArray(couponRes.data)) {
        this.coupons = couponRes.data;
      }
    } catch {
      // 静默失败
    } finally {
      this.pricingLoading = false;
    }
  }

  // ─── 价格计算(对齐 mobile basePrice/finalPrice/hasDiscount)───────────────
  private basePrice(): number {
    if (this.selectedPlan === 'lifetime') {
      return this.pricing?.lifetime?.currentPrice ?? STATIC_PRODUCTS[1].fallbackPrice;
    }
    return this.pricing?.annual?.currentPrice ?? STATIC_PRODUCTS[0].fallbackPrice;
  }

  private selectedCoupon(): PlusCoupon | null {
    if (!this.hasSelectedCoupon) {
      return null;
    }
    const found: PlusCoupon | undefined = this.coupons.find((c: PlusCoupon): boolean => c.code === this.selectedCouponCode);
    return found ?? null;
  }

  private finalPrice(): number {
    const coupon: PlusCoupon | null = this.selectedCoupon();
    if (coupon) {
      return Number((this.basePrice() * (100 - coupon.discountPercent) / 100).toFixed(2));
    }
    return this.basePrice();
  }

  private hasDiscount(): boolean {
    const coupon: PlusCoupon | null = this.selectedCoupon();
    return !!coupon && coupon.discountPercent > 0 && this.basePrice() > this.finalPrice();
  }

  // ─── 轮询订单(对齐 mobile startPolling,3s × 60 次)────────────────────────
  private startPolling(orderId: string, userId: string): void {
    this.clearPoll();
    this.isPolling = true;
    let attempts: number = 0;
    const maxAttempts: number = 60;
    this.pollTimer = setInterval((): void => {
      attempts++;
      if (attempts > maxAttempts) {
        this.clearPoll();
        this.isPolling = false;
        promptAction.showDialog({
          title: '支付超时',
          message: '请刷新页面重试',
          buttons: [{ text: '好的', color: this.themePrimary }]
        });
        return;
      }
      void this.pollOnce(orderId, userId);
    }, 3000);
  }

  private async pollOnce(orderId: string, userId: string): Promise<void> {
    try {
      const res: ISuccessResponse<PaymentStatusResult> = await plusQueryPaymentStatus(orderId);
      if (res.code === 200 && res.data) {
        const status: string = res.data.status.toLowerCase();
        if (status === 'paid') {
          this.clearPoll();
          this.isPolling = false;
          await this.applyPaidVip(userId);
          this.paymentOverlay = null;
          replaceRoute(RouteName.MEMBER_PAYMENT_SUCCESS);
        } else if (status === 'failed' || status === 'cancelled') {
          this.clearPoll();
          this.isPolling = false;
          promptAction.showDialog({
            title: '支付失败',
            message: '支付失败或已取消',
            buttons: [{ text: '好的', color: this.themePrimary }]
          });
        }
      }
    } catch {
      // 继续轮询(对齐 mobile catch {})
    }
  }

  // 支付成功后刷新本地 VIP(对齐 mobile plusGetMe + AsyncStorage + setPlusUser)
  private async applyPaidVip(userId: string): Promise<void> {
    try {
      const meRes: ISuccessResponse<object> = await plusGetMe(userId);
      const me: Record<string, Object> = meRes.data as Record<string, Object>;
      const currentTier: string = (me['vipTier'] as string) ?? '';
      const isVipNow: boolean = currentTier === 'BASIC' || currentTier === 'LIFETIME';
      const level: string = currentTier === 'LIFETIME' ? 'lifetime' : (currentTier === 'BASIC' ? 'year' : 'free');
      const expiredAt: string = (me['vipExpiresAt'] as string) ?? '';

      const auth: AuthStore = AuthStore.shared();
      const existing: PlusUser | null = auth.plusUser;
      const updated: PlusUser = {
        id: existing?.id ?? userId,
        vipTier: currentTier,
        level: level,
        isVip: isVipNow,
        expiredAt: expiredAt
      };
      await PreferencesStore.writeString(PrefKey.PLus_USER, JSON.stringify(updated));
      auth.setPlusUser(updated);
      auth.isVip = isVipNow;
      auth.vipTier = currentTier || null;
      await PreferencesStore.writeString(PrefKey.VIP_TIER, currentTier);
      await PreferencesStore.writeString(PrefKey.VIP_EXPIRES, expiredAt);
    } catch {
      // 静默失败
    }
  }

  // ─── 唤起支付(对齐 mobile handlePayment)─────────────────────────────────
  private async handlePayment(method: PaymentMethod): Promise<void> {
    // 1. 拿 userId(AuthStore.plusUser → PreferencesStore 兜底,对齐 mobile 三级兜底)
    const rawId: string | number = AuthStore.shared().plusUser?.id ?? '';
    let userId: string = String(rawId);
    if (userId.length === 0) {
      const stored: string = await PreferencesStore.readString(PrefKey.PLus_USER, '');
      if (stored.length > 0) {
        try {
          const parsed: Record<string, Object> = JSON.parse(stored) as Record<string, Object>;
          userId = (parsed['id'] as string) ?? '';
        } catch {
          // 忽略
        }
      }
    }
    if (userId.length === 0) {
      const idStr: string = await PreferencesStore.readString(PrefKey.PLus_USER_ID, '');
      if (idStr.length > 0) {
        try {
          userId = JSON.parse(idStr) as string;
        } catch {
          // 忽略
        }
      }
    }
    if (userId.length === 0) {
      promptAction.showDialog({
        title: '错误',
        message: '请先登录会员账户',
        buttons: [{ text: '好的', color: this.themePrimary }]
      }).then((): void => {
        replaceRoute(RouteName.MEMBER_LOGIN);
      });
      return;
    }

    if (method === 'ALIPAY') {
      // hm 端无支付宝 SDK,对齐 mobile 的「未返回支付参数」提示
      promptAction.showDialog({
        title: '支付宝暂不支持',
        message: 'HarmonyOS 端暂未接入支付宝,请使用微信支付',
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
      return;
    }

    this.isLoading = true;
    let createdOrderId: string = '';
    try {
      const vipTier: string = this.selectedPlan === 'lifetime' ? 'LIFETIME' : 'BASIC';
      const res: ISuccessResponse<CreatePaymentResult> = await plusCreateVipPayment({
        userId: userId,
        amount: this.finalPrice(),
        method: method,
        forVip: true,
        forPoints: false,
        vipTier: vipTier,
        clientType: 'app',
        couponCode: this.hasSelectedCoupon ? this.selectedCouponCode : undefined
      });
      if (res.code !== 200) {
        promptAction.showDialog({
          title: '错误',
          message: res.message || '创建订单失败',
          buttons: [{ text: '好的', color: this.themePrimary }]
        });
        return;
      }
      const result: CreatePaymentResult | undefined = res.data;
      if (!result) {
        promptAction.showDialog({
          title: '错误',
          message: '创建订单失败，未返回数据',
          buttons: [{ text: '好的', color: this.themePrimary }]
        });
        return;
      }
      createdOrderId = result.orderId;
      const overlay: PaymentOverlayData = {
        productId: this.selectedPlan,
        method: method,
        orderId: result.orderId,
        amount: result.finalAmount ?? this.finalPrice()
      };
      this.paymentOverlay = overlay;
      this.startPolling(result.orderId, userId);

      // 微信支付唤起:hm 端微信 SDK 集成是独立专项,先 toast 提示
      if (!result.wechatPay) {
        throw new Error('后端未返回微信支付参数');
      }
      promptAction.showToast({ message: '订单已创建,微信支付唤起待接入', duration: 2000 });
    } catch (err) {
      // 订单已创建:取消订单 + 收尾(对齐 mobile createdOrderId 分支)
      if (createdOrderId.length > 0) {
        try {
          await plusCancelOrder(createdOrderId);
        } catch {
          // 忽略
        }
        this.clearPoll();
        this.paymentOverlay = null;
        this.isPolling = false;
        const msg: string = err instanceof Error ? err.message : '请稍后重试';
        promptAction.showDialog({
          title: '支付失败',
          message: msg,
          buttons: [{ text: '好的', color: this.themePrimary }]
        });
        return;
      }
      const msg: string = err instanceof Error ? err.message : '请稍后重试';
      promptAction.showDialog({
        title: '创建订单失败',
        message: msg,
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
    } finally {
      this.isLoading = false;
    }
  }

  // ─── 关闭 overlay(对齐 mobile closeOverlay)─────────────────────────────
  private closeOverlay(): void {
    this.clearPoll();
    const overlay: PaymentOverlayData | null = this.paymentOverlay;
    this.paymentOverlay = null;
    this.isPolling = false;
    if (overlay && overlay.orderId.length > 0) {
      plusCancelOrder(overlay.orderId).catch((): void => {});
    }
  }

  // ─── 退出登录(对齐 mobile handleLogout)─────────────────────────────────
  private handleLogout(): void {
    promptAction.showDialog({
      title: '退出登录',
      message: '确认要退出会员账号吗？',
      buttons: [
        { text: '取消', color: this.themeTextSec },
        { text: '确认', color: this.themeError }
      ]
    }).then((res: promptAction.ShowDialogSuccessResponse): void => {
      if (res.index === 1) {
        PreferencesStore.delete(PrefKey.PLus_TOKEN);
        PreferencesStore.delete(PrefKey.PLus_USER);
        PreferencesStore.delete(PrefKey.PLus_USER_ID);
        AuthStore.shared().refreshVipStatus().then((): void => {
          replaceRoute(RouteName.MEMBER_LOGIN);
        });
      }
    });
  }

  // ─── 优惠券折扣标签(对齐 mobile zheLabel)─────────────────────────────
  private couponLabel(coupon: PlusCoupon): string {
    const zhe: number = (100 - coupon.discountPercent) / 10;
    const zheLabel: string = Number.isInteger(zhe) ? `${zhe}折` : `${zhe.toFixed(1)}折`;
    return `${coupon.code} · ${zheLabel}`;
  }

  build() {
    Stack() {
      Scroll() {
        Column() {
          // ─── 对比表(对齐 mobile tableCard)──────────────────────────────
          Column() {
            Row() {
              Text('功能')
                .fontSize(12)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeTextSec)
                .layoutWeight(2)
              Text('免费')
                .fontSize(12)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeTextSec)
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
              Text('会员')
                .fontSize(12)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeTextSec)
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
            }
            .width('100%')
            .padding({ left: spacing.md, right: spacing.md, top: spacing.sm + 2, bottom: spacing.sm + 2 })

            ForEach(COMPARISON_DATA, (item: ComparisonItem, index: number) => {
              Row() {
                Text(item.feature)
                  .fontSize(14)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themeText)
                  .layoutWeight(2)

                Column() {
                  if (item.free) {
                    AppIcon({ kind: AppIconKind.Plus, iconSize: 20, iconColor: this.themePrimary })
                  } else {
                    Text('✕')
                      .fontSize(16)
                      .fontColor(this.themeTextSec)
                      .opacity(0.3)
                  }
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Center)

                Column() {
                  AppIcon({ kind: AppIconKind.Plus, iconSize: 22, iconColor: '#FFD700' })
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Center)
              }
              .width('100%')
              .padding({ left: spacing.md, right: spacing.md, top: spacing.md, bottom: spacing.md })
              .alignItems(VerticalAlign.Center)
              .border({ width: { top: index === 0 ? 0 : 0.5 }, color: this.themeBorder })
            }, (item: ComparisonItem): string => item.feature)
          }
          .width('100%')
          .backgroundColor(this.themeSurface)
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.xl)
          .clip(true)

          // ─── 套餐标题 ─────────────────────────────────────────────
          Text('选择套餐')
            .fontSize(12)
            .fontColor(this.themeTextSec)
            .width('100%')
            .margin({ top: spacing.lg, bottom: spacing.lg })

          // ─── 套餐卡(对齐 mobile plansContainer)───────────────────────────
          Row({ space: spacing.md + 3 }) {
            // 年卡
            Column() {
              Text(STATIC_PRODUCTS[0].name)
                .fontSize(16)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
                .margin({ bottom: spacing.sm })
              Row() {
                Text('¥')
                  .fontSize(14)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.themePrimary)
                Text(formatPrice(this.pricing?.annual?.currentPrice ?? STATIC_PRODUCTS[0].fallbackPrice))
                  .fontSize(28)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.themePrimary)
                  .margin({ left: 2, right: 2 })
                Text('/ 年')
                  .fontSize(12)
                  .fontColor(this.themeTextSec)
              }
              .alignItems(VerticalAlign.Bottom)

              if (this.hasDiscount() && this.selectedPlan === 'year') {
                Text() {
                  Span('原价 ')
                  Span(`¥${formatPrice(this.pricing?.annual?.originalPrice ?? STATIC_PRODUCTS[0].fallbackPrice)}`)
                    .decoration({ type: TextDecorationType.LineThrough })
                }
                .fontSize(11)
                .fontColor(this.themeTextSec)
                .margin({ top: spacing.sm })
              }
            }
            .layoutWeight(1)
            .padding(spacing.lg)
            .alignItems(HorizontalAlign.Center)
            .justifyContent(FlexAlign.Center)
            .backgroundColor(this.themeSurface)
            .border({
              width: this.selectedPlan === 'year' ? 2 : 1,
              color: this.selectedPlan === 'year' ? this.themePrimary : this.themeBorder
            })
            .borderRadius(borderRadius.xl)
            .onClick((): void => {
              this.selectedPlan = 'year';
            })

            // 永久卡
            Stack() {
              Column() {
                Text(STATIC_PRODUCTS[1].name)
                  .fontSize(16)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themeText)
                  .margin({ bottom: spacing.sm })
                Row() {
                  Text('¥')
                    .fontSize(14)
                    .fontWeight(FontWeight.Bold)
                    .fontColor(this.themePrimary)
                  Text(formatPrice(this.pricing?.lifetime?.currentPrice ?? STATIC_PRODUCTS[1].fallbackPrice))
                    .fontSize(28)
                    .fontWeight(FontWeight.Bold)
                    .fontColor(this.themePrimary)
                    .margin({ left: 2, right: 2 })
                  Text('永久')
                    .fontSize(12)
                    .fontColor(this.themeTextSec)
                }
                .alignItems(VerticalAlign.Bottom)
              }
              .width('100%')
              .padding(spacing.lg)
              .alignItems(HorizontalAlign.Center)
              .justifyContent(FlexAlign.Center)

              // 推荐角标(对齐 mobile recommendBadge)
              Text('推荐')
                .fontSize(10)
                .fontWeight(FontWeight.Bold)
                .fontColor('#000000')
                .padding({ left: spacing.sm, right: spacing.sm, top: 4, bottom: 4 })
                .backgroundColor('#FFD700')
                .borderRadius({ topRight: 14, bottomLeft: 10 })
                .opacity(this.selectedPlan === 'lifetime' ? 1 : 0.6)
            }
            .layoutWeight(1)
            .alignContent(Alignment.TopEnd)
            .backgroundColor(this.themeSurface)
            .border({
              width: this.selectedPlan === 'lifetime' ? 2 : 1,
              color: this.selectedPlan === 'lifetime' ? '#FFD700' : this.themeBorder
            })
            .borderRadius(borderRadius.xl)
            .clip(true)
            .onClick((): void => {
              this.selectedPlan = 'lifetime';
            })
          }
          .width('100%')

          // ─── 优惠券 ───────────────────────────────────────────────
          Text('优惠券')
            .fontSize(12)
            .fontColor(this.themeTextSec)
            .width('100%')
            .margin({ top: spacing.lg, bottom: spacing.lg })

          Row() {
            Text(this.hasSelectedCoupon ? this.selectedCouponCode : '不使用优惠券')
              .fontSize(fontSizes.md)
              .fontColor(this.themeText)
              .layoutWeight(1)
            AppIcon({ kind: AppIconKind.ChevronDown, iconSize: 16, iconColor: this.themeText })
          }
          .width('100%')
          .padding({ left: spacing.md, right: spacing.md, top: spacing.sm + 4, bottom: spacing.sm + 4 })
          .backgroundColor(this.themeSurface)
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(12)
          .onClick((): void => {
            this.couponModalVisible = true;
          })

          if (this.selectedCoupon()) {
            Row() {
              Text() {
                Span('优惠后价格：')
                  .fontSize(13)
                  .fontColor(this.themeTextSec)
                Span(`¥${formatPrice(this.finalPrice())}`)
                  .fontSize(16)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themePrimary)
                Span(`  ¥${formatPrice(this.basePrice())}`)
                  .fontSize(12)
                  .fontColor(this.themeTextSec)
                  .decoration({ type: TextDecorationType.LineThrough })
              }
            }
            .width('100%')
            .margin({ top: spacing.sm })
          }

          // ─── 支付方式 ─────────────────────────────────────────────
          Text('支付方式')
            .fontSize(12)
            .fontColor(this.themeTextSec)
            .width('100%')
            .margin({ top: spacing.lg, bottom: spacing.sm })

          Text('支付即视为同意会员服务协议，虚拟商品一经售出概不退换。')
            .fontSize(12)
            .fontColor(this.themeTextSec)
            .width('100%')
            .margin({ bottom: spacing.sm + 2 })

          Row({ space: spacing.md + 3 }) {
            // 微信支付
            Row({ space: spacing.sm + 4 }) {
              Text('W')
                .fontSize(16)
                .fontWeight(FontWeight.Bold)
                .fontColor('#FFFFFF')
                .width(24)
                .height(24)
                .textAlign(TextAlign.Center)
                .backgroundColor('#1AAD19')
                .borderRadius(12)
              Text('微信支付')
                .fontSize(14)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
            }
            .layoutWeight(1)
            .padding({ top: spacing.md - 2, bottom: spacing.md - 2, left: spacing.lg + 4, right: spacing.lg + 4 })
            .justifyContent(FlexAlign.Center)
            .alignItems(VerticalAlign.Center)
            .backgroundColor(this.themeSurface)
            .border({ width: 1, color: this.themeBorder })
            .borderRadius(16)
            .opacity(this.isLoading ? 0.6 : 1)
            .onClick((): void => {
              if (!this.isLoading) {
                void this.handlePayment('WECHAT');
              }
            })

            // 支付宝
            Row({ space: spacing.sm + 4 }) {
              Text('支')
                .fontSize(16)
                .fontWeight(FontWeight.Bold)
                .fontColor('#FFFFFF')
                .width(24)
                .height(24)
                .textAlign(TextAlign.Center)
                .backgroundColor('#02A9F1')
                .borderRadius(12)
              Text('支付宝')
                .fontSize(14)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
            }
            .layoutWeight(1)
            .padding({ top: spacing.md - 2, bottom: spacing.md - 2, left: spacing.lg + 4, right: spacing.lg + 4 })
            .justifyContent(FlexAlign.Center)
            .alignItems(VerticalAlign.Center)
            .backgroundColor(this.themeSurface)
            .border({ width: 1, color: this.themeBorder })
            .borderRadius(16)
            .opacity(this.isLoading ? 0.6 : 1)
            .onClick((): void => {
              if (!this.isLoading) {
                void this.handlePayment('ALIPAY');
              }
            })
          }
          .width('100%')

          // ─── 退出会员账号(对齐 mobile logoutButton)────────────────────────
          Row({ space: spacing.sm }) {
            Text('⏻')
              .fontSize(18)
              .fontColor(this.themeError)
            Text('退出会员账号')
              .fontSize(16)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeError)
          }
          .width('100%')
          .padding(spacing.md + 3)
          .justifyContent(FlexAlign.Center)
          .alignItems(VerticalAlign.Center)
          .backgroundColor(this.themeError + '14')
          .border({ width: 1, color: this.themeError })
          .borderRadius(12)
          .margin({ top: spacing.lg + 10 })
          .onClick((): void => {
            this.handleLogout();
          })
        }
        .width('100%')
        .padding({ left: spacing.lg, right: spacing.lg, top: spacing.md, bottom: 40 })
      }
      .width('100%')
      .height('100%')
      .scrollBar(BarState.Off)
      .align(Alignment.Top)

      // ─── 优惠券选择 Modal(对齐 mobile coupon Modal)───────────────────────
      if (this.couponModalVisible) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('#66000000')
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .padding({ left: 32, right: 32 })
          .onClick((): void => {
            this.couponModalVisible = false;
          })

        Column() {
          Text('选择优惠券')
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .textAlign(TextAlign.Center)
            .width('100%')
            .padding({ left: spacing.lg, right: spacing.lg })
            .margin({ bottom: spacing.sm + 4 })

          Scroll() {
            Column() {
              // 不使用优惠券
              Row() {
                Text('不使用优惠券')
                  .fontSize(15)
                  .fontColor(this.themeText)
                  .layoutWeight(1)
                if (!this.hasSelectedCoupon) {
                  Text('✓')
                    .fontSize(20)
                    .fontColor(this.themePrimary)
                }
              }
              .width('100%')
              .padding({ left: spacing.lg, right: spacing.lg, top: spacing.md - 2, bottom: spacing.md - 2 })
              .backgroundColor(!this.hasSelectedCoupon ? this.themePrimary + '18' : '#00000000')
              .border({ width: { bottom: 0.5 }, color: this.themeBorder })
              .onClick((): void => {
                this.hasSelectedCoupon = false;
                this.selectedCouponCode = '';
                this.couponModalVisible = false;
              })

              ForEach(this.coupons, (item: PlusCoupon) => {
                Row() {
                  Text(this.couponLabel(item))
                    .fontSize(15)
                    .fontColor(this.themeText)
                    .layoutWeight(1)
                  if (this.hasSelectedCoupon && this.selectedCouponCode === item.code) {
                    Text('✓')
                      .fontSize(20)
                      .fontColor(this.themePrimary)
                  }
                }
                .width('100%')
                .padding({ left: spacing.lg, right: spacing.lg, top: spacing.md - 2, bottom: spacing.md - 2 })
                .backgroundColor(this.hasSelectedCoupon && this.selectedCouponCode === item.code
                  ? this.themePrimary + '18' : '#00000000')
                .border({ width: { bottom: 0.5 }, color: this.themeBorder })
                .onClick((): void => {
                  this.selectedCouponCode = item.code;
                  this.hasSelectedCoupon = true;
                  this.couponModalVisible = false;
                })
              }, (item: PlusCoupon): string => item.code)
            }
            .width('100%')
          }
          .width('100%')
          .constraintSize({ maxHeight: 360 })
        }
        .width('100%')
        .backgroundColor(this.themeSurface)
        .borderRadius(16)
        .padding({ top: spacing.lg, bottom: spacing.sm + 2 })
        .clip(true)
        .onClick((): void => {
          // 阻止冒泡到遮罩关闭
        })
      }

      // ─── 支付进度 Overlay(对齐 mobile paymentOverlay)───────────────────────
      if (this.paymentOverlay) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('#80000000')
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .padding(spacing.lg)

        Column() {
          Stack() {
            Column({ space: spacing.sm }) {
              Text('订单已创建')
                .fontSize(fontSizes.lg)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.themeText)
                .textAlign(TextAlign.Center)
                .width('100%')
              Text(`订单号：${this.paymentOverlay.orderId} · 金额：¥${this.paymentOverlay.amount}`)
                .fontSize(fontSizes.sm)
                .fontColor(this.themeTextSec)
                .textAlign(TextAlign.Center)
                .width('100%')

              if (this.paymentOverlay.method === 'WECHAT') {
                Column({ space: spacing.sm }) {
                  Text('已唤起微信支付')
                    .fontSize(fontSizes.md)
                    .fontColor(this.themeTextSec)
                  Text('支付完成后将自动跳转')
                    .fontSize(fontSizes.xs)
                    .fontColor(this.themeTextSec)
                }
                .width('100%')
                .alignItems(HorizontalAlign.Center)
                .margin({ top: spacing.md, bottom: spacing.md })
              }

              if (this.isPolling) {
                Row({ space: spacing.sm }) {
                  LoadingProgress()
                    .width(20)
                    .height(20)
                    .color(this.themePrimary)
                  Text('正在查询支付结果...')
                    .fontSize(fontSizes.md)
                    .fontColor(this.themeTextSec)
                }
                .justifyContent(FlexAlign.Center)
                .width('100%')
                .margin({ top: spacing.sm })
              }
            }
            .width('100%')
          }
          .width('100%')

          // 关闭按钮(对齐 mobile overlayClose)
          Text('✕')
            .fontSize(20)
            .fontColor(this.themeTextSec)
            .position({ x: '100%', y: 0 })
            .markAnchor({ x: 48, y: -16 })
            .padding(spacing.sm)
            .onClick((): void => {
              this.closeOverlay();
            })
        }
        .width('100%')
        .constraintSize({ maxWidth: 360 })
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.xl)
        .padding(spacing.lg)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }
}
