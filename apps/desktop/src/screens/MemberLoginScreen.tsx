import React, { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:8080/api';

export function MemberLoginScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            if (prev <= 1) { clearInterval(timer); return 0; }
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
      if (data.token) {
        localStorage.setItem('bookdock_vip_token', data.token);
        localStorage.setItem('bookdock_vip_user', JSON.stringify({
          userId: data.userId, phone: data.phone, level: data.level,
          isVip: data.isVip, expiredAt: data.expiredAt,
        }));
        window.location.hash = '#/member-benefits';
        window.location.reload();
      } else {
        setError(data.message || '登录失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [phone, code]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow mb-4">
            <span className="text-3xl">👑</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">会员登录</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">手机号快捷登录</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">手机号</label>
              <div className="flex gap-2">
                <input
                  type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号" maxLength={11}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button type="button" onClick={sendCode} disabled={countdown > 0 || isSending}
                  className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-sm font-medium disabled:opacity-50">
                  {countdown > 0 ? `${countdown}s` : '验证码'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">验证码</label>
              <input
                type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6位验证码" maxLength={6}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={isLoading}
              className="w-full py-2 rounded-lg text-white font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}>
              {isLoading ? '登录中...' : '登录 / 注册'}
            </button>
          </form>
        </div>
        <p className="text-center mt-4 text-sm text-gray-500">
          <a href="#/member-benefits" className="text-amber-500 hover:underline">查看会员权益 →</a>
        </p>
      </div>
    </div>
  );
}
