// @ts-nocheck
import { Button, Card, CardContent, CardHeader, CardTitle } from "@bookdock/ui";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  Crown,
  Headphones,
  Layout,
  Loader2,
  MessageCircle,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  plusCancelOrder,
  plusCreateVipPayment,
  plusGetCurrentLowestPrice,
  plusGetMe,
  plusGetMyCoupons,
  plusQueryPaymentStatus,
  plusVerifyCoupon,
} from "../services/plus";
import { useAuthStore } from "../stores/authStore";

interface VipProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  badge: string;
  features: string[];
}

const STATIC_PRODUCTS: VipProduct[] = [
  {
    id: "year",
    name: "年卡",
    description: "1年会员特权",
    price: 20,
    badge: "1年",
    features: ["扫码登录", "桌面小组件", "优先客服", "声仓会员"],
  },
  {
    id: "lifetime",
    name: "永久卡",
    description: "一次购买，永久有效",
    price: 60,
    badge: "永久",
    features: ["扫码登录", "桌面小组件", "优先客服", "声仓会员"],
  },
];

interface PaymentResult {
  orderId: string;
  transactionId?: string | null;
  paymentUrl: string;
  qrCode: string;
  finalAmount: number;
}

export default function MemberBenefits() {
  const navigate = useNavigate();
  const location = useLocation();
  const [products] = useState<VipProduct[]>(STATIC_PRODUCTS);
  const [creatingOrder, setCreatingOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    plusUser: vipUser,
    isVip,
    setPlusUser,
    refreshVipStatus,
  } = useAuthStore();
  const [lowestPrice, setLowestPrice] = useState<{
    annual?: number;
    lifetime?: number;
  }>({});
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState<number>(0);

  // Payment overlay state
  const [paymentOverlay, setPaymentOverlay] = useState<{
    productId: string;
    method: "WECHAT" | "ALIPAY";
    result: PaymentResult | null;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Check if already VIP
  useEffect(() => {
    const loadPrice = async () => {
      try {
        const priceRes = await plusGetCurrentLowestPrice();
        if (priceRes.code === 200 && priceRes.data) {
          const annualRaw = priceRes.data.annual ?? priceRes.data.annualPrice;
          const lifetimeRaw =
            priceRes.data.lifetime ?? priceRes.data.lifetimePrice;
          const annual =
            typeof annualRaw === "object" && annualRaw !== null
              ? annualRaw.currentPrice
              : annualRaw;
          const lifetime =
            typeof lifetimeRaw === "object" && lifetimeRaw !== null
              ? lifetimeRaw.currentPrice
              : lifetimeRaw;
          setLowestPrice({
            annual: annual !== undefined ? Number(annual) : undefined,
            lifetime: lifetime !== undefined ? Number(lifetime) : undefined,
          });
        }
      } catch {}
    };
    loadPrice();
    plusGetMyCoupons()
      .then((res) => {
        if (res.code === 200 && Array.isArray(res.data)) setCoupons(res.data);
      })
      .catch(() => {});
  }, [navigate, refreshVipStatus]);

  const startPolling = useCallback(
    (orderId: string, userId: string, tier: string) => {
      let attempts = 0;
      const maxAttempts = 60;
      const timer = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(timer);
          setError("支付超时，请刷新页面重试");
          setIsPolling(false);
          return;
        }
        try {
          const res = await plusQueryPaymentStatus(orderId);
          if (res.code === 200 && res.data) {
            const status = res.data.status;
            if (status === "paid") {
              clearInterval(timer);
              setIsPolling(false);
              const meRes = await plusGetMe(userId);
              const me = meRes.data;
              const currentTier = me?.vipTier;
              const isVipNow =
                currentTier === "BASIC" || currentTier === "LIFETIME";
              const updatedUser = {
                ...vipUser,
                level:
                  currentTier === "LIFETIME"
                    ? "lifetime"
                    : currentTier === "BASIC"
                      ? "year"
                      : "free",
                isVip: isVipNow,
                expiredAt: me?.vipExpiresAt ?? null,
              };
              localStorage.setItem(
                "bookdock_plus_user",
                JSON.stringify(updatedUser),
              );
              setPlusUser(updatedUser);
              setPaymentOverlay(null);
              navigate("/member-payment-success");
            } else if (status === "failed" || status === "cancelled") {
              clearInterval(timer);
              setIsPolling(false);
              setError("支付失败或已取消");
            }
          }
        } catch {
          // continue polling
        }
      }, 3000);
      pollRef.current = timer;
      setIsPolling(true);
    },
    [vipUser, navigate],
  );

  const handleBuy = useCallback(
    async (productId: string, method: "WECHAT" | "ALIPAY") => {
      setCreatingOrder(productId);
      setError(null);
      try {
        const userId =
          vipUser?.id ||
          (() => {
            const idStr = localStorage.getItem("bookdock_plus_user_id");
            return idStr ? JSON.parse(idStr) : null;
          })();
        if (!userId) {
          setError("请先登录会员账户");
          navigate("/member-login", { state: { from: location.pathname } });
          return;
        }
        const rawAmount =
          productId === "lifetime"
            ? (lowestPrice.lifetime ?? 60)
            : (lowestPrice.annual ?? 20);
        const amount = Number(
          ((rawAmount * (100 - couponDiscount)) / 100).toFixed(2),
        );
        const vipTier = productId === "lifetime" ? "LIFETIME" : "BASIC";
        const data = await plusCreateVipPayment({
          userId,
          amount,
          method,
          forVip: true,
          forPoints: false,
          vipTier,
          clientType: "desktop",
          couponCode: couponCode || undefined,
        });
        if (data.code !== 200) {
          setError(data.message || "创建订单失败");
          return;
        }
        const result = data.data;
        if (!result) {
          setError("创建订单失败，未返回数据");
          return;
        }
        if (method === "ALIPAY" && result.paymentUrl) {
          window.open(result.paymentUrl, "_blank");
        }
        setPaymentOverlay({ productId, method, result });
        startPolling(result.orderId, userId, vipTier);
      } catch {
        setError("网络错误，请重试");
      } finally {
        setCreatingOrder(null);
      }
    },
    [
      navigate,
      vipUser,
      lowestPrice,
      couponDiscount,
      couponCode,
      location.pathname,
      startPolling,
    ],
  );

  const closeOverlay = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (paymentOverlay?.result?.orderId) {
      try {
        await plusCancelOrder(paymentOverlay.result.orderId);
      } catch {
        // ignore cancel error
      }
    }
    setPaymentOverlay(null);
    setIsPolling(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-xl mb-4">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="hidden md:block text-3xl font-bold text-gray-900 dark:text-white">
            会员特权
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            解锁 BookDock 全部功能
          </p>
        </div>

        {/* VIP Benefits Banner */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 mb-8 text-white shadow-lg">
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> 会员专属特权
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <QrCode className="w-4 h-4" />, text: "扫码登录" },
              { icon: <Layout className="w-4 h-4" />, text: "桌面小组件" },
              {
                icon: <MessageCircle className="w-4 h-4" />,
                text: "优先客服",
              },
              { icon: <Headphones className="w-4 h-4" />, text: "声仓会员" },
            ].map((benefit) => (
              <div
                key={benefit.text}
                className="flex items-center gap-2 text-sm"
              >
                {benefit.icon}
                <span>{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Products */}
        <Card className="mb-6">
          <CardContent>
            <h3 className="font-semibold mb-2">优惠券</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.trim())}
                placeholder="输入优惠码"
                className="flex-1 px-3 py-2 rounded-lg border"
              />
              <Button
                onClick={async () => {
                  if (!vipUser?.id || !couponCode) return;
                  const res = await plusVerifyCoupon(couponCode, vipUser.id);
                  if (res.code === 200 && res.data?.valid)
                    setCouponDiscount(res.data.discountPercent || 0);
                  else setError(res.message || "优惠券不可用");
                }}
              >
                使用
              </Button>
            </div>
            {couponDiscount > 0 && (
              <p className="text-sm text-green-600">
                已应用优惠：{couponDiscount}% OFF
              </p>
            )}
            {coupons.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                可用优惠券：
                {coupons
                  .map((c) => `${c.code}(${c.discountPercent}%)`)
                  .join("，")}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {products.map((product) => {
            const displayPrice =
              product.id === "lifetime"
                ? (lowestPrice.lifetime ?? product.price)
                : (lowestPrice.annual ?? product.price);
            return (
              <Card key={product.id} className="relative overflow-hidden">
                {product.id === "lifetime" && (
                  <div className="absolute top-3 right-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    推荐
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl">{product.name}</CardTitle>
                    <span className="text-3xl font-bold text-amber-500">
                      ¥{displayPrice}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {product.description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {product.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                      >
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {vipUser?.level === product.id && vipUser?.isVip ? (
                    <div className="text-center py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400 text-sm font-medium">
                      <Check className="w-4 h-4 inline mr-1" /> 当前方案
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleBuy(product.id, "WECHAT")}
                          disabled={creatingOrder !== null}
                          className="flex-1"
                          style={{
                            background:
                              product.id === "lifetime"
                                ? "linear-gradient(135deg, #f59e0b, #ea580c)"
                                : undefined,
                          }}
                        >
                          {creatingOrder === product.id
                            ? "处理中..."
                            : "微信支付"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleBuy(product.id, "ALIPAY")}
                          disabled={creatingOrder !== null}
                          className="flex-1"
                        >
                          {creatingOrder === product.id
                            ? "处理中..."
                            : "支付宝"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Purchase Notice */}
        <Card className="mb-8">
          <CardContent>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> 购买须知
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>• 年卡：购买后1年内有效，到期后可续费</li>
              <li>• 永久卡：一次购买，终身有效</li>
              <li>• 支付成功后立即开通，无需等待</li>
              <li>• 如遇支付问题请联系客服</li>
              <li>• 本产品为虚拟商品，支付成功后不支持退款</li>
            </ul>
          </CardContent>
        </Card>

        {/* Current Status */}
        {vipUser ? (
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
              当前会员：
              {vipUser.isVip
                ? vipUser.level === "lifetime"
                  ? "永久卡"
                  : "年卡"
                : "免费版"}
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate("/member-detail")}
            >
              查看会员详情 →
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
              已有账户？
            </p>
            <Button
              variant="secondary"
              onClick={() => navigate("/member-login")}
            >
              会员登录 →
            </Button>
          </div>
        )}

        {/* Back */}
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center gap-1 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" /> 返回书架
          </button>
        </div>
      </div>

      {/* Payment Overlay */}
      {paymentOverlay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={closeOverlay}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">
              订单已创建
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
              订单号：{paymentOverlay.result?.orderId} · 金额：¥
              {paymentOverlay.result?.finalAmount}
            </p>
            {paymentOverlay.method === "WECHAT" &&
              paymentOverlay.result?.qrCode && (
                <div className="flex flex-col items-center gap-4 mb-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    请使用微信扫一扫完成支付
                  </p>
                  <div className="p-3 bg-white rounded-lg">
                    <QRCodeSVG
                      value={paymentOverlay.result.qrCode}
                      size={200}
                    />
                  </div>
                  <p className="text-xs text-gray-400">支付完成后将自动跳转</p>
                </div>
              )}
            {paymentOverlay.method === "ALIPAY" && (
              <div className="flex flex-col items-center gap-4 mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  已在浏览器新标签页打开支付宝支付页面
                </p>
                <p className="text-xs text-gray-400">支付完成后将自动跳转</p>
              </div>
            )}
            {isPolling && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在查询支付结果...
                </div>
                <button
                  onClick={closeOverlay}
                  className="text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 underline"
                >
                  取消支付
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
