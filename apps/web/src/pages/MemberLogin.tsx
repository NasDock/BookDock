import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

export default function MemberLogin() {
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Send verification code
  const sendCode = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/vip/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (data.success) {
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(data.message || '发送失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  // Login
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/vip/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();

      if (data.success || data.token) {
        // Store VIP token
        const token = data.token;
        localStorage.setItem('bookdock_vip_token', token);
        localStorage.setItem('bookdock_vip_user', JSON.stringify({
          userId: data.userId,
          phone: data.phone,
          level: data.level,
          isVip: data.isVip,
          expiredAt: data.expiredAt,
        }));
        navigate('/member-benefits', { replace: true });
      } else {
        setError(data.message || '登录失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [phone, code, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-200 dark:bg-amber-900/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-200 dark:bg-orange-900/20 rounded-full blur-3xl opacity-50"></div>
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-xl mb-4">
            <span className="text-4xl">👑</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">会员登录</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">手机号快捷登录，解锁全部特权</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">📱 手机号登录</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  手机号
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="请输入手机号"
                    maxLength={11}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={sendCode}
                    disabled={countdown > 0 || isSending}
                    className="whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : isSending ? '发送中...' : '获取验证码'}
                  </Button>
                </div>
              </div>

              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  验证码
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="请输入6位验证码"
                  maxLength={6}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-center tracking-widest text-xl"
                />
              </div>

              {/* Hint */}
              <p className="text-xs text-gray-400 text-center">
                {countdown === 0 ? '👆 点击上方按钮获取验证码' : `⏳ 请 ${countdown} 秒后重新获取`}
              </p>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⟳</span>
                    登录中...
                  </span>
                ) : (
                  '✨ 登录 / 注册'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Benefits link */}
        <p className="text-center mt-6 text-sm text-gray-500 dark:text-gray-400">
          了解会员权益 →
          <button
            type="button"
            onClick={() => navigate('/member-benefits')}
            className="ml-1 text-amber-600 hover:text-amber-700 font-medium"
          >
            查看详情
          </button>
        </p>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← 返回账户登录
          </button>
        </div>
      </div>
    </div>
  );
}
