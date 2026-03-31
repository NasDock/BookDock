import React, { useEffect, useState } from 'react';

export function MemberDetailScreen() {
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (!stored) { window.location.hash = '#/member-login'; return; }
    const user = JSON.parse(stored);
    if (!user.isVip) { window.location.hash = '#/member-benefits'; return; }
    setVipUser(user);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('bookdock_vip_token');
    localStorage.removeItem('bookdock_vip_user');
    window.location.hash = '#/member-login';
    window.location.reload();
  };

  if (!vipUser) return null;

  const isLifetime = vipUser.level === 'lifetime';
  const isYear = vipUser.level === 'year';
  const expiredAt = vipUser.expiredAt ? new Date(vipUser.expiredAt) : null;
  const daysLeft = expiredAt ? Math.ceil((expiredAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const levelName = isLifetime ? '永久卡' : isYear ? '年卡' : '免费版';
  const levelColor = isLifetime ? 'from-purple-500 to-pink-500' : isYear ? 'from-amber-400 to-orange-500' : 'from-gray-400 to-gray-500';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">我的会员</h1>
        </div>

        {/* Member Card */}
        <div className={`bg-gradient-to-r ${levelColor} rounded-xl p-5 text-white mb-4`}>
          <div className="flex justify-between">
            <div>
              <p className="text-sm opacity-80">会员等级</p>
              <h2 className="text-2xl font-bold mt-1">{levelName}</h2>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">{isLifetime ? '有效期' : '到期时间'}</p>
              <p className="font-bold mt-1">{isLifetime ? '永久有效' : (expiredAt ? expiredAt.toLocaleDateString('zh-CN') : '—')}</p>
              {isYear && daysLeft !== null && <p className="text-sm opacity-80 mt-1">还有 {daysLeft} 天</p>}
            </div>
          </div>
        </div>

        {/* Privileges */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🎁 会员特权</h3>
          <div className="grid grid-cols-2 gap-2">
            {['📚 无限书籍阅读', '🎧 语音朗读', '⭐ 抢先体验', '🚫 去除广告', '💬 优先客服', '📖 高级阅读'].map(item => (
              <div key={item} className="flex items-center gap-1.5 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Renew */}
        {!isLifetime && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{isYear ? '升级永久卡' : '续费'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{isYear ? '永久有效' : '¥20/年'}</p>
              </div>
              <a href="#/member-benefits" className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}>
                {isYear ? '升级 ¥60' : '续费 ¥20'}
              </a>
            </div>
          </div>
        )}

        {/* Account */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">📱 账户信息</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-500">手机号</span>
              <span>{vipUser.phone ? `${vipUser.phone.slice(0,3)}****${vipUser.phone.slice(-4)}` : '未绑定'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">状态</span>
              <span className="text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>正常
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <a href="#/member-benefits" className="block w-full py-2 text-center bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">会员权益说明</a>
          <button onClick={handleLogout} className="w-full py-2 text-gray-500 text-sm">退出登录</button>
        </div>
      </div>
    </div>
  );
}
