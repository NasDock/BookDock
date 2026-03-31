import React, { useState, useEffect } from 'react';
import { useAuth } from '@bookdock/auth';
import { Button, Card, CardHeader, CardTitle, CardContent, CardFooter } from '@bookdock/ui';
import { useThemeStore } from '../stores/authStore';
import { useReaderStore as useReaderStore2 } from '../stores/themeStore';
import { getApiClient, User } from '@bookdock/api-client';
import type { ReaderMode } from '@bookdock/ebook-reader';

// ==================== Page Turn Mode ====================
type PageTurnMode = 'swipe' | 'click' | 'scroll';

const PAGE_TURN_PRESETS: Record<PageTurnMode, { icon: string; label: string; desc: string }> = {
  swipe: { icon: '👆', label: '滑动翻页', desc: '左右滑动或点击屏幕边缘翻页' },
  click: { icon: '🖱️', label: '点击翻页', desc: '点击屏幕中央或边缘翻页' },
  scroll: { icon: '📜', label: '滚动模式', desc: '滚动阅读，支持自动滚动' },
};

// ==================== Font Size Preset ====================
type FontSizePreset = 'small' | 'medium' | 'large' | 'xlarge';
const FONT_SIZE_PRESETS: Record<FontSizePreset, { label: string; size: number }> = {
  small: { label: '小', size: 14 },
  medium: { label: '中', size: 18 },
  large: { label: '大', size: 22 },
  xlarge: { label: '特大', size: 26 },
};

// ==================== Line Height Preset ====================
type LineHeightPreset = 'compact' | 'normal' | 'spacious';
const LINE_HEIGHT_PRESETS: Record<LineHeightPreset, { label: string; height: number }> = {
  compact: { label: '紧凑', height: 1.4 },
  normal: { label: '标准', height: 1.8 },
  spacious: { label: '宽松', height: 2.2 },
};

// ==================== Reader Theme Preset ====================
const READER_THEME_PRESETS: Record<ReaderMode, { icon: string; label: string; bg: string; text: string }> = {
  light: { icon: '☀️', label: '浅色', bg: '#ffffff', text: '#333333' },
  dark: { icon: '🌙', label: '深色', bg: '#1a1a1a', text: '#e0e0e0' },
  sepia: { icon: '📜', label: '护眼', bg: '#f5ebe0', text: '#5c4b37' },
};

