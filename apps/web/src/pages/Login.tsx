import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@bookdock/auth';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isLoading } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginType, setLoginType] = useState<'account' | 'nas'>('account');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }

      if (password.length < 6) {
        setError('密码长度至少为6位');
        return;
      }

      const response = await register(username, password, email || undefined);
      if (response.success) {
        navigate(from, { replace: true });
      } else {
        setError(response.error || '注册失败');
      }
    } else {
      const response = await login(username, password);
      if (response.success) {
        navigate(from, { replace: true });
      } else {
        setError(response.error || '登录失败');
      }
    }
  };

  const handleNASLogin = () => {
    // In a real implementation, this would handle NAS authentication
    // For now, we'll simulate it
    setError('NAS 登录功能开发中...');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-xl mb-4">
            <span className="text-4xl">📖</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">书仓</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">您的私人电子书库</p>
        </div>

        {/* Login type tabs */}
        <div className="flex mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setLoginType('account')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              loginType === 'account'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            账户登录
          </button>
          <button
            onClick={() => setLoginType('nas')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              loginType === 'nas'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            NAS 本地账户
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              {loginType === 'account'
                ? mode === 'login'
                  ? '登录账户'
                  : '注册账户'
                : 'NAS 连接设置'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loginType === 'nas' ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  连接您的 NAS 设备，访问本地电子书库
                </p>
                
                <Input
                  label="NAS 地址"
                  placeholder="例如: 192.168.1.100"
                  type="text"
                />

                <Input
                  label="用户名"
                  placeholder="NAS 用户名"
                  type="text"
                />

                <Input
                  label="密码"
                  placeholder="NAS 密码"
                  type="password"
                />

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded border-gray-300" />
                    <span className="text-gray-600 dark:text-gray-400">记住密码</span>
                  </label>
                </div>

                <Button
                  onClick={handleNASLogin}
                  className="w-full"
                  variant="secondary"
                >
                  连接 NAS
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="用户名"
                  placeholder="输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />

                <Input
                  label="密码"
                  placeholder="输入密码"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />

                {mode === 'register' && (
                  <>
                    <Input
                      label="确认密码"
                      placeholder="再次输入密码"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                    />

                    <Input
                      label="邮箱 (可选)"
                      placeholder="输入邮箱"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </>
                )}

                {mode === 'login' && (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      className="text-sm text-blue-500 hover:text-blue-600"
                    >
                      忘记密码？
                    </button>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⟳</span>
                      {mode === 'login' ? '登录中...' : '注册中...'}
                    </span>
                  ) : mode === 'login' ? (
                    '登录'
                  ) : (
                    '注册'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Mode toggle */}
        {loginType === 'account' && (
          <p className="text-center mt-6 text-sm text-gray-500 dark:text-gray-400">
            {mode === 'login' ? '还没有账户？' : '已有账户？'}
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
              className="ml-1 text-blue-500 hover:text-blue-600 font-medium"
            >
              {mode === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        )}

        {/* Demo hint */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
            💡 演示模式：使用任意用户名和密码即可登录
          </p>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← 返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
