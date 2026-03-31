import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8080/api';

interface VipProduct {
  id: string; name: string; description: string; price: number; badge: string; features: string[];
}

export function MemberBenefitsScreen() {
  const [products, setProducts] = useState<VipProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (stored) {
      const user = JSON.parse(stored);
      setVipUser(user);
      if (user.isVip) {
        window.location.hash = '#/member-detail';
      }
    }
    fetch(`${API_BASE}/vip/products`)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setProducts(data) : null)
      .catch(() => {
        setProducts([
          { id: 'year', name: '年卡', description: '1年会员特权', price: 20, badge: '1年', features: ['无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
          { id: 'lifetime', name: '永久卡', description: '一次购买，永久有效', price: 60, badge: '永久', features: ['永久会员特权', '无限书籍阅读', '优先客服支持', '新功能抢先体验', '去除广告'] },
        ]);
      });
  }, []);

  const handleBuy = async (productId: string) => {
    const token = localStorage.getItem('bookdock_vip_token');
    if (!token) { window.location.hash = '#/member-login'; return; }
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
        localStorage.setItem('bookdock_vip_user', JSON.stringify(updatedUser));
        window.location.hash = '#/member-payment-success';
        window.location.reload();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow mb-3">
            <span className="text-2xl">👑</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">会员特权</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">解锁全部功能</p>
        </div>

        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-5 mb-6 text-white">
          <h2 className="font-bold mb-2">✨ 会员专属特权</h2>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {['📚 无限书籍', '🎧 语音朗读', '⭐ 新功能抢先', '🚫 去除广告', '💬 优先客服', '📖 高级阅读'].map(b => (
              <span key={b}>{b}</span>
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
                    <span className="text-green-500">✓</span> {f}
                  </li>
                ))}
              </ul>
              {vipUser?.level === product.id && vipUser?.isVip ? (
                <div className="text-center py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 text-sm font-medium">✓ 当前方案</div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => handleBuy(product.id)} disabled={isLoading}
                    className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                    style={{ background: product.id === 'lifetime' ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : undefined }}>
                    {isLoading ? '处理中...' : '微信支付'}
                  </button>
                  <button onClick={() => handleBuy(product.id)} disabled={isLoading}
                    className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-sm font-medium disabled:opacity-50">
                    {isLoading ? '处理中...' : '支付宝'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">📋 购买须知</h3>
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
    </div>
  );
}
