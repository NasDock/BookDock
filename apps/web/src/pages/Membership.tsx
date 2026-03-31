import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, PremiumBadge } from '@bookdock/auth';
import { getApiClient, MembershipPlanDto, Subscription, Payment, PaymentMethod } from '@bookdock/api-client';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';

const PLAN_LABELS: Record<string, string> = {
  free: '免费版',
  annual: '年卡',
  lifetime: '永久卡',
};

function formatPrice(cents: number): string {
  if (cents === 0) return '免费';
  return `¥${(cents / 100).toFixed(0)}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '永久';
  return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function Membership() {
  const navigate = useNavigate();
  const { isAuthenticated, isPremium, subscription, refreshUser } = useAuth();

  const [plans, setPlans] = useState<MembershipPlanDto[]>([]);
  const [currentSub, setCurrentSub] = useState<Subscription | null>(subscription);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlanDto | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('simulated');
  const [paying, setPaying] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [qrPollInterval, setQrPollInterval] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/membership' } });
      return;
    }
    loadPlans();
    loadSubscription();
  }, [isAuthenticated]);

  const loadPlans = async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getMembershipPlans();
      if (response.success && response.data) {
        setPlans(response.data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const loadSubscription = async () => {
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getSubscription();
      if (response.success && response.data) {
        setCurrentSub(response.data);
      }
    } catch {
      // Ignore
    }
  };

  const handleSelectPlan = (plan: MembershipPlanDto) => {
    if (plan.price === 0) return;
    setSelectedPlan(plan);
    setPayment(null);
    setPaymentError(null);
    setPaymentSuccess(false);
  };

  const handlePay = async () => {
    if (!selectedPlan) return;
    setPaying(true);
    setPaymentError(null);
    setPaymentSuccess(false);

    try {
      const apiClient = getApiClient();
      const response = await apiClient.createPayment(selectedPlan.id, paymentMethod);

      if (response.success && response.data) {
        setPayment(response.data);

        if (paymentMethod === 'simulated') {
          // Auto-simulate success
          const simulateRes = await apiClient.simulatePaymentSuccess(response.data.id);
          if (simulateRes.success && simulateRes.data) {
            setPaymentSuccess(true);
            await loadSubscription();
            await refreshUser();
            setTimeout(() => {
              setSelectedPlan(null);
              setPayment(null);
            }, 2000);
          }
        } else {
          // Start polling for QR code payments
          startQrPolling(response.data.id);
        }
      } else {
        setPaymentError(response.error || '创建支付订单失败');
      }
    } catch (err: any) {
      setPaymentError(err?.message || '支付失败，请重试');
    } finally {
      setPaying(false);
    }
  };

  const startQrPolling = (paymentId: string) => {
    if (qrPollInterval) clearInterval(qrPollInterval);

    const interval = window.setInterval(async () => {
      try {
        const apiClient = getApiClient();
        const response = await apiClient.pollPayment(paymentId);
        if (response.success && response.data) {
          setPayment(response.data);
          if (response.data.status === 'paid') {
            clearInterval(interval);
            setQrPollInterval(null);
            setPaymentSuccess(true);
            await loadSubscription();
            await refreshUser();
            setTimeout(() => {
              setSelectedPlan(null);
              setPayment(null);
            }, 3000);
          } else if (response.data.status === 'expired' || response.data.status === 'failed') {
            clearInterval(interval);
            setQrPollInterval(null);
            setPaymentError('支付已过期或失败，请重新发起支付');
          }
        }
      } catch {
        // Keep polling
      }
    }, 2000);

    setQrPollInterval(interval);
  };

  const closePaymentModal = () => {
    if (qrPollInterval) {
      clearInterval(qrPollInterval);
      setQrPollInterval(null);
    }
    setSelectedPlan(null);
    setPayment(null);
    setPaymentError(null);
    setPaymentSuccess(false);
  };

  useEffect(() => {
    return () => {
      if (qrPollInterval) clearInterval(qrPollInterval);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  const currentPlanId = currentSub?.plan || 'free';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-lg mb-4">
          <span className="text-3xl">👑</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {isPremium ? '您已是会员' : '升级会员'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          {isPremium
            ? `当前会员：${PLAN_LABELS[currentPlanId] || currentPlanId} · ${currentSub?.currentPeriodEnd ? `到期 ${formatDate(currentSub.currentPeriodEnd)}` : '永久有效'}`
            : '解锁全部功能，畅享无限阅读'}
        </p>
        {isPremium && <div className="mt-3"><PremiumBadge className="text-sm px-3 py-1" /></div>}
      </div>

      {/* Current plan status */}
      {currentSub && (
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">当前会员</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {PLAN_LABELS[currentPlanId] || currentPlanId}
                  {currentSub.status === 'active' && (
                    <span className="ml-2 text-sm font-normal text-green-600 dark:text-green-400">✓ 已激活</span>
                  )}
                </p>
                {currentSub.currentPeriodEnd && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    到期时间：{formatDate(currentSub.currentPeriodEnd)}
                  </p>
                )}
                {currentPlanId === 'lifetime' && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">永久有效，无需续费</p>
                )}
              </div>
              {currentPlanId !== 'lifetime' && (
                <div className="text-right">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    {currentSub.autoRenew ? '已开启自动续费' : '未开启自动续费'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isUpgrade = !isCurrent && plan.price > 0;

          return (
            <Card
              key={plan.id}
              className={`relative transition-all ${isUpgrade ? 'hover:shadow-xl hover:-translate-y-1 cursor-pointer' : ''} ${isCurrent ? 'ring-2 ring-amber-400' : ''}`}
              onClick={() => isUpgrade && handleSelectPlan(plan)}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full shadow">
                    {plan.badge}
                  </span>
                </div>
              )}

              <CardHeader>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {formatPrice(plan.price)}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-gray-500 dark:text-gray-400 ml-1">/{plan.interval}</span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, i) => (
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
                ) : plan.price === 0 ? (
                  <Button variant="secondary" disabled className="w-full">
                    免费
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => handleSelectPlan(plan)}>
                    {isUpgrade ? '立即升级' : '选择'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Benefits section */}
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
      {selectedPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            {paymentSuccess ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">支付成功！</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  您现在是 <strong>{PLAN_LABELS[selectedPlan.id]}</strong> 了！
                </p>
                <Button onClick={closePaymentModal}>开始使用</Button>
              </div>
            ) : payment?.qrCode ? (
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  {paymentMethod === 'wechat' ? '微信支付' : '支付宝'} 扫码支付
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  订单号：{payment.tradeNo} · 金额：{formatPrice(payment.amount)}
                </p>
                <img
                  src={payment.qrCode}
                  alt="支付二维码"
                  className="mx-auto mb-4 w-48 h-48 bg-white rounded-lg"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  请使用{paymentMethod === 'wechat' ? '微信' : '支付宝'}扫码支付
                </p>
                {payment.qrCodeExpiredAt && (
                  <p className="text-xs text-gray-400 mb-4">
                    二维码有效期至：{formatDate(payment.qrCodeExpiredAt)}
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="animate-pulse flex gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span className="w-2 h-2 bg-blue-500 rounded-full animation-delay-200"></span>
                    <span className="w-2 h-2 bg-blue-500 rounded-full animation-delay-400"></span>
                  </div>
                  <span className="text-sm text-gray-500">等待支付中...</span>
                </div>
                <Button variant="ghost" onClick={closePaymentModal}>取消</Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    确认支付
                  </h3>
                  <button onClick={closePaymentModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>

                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600 dark:text-gray-400">会员方案</span>
                    <span className="font-bold text-gray-900 dark:text-white">{PLAN_LABELS[selectedPlan.id]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">支付金额</span>
                    <span className="font-bold text-2xl text-amber-600">{formatPrice(selectedPlan.price)}</span>
                  </div>
                </div>

                {/* Payment method selection */}
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
                        onClick={() => setPaymentMethod(method.id as PaymentMethod)}
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
                    `确认支付 ${formatPrice(selectedPlan.price)}`
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
