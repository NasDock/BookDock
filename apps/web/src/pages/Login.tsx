import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@bookdock/auth';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@bookdock/ui';
import { getApiClient } from '@bookdock/api-client';

interface NASConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: 'http' | 'https';
  basePath: string;
}

const RECENT_NAS_KEY = 'bookdock_recent_nas';

function loadRecentNAS(): NASConfig | null {
  try {
    const stored = localStorage.getItem(RECENT_NAS_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      return { protocol: 'http', port: 8080, basePath: '/books', ...config };
    }
  } catch {
    // Ignore
  }
  return null;
}

function saveRecentNAS(config: Partial<NASConfig>): void {
  try {
    localStorage.setItem(RECENT_NAS_KEY, JSON.stringify(config));
  } catch {
    // Ignore
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isLoading, isAuthenticated } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginType, setLoginType] = useState<'account' | 'nas'>('account');

  // Account login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NAS login state
  const [nasConfig, setNasConfig] = useState<NASConfig>(() => {
    const recent = loadRecentNAS();
    return recent || {
      protocol: 'http',
      host: '',
      port: 8080,
      username: '',
      password: '',
      basePath: '/books',
    };
  });
  const [nasError, setNasError] = useState<string | null>(null);
  const [nasIsConnecting, setNasIsConnecting] = useState(false);
  const [showNasPassword, setShowNasPassword] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  // Load remembered username
  useEffect(() => {
    const remembered = localStorage.getItem('bookdock_remembered_username');
    if (remembered) {
      setUsername(remembered);
      setRememberMe(true);
    }
  }, []);

  const validateAccountForm = useCallback((): string | null => {
    if (!username.trim()) return '请输入用户名';
    if (username.length < 2) return '用户名长度至少为2位';
    if (!password) return '请输入密码';
    if (mode === 'register') {
      if (password.length < 6) return '密码长度至少为6位';
      if (password !== confirmPassword) return '两次输入的密码不一致';
    }
    return null;
  }, [username, password, confirmPassword, mode]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateAccountForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    let response;
    if (mode === 'register') {
      response = await register(username, password, email || undefined);
    } else {
      response = await login(username, password);
    }

    if (response.success) {
      // Handle remember me
      if (rememberMe) {
        localStorage.setItem('bookdock_remembered_username', username);
      } else {
        localStorage.removeItem('bookdock_remembered_username');
      }
      navigate(from, { replace: true });
    } else {
      setError(response.error || (mode === 'login' ? '登录失败' : '注册失败'));
    }
  };

  const handleNASLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setNasError(null);

    if (!nasConfig.host.trim()) {
      setNasError('请输入 NAS 服务器地址');
      return;
    }

    if (!nasConfig.username.trim()) {
      setNasError('请输入用户名');
      return;
    }

    if (!nasConfig.password) {
      setNasError('请输入密码');
      return;
    }

    setNasIsConnecting(true);

    try {
      // Build NAS API URL
      const baseURL = `${nasConfig.protocol}://${nasConfig.host}:${nasConfig.port}/api`;

      // Test connection by attempting to login via NAS auth
      const response = await fetch(`${baseURL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: nasConfig.username,
          password: nasConfig.password,
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        // Save NAS config for future use
        saveRecentNAS({
          host: nasConfig.host,
          port: nasConfig.port,
          username: nasConfig.username,
          protocol: nasConfig.protocol,
          basePath: nasConfig.basePath,
        });

        // Store NAS token
        localStorage.setItem('bookdock_nas_token', data.data.token);
        localStorage.setItem('bookdock_nas_config', JSON.stringify({
          host: nasConfig.host,
          port: nasConfig.port,
          protocol: nasConfig.protocol,
          basePath: nasConfig.basePath,
        }));

        // Use the NAS token for future requests
        const apiClient = getApiClient();
        // Note: In a real implementation, you'd reconfigure the API client to use NAS auth

        navigate(from, { replace: true });
      } else {
        setNasError(data.error || 'NAS 登录失败，请检查用户名和密码');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '无法连接到 NAS 服务器';
      if (errorMessage.includes('fetch')) {
        setNasError('无法连接到 NAS 服务器，请检查地址是否正确');
      } else {
        setNasError(errorMessage);
      }
    } finally {
      setNasIsConnecting(false);
    }
  };

  const handleDemoLogin = async () => {
    setUsername('demo');
    setPassword('demo123');
    setError(null);

    const response = await login('demo', 'demo123');
    if (response.success) {
      navigate(from, { replace: true });
    } else {
      setError('演示模式登录失败，请使用任意账户登录');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 dark:bg-blue-900/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 dark:bg-purple-900/20 rounded-full blur-3xl opacity-50"></div>
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-xl mb-4 transform hover:scale-105 transition-transform">
            <span className="text-4xl">📖</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">书仓</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">您的私人电子书库</p>
        </div>

        {/* Login type tabs */}
        <div className="flex mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => {
              setLoginType('account');
              setError(null);
              setNasError(null);
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              loginType === 'account'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            账户登录
          </button>
          <button
            onClick={() => {
              setLoginType('nas');
              setError(null);
              setNasError(null);
            }}
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
                  ? '🔑 登录账户'
                  : '📝 注册账户'
                : '🖥️ NAS 连接设置'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loginType === 'nas' ? (
              <form onSubmit={handleNASLogin} className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  连接您的 NAS 设备，访问本地电子书库
                </p>

                {/* Protocol & Host */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      协议
                    </label>
                    <select
                      value={nasConfig.protocol}
                      onChange={(e) => setNasConfig({ ...nasConfig, protocol: e.target.value as 'http' | 'https' })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      NAS 地址
                    </label>
                    <input
                      type="text"
                      value={nasConfig.host}
                      onChange={(e) => setNasConfig({ ...nasConfig, host: e.target.value })}
                      placeholder="192.168.1.100"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      端口
                    </label>
                    <input
                      type="number"
                      value={nasConfig.port}
                      onChange={(e) => setNasConfig({ ...nasConfig, port: parseInt(e.target.value) || 8080 })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      基础路径
                    </label>
                    <input
                      type="text"
                      value={nasConfig.basePath}
                      onChange={(e) => setNasConfig({ ...nasConfig, basePath: e.target.value })}
                      placeholder="/books"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    用户名
                  </label>
                  <input
                    type="text"
                    value={nasConfig.username}
                    onChange={(e) => setNasConfig({ ...nasConfig, username: e.target.value })}
                    placeholder="NAS 用户名"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    密码
                  </label>
                  <div className="relative">
                    <input
                      type={showNasPassword ? 'text' : 'password'}
                      value={nasConfig.password}
                      onChange={(e) => setNasConfig({ ...nasConfig, password: e.target.value })}
                      placeholder="NAS 密码"
                      className="w-full px-4 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNasPassword(!showNasPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNasPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-gray-600 dark:text-gray-400">记住NAS配置</span>
                </label>

                {nasError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{nasError}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={nasIsConnecting}
                  className="w-full"
                  variant="secondary"
                >
                  {nasIsConnecting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⟳</span>
                      连接中...
                    </span>
                  ) : (
                    '🔗 连接 NAS'
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleAccountSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    用户名
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="输入用户名"
                    autoComplete="username"
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    密码
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? '输入密码' : '输入密码（至少6位）'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {mode === 'register' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        确认密码
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次输入密码"
                        autoComplete="new-password"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        邮箱 <span className="text-gray-400">(可选)</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="输入邮箱"
                        autoComplete="email"
                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-gray-600 dark:text-gray-400">记住我</span>
                    </label>
                    <button
                      type="button"
                      className="text-blue-500 hover:text-blue-600"
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
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⟳</span>
                      {mode === 'login' ? '登录中...' : '注册中...'}
                    </span>
                  ) : mode === 'login' ? (
                    '🚀 登录'
                  ) : (
                    '✨ 注册'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Mode toggle for account login */}
        {loginType === 'account' && (
          <p className="text-center mt-6 text-sm text-gray-500 dark:text-gray-400">
            {mode === 'login' ? '还没有账户？' : '已有账户？'}
            <button
              type="button"
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
          <p className="text-sm text-blue-600 dark:text-blue-400 text-center mb-3">
            💡 演示模式：快速体验书仓功能
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="w-full"
          >
            使用演示账户登录
          </Button>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <button
            type="button"
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
