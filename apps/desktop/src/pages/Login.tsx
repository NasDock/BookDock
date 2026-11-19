import { initApiClient } from "@bookdock/api-client";
import { useAuth } from "@bookdock/auth";
import {
  BookOpen,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  User,
  Wifi,
  X,
  CircleHelp,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  consumeScanLoginSession,
  createScanLoginSession,
  getScanLoginSession,
  reportScanLoginResult,
  reportScanLoginResultViaSocket,
  subscribeScanLoginSession,
  type ScanLoginSession,
  type ScanLoginSessionStatus,
} from "../services/plus";
import {
  loadServerConfig,
  saveServerConfig,
  selectBestServer,
  setActiveServerAddress,
  toApiBaseUrl,
} from "../utils/network";
import { applyDesktopScanLoginResult, buildScanLoginQrValue } from "../utils/scanLogin";

interface ServerHistoryItem {
  value: string;
}

interface SavedSourceConfig {
  id: string;
  internal: string;
  external: string;
  name: string;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authLogin, register: authRegister } = useAuth();

  // Form state
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Address inputs
  const [internalAddress, setInternalAddress] = useState("");
  const [externalAddress, setExternalAddress] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // History
  const [serverHistory, setServerHistory] = useState<ServerHistoryItem[]>([]);

  // Scan login state
  const [scanSession, setScanSession] = useState<ScanLoginSession | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanLoginSessionStatus | null>(
    null,
  );
  const [scanBusy, setScanBusy] = useState(false);

  // Report dialog state
  const [showReport, setShowReport] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    },
    [],
  );

  const openReport = useCallback(() => {
    setReportTitle("");
    setReportReason("");
    setReportError(null);
    setReportSuccess(false);
    setShowReport(true);
  }, []);

  const closeReport = useCallback(() => {
    if (reportSubmitting) return;
    setShowReport(false);
  }, [reportSubmitting]);

  const handleReportSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!reportTitle.trim() || !reportReason.trim()) {
        setReportError("请填写标题和原因");
        return;
      }
      setReportError(null);
      setReportSuccess(false);
      setReportSubmitting(true);
      reportTimerRef.current = setTimeout(() => {
        setReportSubmitting(false);
        setReportSuccess(true);
        // 成功提示展示 1.5s 后自动关闭弹窗
        reportTimerRef.current = setTimeout(() => {
          setShowReport(false);
        }, 1500);
      }, 2000);
    },
    [reportTitle, reportReason],
  );

  const sourceType = "BookDock";
  const historyKey = `serverHistory_${sourceType}`;
  const configKey = `sourceConfig_${sourceType}`;

  // Load saved config & history on mount
  useEffect(() => {
    const history = localStorage.getItem(historyKey);
    setServerHistory(history ? JSON.parse(history) : []);

    const savedConfigStr = localStorage.getItem(configKey);
    let configs: SavedSourceConfig[] = [];
    try {
      if (savedConfigStr) {
        const parsed = JSON.parse(savedConfigStr);
        configs = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      /* ignore */
    }

    if (configs.length > 0) {
      const lastConfig = configs[configs.length - 1];
      setInternalAddress(lastConfig.internal || "");
      setExternalAddress(lastConfig.external || "");
      restoreCredentials(lastConfig.internal || lastConfig.external || "");
    } else {
      // Fallback to network utils config
      const netConfig = loadServerConfig();
      setInternalAddress(netConfig.internal || "");
      setExternalAddress(netConfig.external || "");
    }
  }, []);

  const restoreCredentials = (address: string) => {
    if (!address) return;
    const credsKey = `creds_${sourceType}_${address}`;
    const savedCreds = localStorage.getItem(credsKey);
    if (savedCreds) {
      const { username: u, password: p } = JSON.parse(savedCreds);
      setUsername(u || "");
      setPassword(p || "");
      setRememberMe(true);
    }
  };

  // --- Scan Login ---
  const createTargetSession = useCallback(async () => {
    try {
      const res = await createScanLoginSession({
        role: "target",
        deviceKind: "desktop",
      });
      if (res.data) {
        setScanSession(res.data);
        setScanStatus({
          sessionId: res.data.sessionId,
          role: res.data.role,
          deviceKind: res.data.deviceKind,
          expiresAt: res.data.expiresAt,
          status: "waiting_scan",
          sourceBundles: [],
          hasNativeAuth: false,
          hasPlusAuth: false,
        });
      }
    } catch (err) {
      console.error("Failed to create scan session", err);
      setError("创建扫码会话失败");
    }
  }, []);

  useEffect(() => {
    createTargetSession();
  }, [createTargetSession]);

  useEffect(() => {
    if (!scanSession) return;
    getScanLoginSession(scanSession.sessionId, scanSession.secret).catch(
      console.error,
    );
    const unsubscribe = subscribeScanLoginSession(
      scanSession.sessionId,
      scanSession.secret,
      (status) => setScanStatus(status),
    );
    return () => unsubscribe();
  }, [scanSession]);

  useEffect(() => {
    if (!scanSession || scanStatus?.status !== "confirmed") return;

    const consumeConfirmedScan = async () => {
      try {
        setScanBusy(true);
        const res = await consumeScanLoginSession(scanSession.sessionId, {
          secret: scanSession.secret,
        });

        try {
          if (!res.data) throw new Error("No data returned");
          await applyDesktopScanLoginResult(res.data);
        } catch (applyErr: any) {
          await reportScanLoginResult(scanSession.sessionId, {
            secret: scanSession.secret,
            success: false,
            error: applyErr.message,
          }).catch(console.error);
          reportScanLoginResultViaSocket(
            scanSession.sessionId,
            scanSession.secret,
            false,
            applyErr.message,
          );
          throw applyErr;
        }

        await reportScanLoginResult(scanSession.sessionId, {
          secret: scanSession.secret,
          success: true,
        }).catch(console.error);
        reportScanLoginResultViaSocket(
          scanSession.sessionId,
          scanSession.secret,
          true,
        );
        navigate("/", { replace: true });
      } catch (err: any) {
        console.error(err);
        setError(err.message || "扫码登录失败");
        createTargetSession();
      } finally {
        setScanBusy(false);
      }
    };

    consumeConfirmedScan();
  }, [
    scanSession?.sessionId,
    scanStatus?.status,
    navigate,
    createTargetSession,
  ]);

  const qrValue = scanSession
    ? buildScanLoginQrValue(scanSession, "desktop")
    : "";

  // --- Form handlers ---
  const saveConfig = (internal: string, external: string) => {
    const existingStr = localStorage.getItem(configKey);
    let existingConfigs: SavedSourceConfig[] = [];
    try {
      if (existingStr) {
        const parsed = JSON.parse(existingStr);
        if (Array.isArray(parsed)) existingConfigs = parsed;
      }
    } catch {
      /* ignore */
    }

    const existingIndex = existingConfigs.findIndex(
      (c) =>
        (internal && c.internal === internal) ||
        (external && c.external === external),
    );

    if (existingIndex !== -1) {
      existingConfigs[existingIndex] = {
        ...existingConfigs[existingIndex],
        internal: internal || existingConfigs[existingIndex].internal,
        external: external || existingConfigs[existingIndex].external,
      };
    } else {
      existingConfigs.push({
        id: Date.now().toString(),
        internal: internal || "",
        external: external || "",
        name: `服务器 ${existingConfigs.length + 1}`,
      });
    }
    localStorage.setItem(configKey, JSON.stringify(existingConfigs));

    const history = localStorage.getItem(historyKey);
    const list: ServerHistoryItem[] = history ? JSON.parse(history) : [];
    [internal, external].forEach((addr) => {
      if (addr && !list.find((i) => i.value === addr)) {
        list.push({ value: addr });
      }
    });
    localStorage.setItem(historyKey, JSON.stringify(list));
    setServerHistory(list);

    // Also save to network utils
    saveServerConfig({ internal, external, name: `服务器` });
  };

  const handleRemoveHistory = (value: string) => {
    const history = localStorage.getItem(historyKey);
    if (history) {
      const list = (JSON.parse(history) as ServerHistoryItem[]).filter(
        (item) => item.value !== value,
      );
      localStorage.setItem(historyKey, JSON.stringify(list));
      setServerHistory(list);
    }
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!internalAddress && !externalAddress) {
      setError("请至少输入一个服务器地址（内网或外网）");
      setLoading(false);
      return;
    }
    if (!username || !password) {
      setError("请填写用户名和密码");
      setLoading(false);
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      setLoading(false);
      return;
    }

    try {
      const bestAddress = await selectBestServer(
        internalAddress,
        externalAddress,
      );

      if (!bestAddress) {
        setError("无法连接到任一服务器地址，请检查网络或地址输入");
        setLoading(false);
        return;
      }

      const apiBaseUrl = toApiBaseUrl(bestAddress);

      // Init API client with selected address
      initApiClient({
        baseURL: apiBaseUrl,
        getAuthToken: () => localStorage.getItem("bookdock_auth_token"),
        onAuthError: () => {
          localStorage.removeItem("bookdock_auth_token");
          localStorage.removeItem("bookdock_auth_user");
        },
      });

      saveConfig(internalAddress, externalAddress);
      setActiveServerAddress(apiBaseUrl);

      // Save credentials if remember me
      if (rememberMe) {
        localStorage.setItem(
          `creds_${sourceType}_${bestAddress}`,
          JSON.stringify({ username, password }),
        );
      }

      if (isLogin) {
        const res = await authLogin(username, password);
        if (res.success && res.data) {
          navigate("/", { replace: true });
        } else {
          setError(res.error || "登录失败");
        }
      } else {
        const res = await authRegister(username, password, confirmPassword);
        if (res.success && res.data) {
          navigate("/", { replace: true });
        } else {
          setError(res.error || "注册失败");
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || (isLogin ? "登录失败" : "注册失败"));
    } finally {
      setLoading(false);
    }
  };

  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || "/";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 dark:bg-blue-900/20 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 dark:bg-purple-900/20 rounded-full blur-3xl opacity-50"></div>
      </div>

      <div className="w-full max-w-5xl relative">
        {/* Report button (top-right) */}
        <button
          type="button"
          onClick={openReport}
          title="举报数据源"
          aria-label="举报数据源"
          className="absolute top-0 right-0 z-10 p-2 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-gray-700 transition-colors"
        >
          <CircleHelp className="w-6 h-6" />
        </button>

        {/* Logo header */}
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="BookDock"
            className="w-16 h-16 object-contain mb-3 mx-auto"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            书仓
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            连接您的数据服务器
          </p>
        </div>

        {/* Main Card - Two columns like AudioDock */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="grid md:grid-cols-2">
            {/* Left: Scan Login */}
            <div className="p-8 bg-gray-50 dark:bg-gray-700/30 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
              {scanStatus?.status === "waiting_confirm" ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    等待确认
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    手机已扫码，请在手机上确认登录
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm mb-4">
                    {qrValue ? (
                      <QRCodeSVG
                        value={qrValue}
                        size={180}
                        level="M"
                        bgColor="#FFFFFF"
                        fgColor="#111827"
                      />
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
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${scanBusy ? "animate-spin" : ""}`}
                    />
                    刷新二维码
                  </button>
                </>
              )}
            </div>

            {/* Right: Data Source Login Form */}
            <div className="p-8">
              <div className="flex items-center gap-2 mb-6">
                <Server className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {sourceType} {isLogin ? "登录" : "注册"}
                </h2>
              </div>

              <form onSubmit={handleFinish} className="space-y-4">
                {/* Internal Address */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Wifi className="w-3 h-3" /> 内网地址
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      list="internal-history"
                      value={internalAddress}
                      onChange={(e) => {
                        setInternalAddress(e.target.value);
                        restoreCredentials(e.target.value);
                      }}
                      placeholder="http://192.168.x.x:8088/api"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <datalist id="internal-history">
                      {serverHistory.map((item) => (
                        <option key={item.value} value={item.value} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* External Address */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Globe className="w-3 h-3" /> 外网地址
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      list="external-history"
                      value={externalAddress}
                      onChange={(e) => {
                        setExternalAddress(e.target.value);
                        restoreCredentials(e.target.value);
                      }}
                      placeholder="https://nas.example.com/api"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <datalist id="external-history">
                      {serverHistory.map((item) => (
                        <option key={item.value} value={item.value} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Server History Management */}
                {serverHistory.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {serverHistory.map((item) => (
                      <span
                        key={item.value}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400"
                      >
                        {item.value}
                        <button
                          type="button"
                          onClick={() => handleRemoveHistory(item.value)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Username */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <User className="w-3 h-3" /> 用户名
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="请输入用户名"
                    autoComplete="username"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Lock className="w-3 h-3" /> 密码
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        isLogin ? "请输入密码" : "请输入密码（至少6位）"
                      }
                      autoComplete={
                        isLogin ? "current-password" : "new-password"
                      }
                      className="w-full px-4 py-2.5 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password (register only) */}
                {!isLogin && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                      确认密码
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="请再次输入密码"
                      autoComplete="new-password"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                )}

                {/* Remember me (login only) */}
                {isLogin && (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <label
                      htmlFor="rememberMe"
                      className="ml-2 text-sm text-gray-600 dark:text-gray-400"
                    >
                      记住密码
                    </label>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {isLogin ? "登录中..." : "注册中..."}
                    </>
                  ) : isLogin ? (
                    "登录"
                  ) : (
                    "注册"
                  )}
                </button>

                {/* Switch mode */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setError(null);
                  }}
                  className="w-full text-center text-sm text-blue-500 hover:text-blue-600 font-medium py-2"
                >
                  {isLogin ? "没有账号？去注册" : "已有账号？去登录"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Report Dialog */}
      {showReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeReport();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                举报数据源
              </h3>
              <button
                type="button"
                onClick={closeReport}
                disabled={reportSubmitting}
                className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reportSuccess ? (
              <div className="px-6 py-12 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <svg
                    className="w-7 h-7 text-green-600 dark:text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-base font-medium text-gray-900 dark:text-white">
                  提交成功
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  感谢您的反馈，我们会尽快处理
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    标题 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={reportTitle}
                    onChange={(e) => {
                      setReportTitle(e.target.value);
                      setReportError(null);
                    }}
                    placeholder="请输入举报标题"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    原因 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reportReason}
                    onChange={(e) => {
                      setReportReason(e.target.value);
                      setReportError(null);
                    }}
                    placeholder="请详细描述举报原因"
                    rows={4}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                  />
                </div>

                {reportError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {reportError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {reportSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      提交中...
                    </>
                  ) : (
                    "提交举报"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
