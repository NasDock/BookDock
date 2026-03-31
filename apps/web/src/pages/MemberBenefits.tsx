import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

interface VipProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  badge: string;
  features: string[];
}

export default function MemberBenefits() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<VipProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vipUser, setVipUser] = useState<any>(null);

  // Check if already VIP
  useEffect(() => {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (stored) {
      const user = JSON.parse(stored);
      setVipUser(user);
      if (user.isVip) {
        navigate('/member-detail');
      }
    }

    // Fetch products
    fetch(`${API_BASE}/vip/products`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {
        // Fallback to static products
        setProducts([
          {
            id: 'year',
            name: '年卡',
            description: '1年会员特权',
            price: 20,
            badge: '1年',
            features: ['无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'],
          },
          {
            id: 'lifetime',
            name: '永久卡',
            description: '一次购买，永久有效',
            price: 60,
            badge: '永久',
            features: ['永久会员特权', '无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'],
          },
        ]);
      });
  }, [navigate]);

  // Create order and simulate payment
  const handleBuy = useCallback(async (productId: string) => {
    const token = localStorage.getItem('bookdock_vip_token');
    if (!token) {
      navigate('/member-login');
      return;
    }

    setCreatingOrder(productId);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/vip/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId, method: 'simulated' }),
      });
      const data = await res.json();

      if (data.orderId) {
        // Simulate payment callback (direct success)
        await fetch(`${API_BASE}/vip/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: data.orderId,
            tradeNo: `SIM_${Date.now()}`,
            method: 'simulated',
          }),
        });

        // Update stored user
        const updatedUser = {
          ...vipUser,
          level: productId,
          isVip: true,
          expiredAt: productId === 'year' ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString() : null,
        };
        localStorage.setItem('bookdock_vip_user', JSON.stringify(updatedUser));

        navigate('/member-payment-success');
      } else {
        setError(data.message || '创建订单失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setCreatingOrder(null);
    }
  }, [navigate, vipUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-xl mb-4">
            <span className="text-3xl">👑</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">会员特权</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">解锁 BookDock 全部功能</p>
        </div>

        {/* VIP Benefits Banner */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl p-6 mb-8 text-white shadow-lg">
          <h2 className="text-xl font-bold mb-3">✨ 会员专属特权</h2>
          <div className="grid grid-cols-2 gap-3">
            {['📚 无限书籍阅读', '🎧 智能语音朗读', '⭐ 抢先体验新功能', '🚫 去除全部广告', '💬 优先客服支持', '📖 高级阅读功能'].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-sm">
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Products */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {products.map((product) => (
            <Card key={product.id} className="relative overflow-hidden">
              {product.id === 'lifetime' && (
                <div className="absolute top-3 right-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  推荐
                </div>
              )}
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl">{product.name}</CardTitle>
                  <span className="text-3xl font-bold text-amber-500">¥{product.price}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{product.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {product.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="text-green-500">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {vipUser?.level === product.id && vipUser?.isVip && (
                  <div className="text-center py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400 text-sm font-medium">
                    ✓ 当前方案
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleBuy(product.id)}
                        disabled={creatingOrder !== null}
                        className="flex-1"
                        style={{ background: product.id === 'lifetime' ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : undefined }}
                      >
                        {creatingOrder === product.id ? '处理中...' : '微信支付'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleBuy(product.id)}
                        disabled={creatingOrder !== null}
                        className="flex-1"
                      >
                        {creatingOrder === product.id ? '处理中...' : '支付宝'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Purchase Notice */}
        <Card className="mb-8">
          <CardContent>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">📋 购买须知</h3>
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
              当前会员：{vipUser.isVip ? (vipUser.level === 'lifetime' ? '永久卡' : '年卡') : '免费版'}
            </p>
            <Button variant="secondary" onClick={() => navigate('/member-detail')}>
              查看会员详情 →
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">
              已有账户？
            </p>
            <Button variant="secondary" onClick={() => navigate('/member-login')}>
              会员登录 →
            </Button>
          </div>
        )}

        {/* Back */}
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← 返回书架
          </button>
        </div>
      </div>
    </div>
  );
}
