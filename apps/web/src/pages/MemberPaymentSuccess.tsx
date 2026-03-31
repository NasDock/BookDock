import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent } from '@bookdock/ui';

export default function MemberPaymentSuccess() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);
  const [vipUser, setVipUser] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('bookdock_vip_user');
    if (stored) {
      const user = JSON.parse(stored);
      setVipUser(user);
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleGoBack = () => {
    navigate('/member-detail');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const levelName = vipUser?.level === 'lifetime' ? '永久卡' : vipUser?.level === 'year' ? '年卡' : '会员';

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-200 dark:bg-green-900/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-200 dark:bg-emerald-900/20 rounded-full blur-3xl opacity-50"></div>
      </div>

      <div className="w-full max-w-md relative text-center">
        {/* Success Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full shadow-xl mb-6 animate-bounce">
            <span className="text-5xl">✅</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">支付成功！</h1>
          <p className="text-gray-500 dark:text-gray-400">
            恭喜您已成为 BookDock {levelName} 🎉
          </p>
        </div>

        {/* Success Card */}
        <Card className="mb-6">
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <span className="text-3xl">👑</span>
                <div className="text-left">
                  <p className="font-bold text-gray-900 dark:text-white">{levelName}</p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {vipUser?.level === 'lifetime' ? '永久有效' : '1年有效期'}
                  </p>
                </div>
              </div>

              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <p>• 会员特权已开通</p>
                <p>• 可随时在"我的会员"中查看</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleGoBack}
            className="w-full"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            👑 查看会员详情
          </Button>
          <Button variant="secondary" onClick={handleGoHome} className="w-full">
            📚 返回书架
          </Button>
        </div>

        {/* Auto redirect */}
        {countdown > 0 && (
          <p className="text-xs text-gray-400 mt-4">
            {countdown} 秒后自动返回书架...
          </p>
        )}
      </div>
    </div>
  );
}
