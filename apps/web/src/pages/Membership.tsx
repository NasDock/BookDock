import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, PremiumBadge } from '@bookdock/auth';
import { getApiClient } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';
const VIP_TOKEN_KEY = 'bookdock_vip_token';
const VIP_USER_KEY = 'bookdock_vip_user';

interface VipProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  badge: string;
  features: string[];
}

interface VipUser {
  userId: string;
  phone: string;
  level: string;
  isVip: boolean;
  expiredAt: string | null;
  createdAt: string;
}

interface VipOrder {
  id: string;
  orderId: string;
  userId: string;
  productId: string;
  amount: number;
  status: string;
  paidAt?: string;
  createdAt: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: '免费版',
  year: '年卡',
  lifetime: '永久卡',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '永久';
  return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function loadVipUser(): VipUser | null {
  try {
    const stored = localStorage.getItem(VIP_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveVipUser(user: VipUser) {
  localStorage.setItem(VIP_USER_KEY, JSON.stringify(user));
}

export default function Membership() {
  const navigate = useNavigate();
  const { isAuthenticated, refreshUser } = useAuth();
  const [vipUser, setVipUser] = useState<VipUser | null>(loadVipUser);
  const [products, setProducts] = useState<VipProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<VipProduct | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'simulated' | 'wechat' | 'alipay'>('simulated');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [order, setOrder] = useState<VipOrder | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/membership' } });
      return;
    }
    loadProducts();
    loadVipProfile();
  }, [isAuthenticated]);

  const loadProducts = async () => {
    try {
      const res = await fetch(`${API_BASE}/vip/products`);
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch {
      // Fallback products
      setProducts([
        { id: 'year', name: '年卡', description: '1年会员特权', price: 20, badge: '1年', features: ['无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
        { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', price: 60, badge: '永久', features: ['永久会员特权', '无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadVipProfile = async () => {
    const token = localStorage.getItem(VIP_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/vip/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.userId) {
        const vipUser: VipUser = {
          userId: data.userId,
          phone: data.phone || '',
          level: data.level || 'free',
          isVip: data.isVip || false,
          expiredAt: data.expiredAt || null,
          createdAt: data.createdAt || new Date().toISOString(),
        };
        setVipUser(vipUser);
        saveVipUser(vipUser);
      }
    } catch {
      // Ignore
    }
  };

  const handleSelectProduct = (product: VipProduct) => {
    if (vipUser?.isVip) return;
    setSelectedProduct(product);
    setOrder(null);
    setPaymentError(null);
    setPaymentSuccess(false);
  };

  const handlePay = async () => {
    if (!selectedProduct) return;
    const token = localStorage.getItem(VIP_TOKEN_KEY);
    if (!token) {
      navigate('/login', { state: { from: '/membership' } });
      return;
    }

    setPaying(true);
    setPaymentError(null);

    try {
      // Create order
      const createRes = await fetch(`${API_BASE}/vip/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId: selectedProduct.id }),
      });
      const orderData = await createRes.json();

      if (!orderData.id) {
        throw new Error(orderData.message || '创建订单失败');
      }

      const newOrder: VipOrder = {
        id: orderData.id,
        orderId: orderData.orderId,
        userId: orderData.userId,
        productId: orderData.productId,
        amount: orderData.amount,
        status: orderData.status,
        paidAt: orderData.paidAt,
        createdAt: orderData.createdAt,
      };
      setOrder(newOrder);

      if (paymentMethod === 'simulated') {
        // Simulate payment
        const payRes = await fetch(`${API_BASE}/vip/pay-callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            orderId: newOrder.orderId,
            status: 'SUCCESS',
          }),
        });
        const payData = await payRes.json();

        if (payData.success) {
          setPaymentSuccess(true);
          await loadVipProfile();
          await refreshUser();
          setTimeout(() => {
            setSelectedProduct(null);
            setOrder(null);
          }, 2000);
        } else {
          setPaymentError('支付失败');
        }
      } else {
        // For wechat/alipay, show QR code placeholder
        setOrder({ ...newOrder, status: 'pending' });
      }
    } catch (err: any) {
      setPaymentError(err?.message || '支付失败，请重试');
    } finally {
      setPaying(false);
    }
  };

  const closeModal = () => {
    setSelectedProduct(null);
    setOrder(null);
    setPaymentError(null);
    setPaymentSuccess(false);
  };

  const isCurrentPlan = (productId: string): boolean => {
    if (productId === 'free') return vipUser?.level === 'free';
    if (vipUser?.level === 'lifetime') return true;
    if (vipUser?.level === 'year' && productId === 'year') return true;
    return false;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-lg mb-4">
          <span className="text-3xl">👑</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {vipUser?.isVip ? '您已是会员' : '升级会员'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {vipUser?.isVip
            ? `当前会员：${PLAN_LABELS[vipUser.level] || vipUser.level} · ${vipUser.level === 'lifetime' ? '永久有效' : `到期 ${formatDate(vipUser.expiredAt)}`}`
            : '解锁全部功能，畅享无限阅读'
          }
        </p>
        {vipUser?.isVip && (
          <div className="mt-3">
            <PremiumBadge className="text-sm px-3 py-1" />
          </div>
        )}
      </div>

      {/* VIP Status Card */}
      {vipUser && (
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">VIP 会员</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {PLAN_LABELS[vipUser.level] || vipUser.level}
                  {vipUser.isVip && (
                    <span className="ml-2 text-sm font-normal text-green-600 dark:text-green-400">✓ 已激活</span>
                  )}
                </p>
                {vipUser.phone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">手机号：{vipUser.phone}</p>
                )}
                {vipUser.level !== 'lifetime' && vipUser.expiredAt && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    到期时间：{formatDate(vipUser.expiredAt)}
                  </p>
                )}
                {vipUser.level === 'lifetime' && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">永久有效，无需续费</p>
                )}
              </div>
              <div className="text-right">
                {vipUser.phone ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{vipUser.phone}</p>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => navigate('/login', { state: { from: '/membership' } })}>
                    绑定手机号
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-3xl mx-auto">
        {products.map((product) => {
          const isCurrent = isCurrentPlan(product.id);
          const isUpgrade = !isCurrent;

          return (
            <Card
              key={product.id}
              className={`relative transition-all ${isUpgrade && !vipUser?.isVip ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer' : ''} ${isCurrent ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => isUpgrade && handleSelectProduct(product)}
            >
              {product.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full shadow">
                    {product.badge}
                  </span>
                </div>
              )}

              <CardHeader>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{product.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{product.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">¥{product.price}</span>
                    {product.id === 'year' && <span className="text-gray-500 dark:text-gray-400 ml-1">/年</span>}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-2 mb-6">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span className="text-gray-600 dark:text-gray-400">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="secondary" disabled className="w-full">
                    当前方案
                  </Button>
                ) : !vipUser?.isVip ? (
                  <Button className="w-full" onClick={() => handleSelectProduct(product)}>
                    立即升级
                  </Button>
                ) : vipUser.level === 'year' && product.id === 'lifetime' ? (
                  <Button className="w-full" onClick={() => handleSelectProduct(product)}>
                    升级为永久卡
                  </Button>
                ) : (
                  <Button variant="secondary" disabled className="w-full">
                    暂不可用
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Benefits Section */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">会员专属权益</h2>
        <p className="text-gray-500 dark:text-gray-400">一次购买，永久使用，所有设备同步</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon: '🔊', title: '无限朗读', desc: 'TTS 无限时长' },
          { icon: '📚', title: '无限藏书', desc: '无上传限制' },
          { icon: '🔖', title: '无限书签', desc: '每本书无限书签' },
          { icon: '⚡', title: '专属客服', desc: '优先响应' },
        ].map((benefit) => (
          <div key={benefit.title} className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="text-3xl mb-2">{benefit.icon}</div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">{benefit.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{benefit.desc}</p>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">常见问题</h3>
        <div className="space-y-3">
          {[
            { q: '年卡和永久卡有什么区别？', a: '年卡有效期1年，到期可续费；永久卡一次购买，终身有效，无需续费。' },
            { q: '付款后多久生效？', a: '模拟支付立即生效，微信/支付宝支付在扫码后1-2分钟内生效。' },
            { q: '支持哪些支付方式？', a: '支持模拟支付、微信支付和支付宝支付。' },
            { q: '可以退款吗？', a: '会员购买后不支持退款，请确认后再购买。' },
          ].map((faq) => (
            <div key={faq.q} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">{faq.q}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            {paymentSuccess ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">支付成功！</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  您现在是 <strong>{selectedProduct.name}</strong> 了！
                </p>
                <Button onClick={closeModal}>开始使用</Button>
              </div>
            ) : order ? (
              <div className="text-center py-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">订单已创建</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  订单号：{order.orderId} · 金额：¥{order.amount}
                </p>
                {paymentMethod !== 'simulated' ? (
                  <>
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl mb-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        {paymentMethod === 'wechat' ? '微信支付' : '支付宝'} 扫码支付
                      </p>
                      <p className="text-xs text-gray-400">（模拟环境，不支持真实支付）</p>
                    </div>
                    <Button variant="secondary" onClick={closeModal}>关闭</Button>
                  </>
                ) : (
                  <>
                    <div className="animate-pulse mb-4">
                      <div className="h-2 bg-blue-500 rounded-full w-3/4 mx-auto"></div>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">正在确认支付...</p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">确认支付</h3>
                  <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>

                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600 dark:text-gray-400">会员方案</span>
                    <span className="font-bold text-gray-900 dark:text-white">{selectedProduct.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">支付金额</span>
                    <span className="font-bold text-2xl text-amber-600">¥{selectedProduct.price}</span>
                  </div>
                </div>

                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">选择支付方式</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'simulated', label: '模拟支付', icon: '💳', desc: '测试用' },
                      { id: 'wechat', label: '微信支付', icon: '💚', desc: '推荐' },
                      { id: 'alipay', label: '支付宝', icon: '💙', desc: '推荐' },
                    ].map((method) => (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id as any)}
                        className={`p-3 rounded-xl border-2 transition-colors text-center ${
                          paymentMethod === method.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-2xl mb-1">{method.icon}</div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{method.label}</p>
                        <p className="text-xs text-gray-400">{method.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {paymentError && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{paymentError}</p>
                  </div>
                )}

                <Button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full"
                  size="lg"
                >
                  {paying ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⟳</span>
                      创建订单中...
                    </span>
                  ) : (
                    `确认支付 ¥${selectedProduct.price}`
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
