import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { plusCreateVipPayment, plusGetMe, plusGetCurrentLowestPrice, plusQueryPaymentStatus, plusCancelOrder } from '../services/plus';
import { useAuthStore } from '../stores/authStore';
import { Crown, Sparkles, BookOpen, Headphones, Star, Ban, MessageCircle, Gift, Check, Loader2, X } from 'lucide-react';

interface VipProduct {
  id: string; name: string; description: string; price: number; badge: string; features: string[];
}

const STATIC_PRODUCTS: VipProduct[] = [
  { id: 'year', name: '年卡', description: '1年会员特权', price: 20, badge: '1年', features: ['无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
  { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', price: 60, badge: '永久', features: ['永久会员特权', '无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
];

interface PaymentOverlay {
  productId: string;
  method: 'WECHAT' | 'ALIPAY';
  result: { orderId: string; qrCode: string; paymentUrl: string; finalAmount: number } | null;
}

export function MemberBenefitsScreen() {
  const [products, setProducts] = useState<VipProduct[]>(STATIC_PRODUCTS);
  const [isLoading, setIsLoading] = useState(false);
  const { plusUser: vipUser, setPlusUser, refreshVipStatus } = useAuthStore();

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
    refreshVipStatus().then((vip) => {
      if (vip) {
        window.location.hash = '#/member-detail';
      }
    });
    plusGetCurrentLowestPrice()
      .then((res) => {
        if (res.code === 0 && res.data) {
          const annualRaw = res.data.annual ?? res.data.annualPrice;
          const lifetimeRaw = res.data.lifetime ?? res.data.lifetimePrice;
          const annual = typeof annualRaw === 'object' && annualRaw !== null ? annualRaw.currentPrice : annualRaw;
          const lifetime = typeof lifetimeRaw === 'object' && lifetimeRaw !== null ? lifetimeRaw.currentPrice : lifetimeRaw;
          setProducts((prev) =>
            prev.map((p) =>
              p.id === 'year' && annual !== undefined
                ? { ...p, price: Number(annual) }
                : p.id === 'lifetime' && lifetime !== undefined
                  ? { ...p, price: Number(lifetime) }
                  : p
            )
          );
        }
      })
      .catch(() => {});
  }, [refreshVipStatus]);

  const startPolling = useCallback((orderId: string, userId: string, tier: string) => {
    let attempts = 0;
    const maxAttempts = 60;
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        alert('支付超时，请刷新页面重试');
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
            localStorage.setItem('bookdock_plus_user', JSON.stringify(updatedUser));
            setPlusUser(updatedUser);
            setPaymentOverlay(null);
            window.location.hash = '#/member-payment-success';
            window.location.reload();
          } else if (status === 'failed' || status === 'cancelled') {
            clearInterval(timer);
            setIsPolling(false);
            alert('支付失败或已取消');
          }
        }
      } catch {
        // continue polling
      }
    }, 3000);
    pollRef.current = timer;
    setIsPolling(true);
  }, [vipUser]);

  const handleBuy = async (productId: string, method: 'WECHAT' | 'ALIPAY') => {
    const token = localStorage.getItem('bookdock_plus_token');
    if (!token) { window.location.hash = '#/member-login'; return; }
    setIsLoading(true);
    try {
      const userId = vipUser?.id || (() => {
        const idStr = localStorage.getItem('bookdock_plus_user_id');
        return idStr ? JSON.parse(idStr) : null;
      })();
      if (!userId) { alert('请先登录会员账户'); window.location.hash = '#/member-login'; return; }
      const amount = productId === 'lifetime' ? 60 : 20;
      const vipTier = productId === 'lifetime' ? 'LIFETIME' : 'BASIC';
      const data = await plusCreateVipPayment({ userId, amount, method, forVip: true, forPoints: false, vipTier, clientType: 'desktop' });
      if (data.code !== 0) { alert(data.message || '创建订单失败'); return; }
      const result = data.data;
      if (!result) { alert('创建订单失败，未返回数据'); return; }
      if (method === 'ALIPAY' && result.paymentUrl) {
        window.open(result.paymentUrl, '_blank');
      }
      setPaymentOverlay({ productId, method, result });
      startPolling(result.orderId, userId, vipTier);
    } catch {
      alert('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  };

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
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow mb-3">
            <Crown className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">会员特权</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">解锁全部功能</p>
        </div>

        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-5 mb-6 text-white">
          <h2 className="font-bold mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> 会员专属特权</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              { icon: <BookOpen className="w-3.5 h-3.5" />, text: '无限书籍' },
              { icon: <Headphones className="w-3.5 h-3.5" />, text: '语音朗读' },
              { icon: <Star className="w-3.5 h-3.5" />, text: '新功能抢先' },
              { icon: <Ban className="w-3.5 h-3.5" />, text: '去除广告' },
              { icon: <MessageCircle className="w-3.5 h-3.5" />, text: '优先客服' },
              { icon: <BookOpen className="w-3.5 h-3.5" />, text: '高级阅读' },
            ].map((b) => (
              <span key={b.text} className="flex items-center gap-1">{b.icon} {b.text}</span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {products.map(product => (
            <div key={product.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow relative">
              {product.id === 'lifetime' && (
                <div className="absolute top-3 right-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">推荐</div>
              )}
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{product.name}</h3>
                <span className="text-2xl font-bold text-amber-500">¥{product.price}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{product.description}</p>
              <ul className="space-y-1 mb-4">
                {product.features.map(f => (
                  <li key={f} className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                    <Check className="w-3.5 h-3.5 text-green-500" /> {f}
                  </li>
                ))}
              </ul>
              {vipUser?.level === product.id && vipUser?.isVip ? (
                <div className="text-center py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 text-sm font-medium flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5" /> 当前方案</div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => handleBuy(product.id, 'WECHAT')} disabled={isLoading}
                    className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ background: product.id === 'lifetime' ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : undefined }}
                  >
                    {isLoading ? '处理中...' : '微信支付'}
                  </button>
                  <button onClick={() => handleBuy(product.id, 'ALIPAY')} disabled={isLoading}
                    className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-sm font-medium disabled:opacity-50"
                  >
                    {isLoading ? '处理中...' : '支付宝'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">购买须知</h3>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>• 年卡：购买后1年内有效</li>
            <li>• 永久卡：一次购买，终身有效</li>
            <li>• 支付成功后立即开通</li>
          </ul>
        </div>

        <div className="text-center">
          {vipUser ? (
            <a href="#/member-detail" className="text-amber-500 hover:underline text-sm">查看会员详情 →</a>
          ) : (
            <a href="#/member-login" className="text-amber-500 hover:underline text-sm">会员登录 →</a>
          )}
        </div>
      </div>

      {/* Payment Overlay */}
      {paymentOverlay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button onClick={closeOverlay} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-center">订单已创建</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
              订单号：{paymentOverlay.result?.orderId} · 金额：¥{paymentOverlay.result?.finalAmount}
            </p>
            {paymentOverlay.method === 'WECHAT' && paymentOverlay.result?.qrCode && (
              <div className="flex flex-col items-center gap-4 mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">请使用微信扫一扫完成支付</p>
                <div className="p-3 bg-white rounded-lg">
                  <QRCodeSVG value={paymentOverlay.result.qrCode} size={200} />
                </div>
                <p className="text-xs text-gray-400">支付完成后将自动跳转</p>
              </div>
            )}
            {paymentOverlay.method === 'ALIPAY' && (
              <div className="flex flex-col items-center gap-4 mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">已在浏览器新标签页打开支付宝支付页面</p>
                <p className="text-xs text-gray-400">支付完成后将自动跳转</p>
              </div>
            )}
            {isPolling && (
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在查询支付结果...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
