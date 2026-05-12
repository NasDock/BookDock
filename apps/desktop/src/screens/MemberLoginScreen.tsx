import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Crown, Smartphone, Sparkles, Loader2, RefreshCw, Monitor, ArrowLeft } from 'lucide-react';
import {
  plusLogin,
  plusSendCode,
  createScanLoginSession,
  getScanLoginSession,
  subscribeScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  reportScanLoginResultViaSocket,
  type ScanLoginSession,
  type ScanLoginSessionStatus,
} from '../services/plus';
import { applyDesktopScanLoginResult } from '../utils/scanLogin';

export function MemberLoginScreen() {
  // Form state
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scan login state
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanLoginSessionStatus | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  // Countdown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown((p) => p - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  // Create scan login session
  const createTargetSession = useCallback(async () => {
    try {
      const res = await createScanLoginSession({ role: 'target', deviceKind: 'desktop' });
      if (res.data) {
        setScanSession(res.data);
      }
    } catch (err) {
      console.error('Failed to create scan session', err);
      setError('创建扫码会话失败');
    }
  }, []);

  useEffect(() => {
    createTargetSession();
  }, [createTargetSession]);

  // Subscribe to scan session updates
  useEffect(() => {
    if (!scanSession) return;

    getScanLoginSession(scanSession.sessionId, scanSession.secret).catch(console.error);

    const unsubscribe = subscribeScanLoginSession(
      scanSession.sessionId,
      scanSession.secret,
      (status) => setScanStatus(status),
    );

    return () => unsubscribe();
  }, [scanSession]);

  // Handle confirmed scan login
  useEffect(() => {
    if (!scanSession || scanStatus?.status !== 'confirmed') return;

    const consumeConfirmedScan = async () => {
      try {
        setScanBusy(true);
        const res = await consumeScanLoginSession(scanSession.sessionId, {
          secret: scanSession.secret,
        });

        try {
          if (!res.data) throw new Error('No data returned');
          await applyDesktopScanLoginResult(res.data);
          if (res.data.plusAuth) {
            localStorage.setItem('bookdock_plus_token', res.data.plusAuth.token);
            localStorage.setItem('bookdock_plus_user_id', JSON.stringify(res.data.plusAuth.userId));
          }
        } catch (applyErr: any) {
          await reportScanLoginResult(scanSession.sessionId, {
            secret: scanSession.secret,
            success: false,
            error: applyErr.message,
          }).catch(console.error);
          reportScanLoginResultViaSocket(scanSession.sessionId, scanSession.secret, false, applyErr.message);
          throw applyErr;
        }

        await reportScanLoginResult(scanSession.sessionId, {
          secret: scanSession.secret,
          success: true,
        }).catch(console.error);
        reportScanLoginResultViaSocket(scanSession.sessionId, scanSession.secret, true);

        window.location.hash = '#/member-benefits';
        window.location.reload();
      } catch (err: any) {
        console.error(err);
        setError(err.message || '扫码登录失败');
        createTargetSession();
      } finally {
        setScanBusy(false);
      }
    };

    consumeConfirmedScan();
  }, [scanSession?.sessionId, scanStatus?.status, createTargetSession]);

  // Send verification code
  const handleSendCode = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const res = await plusSendCode({ phone });
      if (res.code === 200 || res.code === 201) {
        setCountdown(60);
      } else {
        setError(res.message || '发送失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsSending(false);
    }
  }, [phone]);

  // Login
  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!code || code.length !== 6) {
        setError('请输入6位验证码');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await plusLogin({ phone, code });
        setIsLoading(false);

        if (res.code === 200 || res.code === 201) {
          const { token, userId } = res.data!;
          localStorage.setItem('bookdock_plus_token', token);
          localStorage.setItem('bookdock_plus_user_id', JSON.stringify(userId));
          window.location.hash = '#/member-benefits';
          window.location.reload();
        } else {
          setError(res.message || '登录失败');
        }
      } catch (err: any) {
        setIsLoading(false);
        setError(err.message || '登录失败，请检查验证码');
      }
    },
    [phone, code],
  );

  const qrValue = scanSession
    ? JSON.stringify({
        kind: 'bookdock-scan-login',
        version: 1,
        sessionId: scanSession.sessionId,
        secret: scanSession.secret,
        role: 'target',
        deviceKind: 'desktop',
      })
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-200 dark:bg-amber-900/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-200 dark:bg-orange-900/20 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="w-full max-w-4xl relative">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-xl mb-3">
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">用户登录</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">BookDock 书仓会员</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="grid md:grid-cols-2">
            {/* Left: Scan Login */}
            <div className="p-8 bg-gray-50 dark:bg-gray-700/30 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
              {scanStatus?.status === 'waiting_confirm' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="w-8 h-8 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">等待确认</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">手机已扫码，请在手机上确认登录</p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-4">
                    {qrValue ? (
                      <QRCodeSVG value={qrValue} size={180} level="M" />
                    ) : (
                      <div className="w-[180px] h-[180px] bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-3">
                    打开 BookDock App 扫一扫
                  </p>
                  <button
                    type="button"
                    onClick={createTargetSession}
                    disabled={scanBusy}
                    className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${scanBusy ? 'animate-spin' : ''}`} />
                    刷新二维码
                  </button>
                </>
              )}
            </div>

            {/* Right: Phone Login Form */}
            <div className="p-8">
              <div className="flex items-center gap-2 mb-6">
                <Monitor className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">手机号登录</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">手机号</label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入手机号"
                      maxLength={11}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-shadow"
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={countdown > 0 || isSending}
                      className="px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      {countdown > 0 ? `${countdown}s` : isSending ? '发送中...' : '获取验证码'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">验证码</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="请输入6位验证码"
                    maxLength={6}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-shadow text-center tracking-widest text-lg"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-lg text-white font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      登录中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      登录 / 注册
                    </span>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  登录即代表同意
                  <a
                    href="https://www.audiodock.cn/docs/privacy-policy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 mx-1"
                  >
                    《隐私政策》
                  </a>
                  和
                  <a
                    href="https://www.audiodock.cn/docs/user-agreement/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 mx-1"
                  >
                    《用户协议》
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <a
            href="#/member-benefits"
            className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
          >
            查看会员权益 →
          </a>
        </div>
      </div>
    </div>
  );
}
