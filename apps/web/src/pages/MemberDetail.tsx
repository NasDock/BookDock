import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';

export default function MemberDetail() {
  const navigate = useNavigate();
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (!stored) {
      navigate('/member-login');
      return;
    }
    const user = JSON.parse(stored);
    if (!user.isVip) {
      navigate('/member-benefits');
      return;
    }
    setVipUser(user);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('bookdock_vip_token');
    localStorage.removeItem('bookdock_vip_user');
    navigate('/member-login');
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
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br ${levelColor} rounded-2xl shadow-xl mb-4`}>
            <span className="text-4xl">👑</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">我的会员</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">感谢您对 BookDock 的支持</p>
        </div>

        {/* Member Card */}
        <Card className="mb-6 overflow-hidden">
          <div className={`bg-gradient-to-r ${levelColor} p-6 text-white`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm opacity-80">会员等级</p>
                <h2 className="text-3xl font-bold mt-1">{levelName}</h2>
              </div>
              <div className="text-right">
                <p className="text-sm opacity-80">
                  {isLifetime ? '有效期' : '到期时间'}
                </p>
                <p className="text-xl font-bold mt-1">
                  {isLifetime ? '永久有效' : (expiredAt ? expiredAt.toLocaleDateString('zh-CN') : '—')}
                </p>
                {isYear && daysLeft !== null && daysLeft > 0 && (
                  <p className="text-sm opacity-80 mt-1">还有 {daysLeft} 天</p>
                )}
                {isYear && daysLeft !== null && daysLeft <= 0 && (
                  <p className="text-sm opacity-80 mt-1 text-red-200">已到期</p>
                )}
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">🎁 会员特权</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '📚', text: '无限书籍阅读' },
                { icon: '🎧', text: '智能语音朗读' },
                { icon: '⭐', text: '抢先体验新功能' },
                { icon: '🚫', text: '去除全部广告' },
                { icon: '💬', text: '优先客服支持' },
                { icon: '📖', text: '高级阅读功能' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span>{item.icon}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Renew / Upgrade */}
        {!isLifetime && (
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {isYear ? '升级到永久卡' : '续费年卡'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {isYear ? '永久有效，无需续费' : `¥20/年，续费当前会员`}
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/member-benefits')}
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
                >
                  {isYear ? '升级永久卡 ¥60' : '续费 ¥20'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account Info */}
        <Card className="mb-6">
          <CardContent>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">📱 账户信息</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 text-sm">手机号</span>
                <span className="text-gray-900 dark:text-white text-sm">
                  {vipUser.phone ? `${vipUser.phone.slice(0, 3)}****${vipUser.phone.slice(-4)}` : '未绑定'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 text-sm">会员等级</span>
                <span className="text-amber-500 font-medium text-sm">{levelName}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500 dark:text-gray-400 text-sm">状态</span>
                <span className="text-green-500 font-medium text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  正常
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <Button variant="secondary" className="w-full" onClick={() => navigate('/member-benefits')}>
            会员权益说明
          </Button>
          <Button variant="ghost" className="w-full text-gray-500" onClick={handleLogout}>
            退出登录
          </Button>
        </div>

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
