import React, { useState, useEffect } from 'react';
import { plusCreateVipPayment, plusGetVipStatus } from '../services/plus';
import { Crown, Sparkles, BookOpen, Headphones, Star, Ban, MessageCircle, Gift, Check } from 'lucide-react';

const API_BASE = 'http://localhost:8088/api';

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
      const userId = vipUser?.id;
      if (!userId) { window.location.hash = '#/member-login'; return; }
      const method = productId === 'lifetime' ? 'ALIPAY' : 'WECHAT';
      const amount = productId === 'lifetime' ? 60 : 20;
      const vipTier = productId === 'lifetime' ? 'LIFETIME' : 'BASIC';
      const data = await plusCreateVipPayment({ userId, amount, method, forVip: true, forPoints: false, vipTier, clientType: 'desktop' });
      if (data.code === 0) {
        const statusRes = await plusGetVipStatus(userId);
        const vipStatus = statusRes.data;
        const updatedUser = { ...vipUser, level: vipTier === 'LIFETIME' ? 'lifetime' : 'year', isVip: vipStatus?.isVip ?? true, expiredAt: vipStatus?.expiresAt ?? null };
        localStorage.setItem('bookdock_vip_user', JSON.stringify(updatedUser));
        setVipUser(updatedUser);
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
    </div>
  );
}
