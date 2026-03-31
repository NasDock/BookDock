import React, { useEffect, useState } from 'react';

export function MemberPaymentSuccessScreen() {
  const [countdown, setCountdown] = useState(3);
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (stored) setVipUser(JSON.parse(stored));

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const levelName = vipUser?.level === 'lifetime' ? '永久卡' : vipUser?.level === 'year' ? '年卡' : '会员';

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full shadow-xl mb-6">
          <span className="text-4xl">✅</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">支付成功！</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">恭喜您已成为 BookDock {levelName} 🎉</p>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl mb-4">
            <span className="text-2xl">👑</span>
            <div className="text-left">
              <p className="font-bold text-gray-900 dark:text-white">{levelName}</p>
              <p className="text-sm text-green-600">{vipUser?.level === 'lifetime' ? '永久有效' : '1年有效期'}</p>
            </div>
          </div>
          <p className="text-sm text-gray-500">会员特权已开通，可随时在"我的会员"中查看</p>
        </div>

        <div className="space-y-2">
          <a href="#/member-detail" className="block w-full py-2.5 rounded-lg text-white text-center font-medium"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            👑 查看会员详情
          </a>
          <a href="#/" className="block w-full py-2.5 text-center bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">
            📚 返回书架
          </a>
        </div>
        {countdown > 0 && <p className="text-xs text-gray-400 mt-3">{countdown} 秒后自动返回...</p>}
      </div>
    </div>
  );
}