// ==================== Password Change Section ====================
function PasswordChangeSection() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码长度至少为6位' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' });
      return;
    }

    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      const response = await apiClient.updateUser(user!.id, { password: newPassword } as Partial<User>);
      if (response.success) {
        setMessage({ type: 'success', text: '密码修改成功' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: response.error || '修改失败' });
      }
    } catch {
      setMessage({ type: 'error', text: '修改失败，请稍后重试' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔐 修改密码</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              当前密码
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入当前密码"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              新密码
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入新密码（至少6位）"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              确认新密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="再次输入新密码"
            />
          </div>
          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
              {message.text}
            </div>
          )}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? '修改中...' : '修改密码'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ==================== Storage Section ====================
function StorageSection() {
  const { user } = useAuth();
  const [storageInfo, setStorageInfo] = useState<{ used: number; limit: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStorage = async () => {
      setIsLoading(true);
      try {
        const apiClient = getApiClient();
        const response = await apiClient.getStorageInfo();
        if (response.success && response.data) {
          setStorageInfo(response.data);
        } else {
          if (user?.storageUsed !== undefined && user?.storageLimit !== undefined) {
            setStorageInfo({ used: user.storageUsed, limit: user.storageLimit });
          }
        }
      } catch {
        if (user?.storageUsed !== undefined && user?.storageLimit !== undefined) {
          setStorageInfo({ used: user.storageUsed, limit: user.storageLimit });
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchStorage();
  }, [user]);

  const usedGB = storageInfo ? (storageInfo.used / 1024 / 1024 / 1024) : 0;
  const limitGB = storageInfo ? (storageInfo.limit / 1024 / 1024 / 1024) : 0;
  const usedPercent = limitGB > 0 ? (usedGB / limitGB) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>💾 存储空间</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">已使用</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {usedGB > 0 ? `${usedGB.toFixed(2)} GB` : '0 GB'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">存储上限</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {limitGB > 0 ? `${limitGB.toFixed(0)} GB` : '无限制'}
              </span>
            </div>
            {limitGB > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500 dark:text-gray-400">使用率</span>
                  <span className={`font-medium ${usedPercent > 90 ? 'text-red-500' : usedPercent > 70 ? 'text-amber-500' : 'text-gray-900 dark:text-white'}`}>
                    {usedPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usedPercent > 90 ? 'bg-red-500' : usedPercent > 70 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(usedPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ==================== Main Settings Component ====================
export default function Settings() {
  const { user, logout, membership } = useAuth();
  const { theme, setTheme } = useThemeStore();
  const readerConfig = useReaderStore2();

  // TTS settings
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [ttsRate, setTtsRate] = useState<number>(1);
  const [ttsVolume, setTtsVolume] = useState<number>(1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Page turn mode (persisted)
  const [pageTurnMode, setPageTurnMode] = useState<PageTurnMode>(() => {
    return (localStorage.getItem('bookdock_page_turn_mode') as PageTurnMode) || 'swipe';
  });

  // Load saved settings
  useEffect(() => {
    // Load TTS config
    try {
      const ttsConfig = localStorage.getItem('bookdock-tts-config');
      if (ttsConfig) {
        const config = JSON.parse(ttsConfig);
        if (config.voiceId) setTtsVoice(config.voiceId);
        if (config.rate) setTtsRate(config.rate);
        if (config.volume !== undefined) setTtsVolume(config.volume);
      }
    } catch {
      // Ignore
    }

    // Load available voices
    const loadVoices = () => {
      const voices = window.speechSynthesis?.getVoices() || [];
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const handleSaveTTS = () => {
    setIsSaving(true);
    try {
      localStorage.setItem('bookdock-tts-config', JSON.stringify({
        voiceId: ttsVoice,
        rate: ttsRate,
        volume: ttsVolume,
      }));
      setSaveMessage('设置已保存');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePageTurnModeChange = (mode: PageTurnMode) => {
    setPageTurnMode(mode);
    localStorage.setItem('bookdock_page_turn_mode', mode);
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };

  const handleFontSizePreset = (preset: FontSizePreset) => {
    readerConfig.setFontSize(FONT_SIZE_PRESETS[preset].size);
  };

  const handleLineHeightPreset = (preset: LineHeightPreset) => {
    readerConfig.setLineHeight(LINE_HEIGHT_PRESETS[preset].height);
  };

  const handleReaderThemePreset = (mode: ReaderMode) => {
    readerConfig.setMode(mode);
  };

  const renderThemeOption = (
    value: 'light' | 'dark' | 'system',
    icon: string,
    label: string
  ) => (
    <button
      onClick={() => handleThemeChange(value)}
      className={`flex-1 py-3 px-4 rounded-xl flex flex-col items-center gap-2 transition-all ${
        theme === value
          ? 'bg-blue-500 text-white shadow-lg'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );

  const handleUpgrade = () => {
    alert('会员升级功能即将上线，敬请期待！');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">设置</h1>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>👤 账户信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">用户名</span>
              <span className="font-medium text-gray-900 dark:text-white">{user?.username || '未设置'}</span>
            </div>
            {user?.email && (
              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">邮箱</span>
                <span className="font-medium text-gray-900 dark:text-white">{user.email}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">会员类型</span>
              <span>
                {membership === 'premium' ? (
                  <span className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-full text-sm font-medium">
                    Premium
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                    免费用户
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600 dark:text-gray-400">注册时间</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '-'}
              </span>
            </div>
          </div>
        </CardContent>
        {membership !== 'premium' && (
          <CardFooter>
            <Button onClick={handleUpgrade} className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 border-0">
              ⭐ 升级到 Premium
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle>🎨 外观</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                主题模式
              </label>
              <div className="flex gap-3">
                {renderThemeOption('light', '☀️', '浅色')}
                {renderThemeOption('dark', '🌙', '深色')}
                {renderThemeOption('system', '💻', '跟随系统')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reader Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle>📖 阅读设置</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Page turn mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                翻页模式
              </label>
              <div className="flex gap-3">
                {(Object.entries(PAGE_TURN_PRESETS) as [PageTurnMode, typeof PAGE_TURN_PRESETS[PageTurnMode]][]).map(([mode, info]) => (
                  <button
                    key={mode}
                    onClick={() => handlePageTurnModeChange(mode)}
                    className={`flex-1 py-3 px-4 rounded-xl flex flex-col items-center gap-1 transition-all ${
                      pageTurnMode === mode
                        ? 'ring-2 ring-blue-500'
                        : ''
                    } ${
                      pageTurnMode === mode
                        ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-xl">{info.icon}</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{info.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {PAGE_TURN_PRESETS[pageTurnMode].desc}
              </p>
            </div>

            {/* Reader theme presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                阅读主题
              </label>
              <div className="flex gap-3">
                {(Object.entries(READER_THEME_PRESETS) as [ReaderMode, typeof READER_THEME_PRESETS[ReaderMode]][]).map(([mode, info]) => (
                  <button
                    key={mode}
                    onClick={() => handleReaderThemePreset(mode)}
                    className={`flex-1 py-3 px-4 rounded-xl flex flex-col items-center gap-2 transition-all ${
                      readerConfig.mode === mode
                        ? 'ring-2 ring-blue-500'
                        : ''
                    }`}
                    style={{
                      backgroundColor: info.bg,
                      color: info.text,
                    }}
                  >
                    <span className="text-2xl">{info.icon}</span>
                    <span className="text-xs font-medium">{info.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font size presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                字体大小
              </label>
              <div className="flex gap-3">
                {(Object.entries(FONT_SIZE_PRESETS) as [FontSizePreset, typeof FONT_SIZE_PRESETS[FontSizePreset]][]).map(([preset, info]) => (
                  <button
                    key={preset}
                    onClick={() => handleFontSizePreset(preset)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      readerConfig.fontSize === info.size
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {info.label}
                    <span className="block text-xs opacity-70">{info.size}px</span>
                  </button>
                ))}
              </div>
              {/* Font size slider */}
              <div className="mt-2">
                <input
                  type="range"
                  min="12"
                  max="28"
                  value={readerConfig.fontSize}
                  onChange={(e) => readerConfig.setFontSize(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>12px</span>
                  <span className="text-blue-500 font-medium">{readerConfig.fontSize}px</span>
                  <span>28px</span>
                </div>
              </div>
            </div>

            {/* Line height presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                行间距
              </label>
              <div className="flex gap-3">
                {(Object.entries(LINE_HEIGHT_PRESETS) as [LineHeightPreset, typeof LINE_HEIGHT_PRESETS[LineHeightPreset]][]).map(([preset, info]) => (
                  <button
                    key={preset}
                    onClick={() => handleLineHeightPreset(preset)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      Math.abs(readerConfig.lineHeight - info.height) < 0.05
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {info.label}
                    <span className="block text-xs opacity-70">{info.height}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2">
                <input
                  type="range"
                  min="1.2"
                  max="2.5"
                  step="0.1"
                  value={readerConfig.lineHeight}
                  onChange={(e) => readerConfig.setLineHeight(parseFloat(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>紧凑</span>
                  <span className="text-blue-500 font-medium">{readerConfig.lineHeight.toFixed(1)}</span>
                  <span>宽松</span>
                </div>
              </div>
            </div>

            {/* Font family */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                字体
              </label>
              <select
                value={readerConfig.fontFamily}
                onChange={(e) => readerConfig.setFontFamily(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Georgia, serif">衬线字体 (Georgia)</option>
                <option value="Merriweather, serif">阅读字体 (Merriweather)</option>
                <option value="system-ui, sans-serif">系统字体</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Tahoma, sans-serif">Tahoma</option>
                <option value="'Noto Serif SC', serif">思源宋体</option>
                <option value="'Noto Sans SC', sans-serif">思源黑体</option>
              </select>
            </div>

            {/* Margin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                页面边距: {readerConfig.margin}px
              </label>
              <input
                type="range"
                min="20"
                max="100"
                value={readerConfig.margin}
                onChange={(e) => readerConfig.setMargin(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => readerConfig.resetToDefaults()}
            >
              重置为默认
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TTS Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle>🔊 语音朗读设置</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              配置语音朗读（Text-to-Speech）的默认设置。您也可以在听书页面调整这些设置。
            </p>

            {/* Voice selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                选择语音
              </label>
              <select
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">默认语音</option>
                {availableVoices
                  .filter((v) => v.lang.startsWith('zh') || v.lang.startsWith('en'))
                  .map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                      {voice.localService ? ' [本地]' : ''}
                    </option>
                  ))}
              </select>
              {availableVoices.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  加载中...如果列表为空，请确保浏览器支持语音合成
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                默认语速: {ttsRate}x
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={ttsRate}
                  onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-12 text-center font-medium">{ttsRate}x</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>慢</span>
                <span>正常</span>
                <span>快</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                默认音量: {Math.round(ttsVolume * 100)}%
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ttsVolume}
                  onChange={(e) => setTtsVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500"
                />
                <span className="w-12 text-center font-medium">{Math.round(ttsVolume * 100)}%</span>
              </div>
            </div>

            {/* Test TTS */}
            <button
              onClick={() => {
                if ('speechSynthesis' in window) {
                  const utterance = new SpeechSynthesisUtterance('这是一个测试语音');
                  if (ttsVoice) {
                    const voice = availableVoices.find((v) => v.voiceURI === ttsVoice);
                    if (voice) utterance.voice = voice;
                  }
                  utterance.rate = ttsRate;
                  utterance.volume = ttsVolume;
                  window.speechSynthesis.speak(utterance);
                }
              }}
              className="text-sm text-blue-500 hover:text-blue-600 underline"
            >
              🔊 试听当前设置
            </button>

            <Button
              onClick={handleSaveTTS}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving ? '保存中...' : '保存TTS设置'}
            </Button>

            {saveMessage && (
              <p className="text-center text-green-500 text-sm">{saveMessage}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Storage Section */}
      <StorageSection />

      {/* Password Change */}
      {user && <PasswordChangeSection />}

      {/* About Section */}
      <Card>
        <CardHeader>
          <CardTitle>ℹ️ 关于</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <p>📖 BookDock 书仓</p>
            <p>版本 1.0.0</p>
            <p>专为 NAS 用户打造的电子书阅读器</p>
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="danger"
        onClick={logout}
        className="w-full"
      >
        退出登录
      </Button>
    </div>
  );
}
