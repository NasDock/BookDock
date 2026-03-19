import React, { useState, useEffect } from 'react';
import { useAuth } from '@bookdock/auth';
import { Button, Card, CardHeader, CardTitle, CardContent, CardFooter, Input } from '@bookdock/ui';
import { useThemeStore } from '../stores/authStore';
import { useReaderStore } from '../stores/themeStore';
import type { ReaderMode } from '@bookdock/ebook-reader';

export default function Settings() {
  const { user, logout, membership } = useAuth();
  const { theme, setTheme, actualTheme } = useThemeStore();
  const readerConfig = useReaderStore();

  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [ttsRate, setTtsRate] = useState<number>(1);
  const [ttsVolume, setTtsVolume] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load saved settings
  useEffect(() => {
    const loadSettings = () => {
      try {
        const ttsConfig = localStorage.getItem('bookdock-tts-config');
        if (ttsConfig) {
          const config = JSON.parse(ttsConfig);
          if (config.voiceId) setTtsVoice(config.voiceId);
          if (config.rate) setTtsRate(config.rate);
          if (config.volume) setTtsVolume(config.volume);
        }
      } catch {
        // Ignore
      }
    };
    loadSettings();
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

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
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
              <span className="font-medium text-gray-900 dark:text-white">{user?.username}</span>
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
            <Button className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 border-0">
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
            {/* Reading mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                阅读主题
              </label>
              <div className="flex gap-3">
                {(['light', 'dark', 'sepia'] as ReaderMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => readerConfig.setMode(mode)}
                    className={`flex-1 py-3 px-4 rounded-xl flex flex-col items-center gap-2 transition-all ${
                      readerConfig.mode === mode
                        ? 'ring-2 ring-blue-500'
                        : ''
                    } ${
                      mode === 'light'
                        ? 'bg-white text-gray-800 border border-gray-200'
                        : mode === 'dark'
                        ? 'bg-gray-900 text-gray-100'
                        : 'bg-sepia-100 text-sepia-800'
                    }`}
                  >
                    <span className="text-2xl">
                      {mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '📜'}
                    </span>
                    <span className="text-xs font-medium">
                      {mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '护眼'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                字体大小: {readerConfig.fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="28"
                value={readerConfig.fontSize}
                onChange={(e) => readerConfig.setFontSize(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>小</span>
                <span>中</span>
                <span>大</span>
              </div>
            </div>

            {/* Line height */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                行间距: {readerConfig.lineHeight}
              </label>
              <input
                type="range"
                min="1.2"
                max="2.2"
                step="0.1"
                value={readerConfig.lineHeight}
                onChange={(e) => readerConfig.setLineHeight(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                默认语速
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
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                默认音量
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
      <Card>
        <CardHeader>
          <CardTitle>💾 存储空间</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">已使用</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {user?.storageUsed ? `${(user.storageUsed / 1024 / 1024 / 1024).toFixed(2)} GB` : '0 GB'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">存储上限</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {user?.storageLimit ? `${(user.storageLimit / 1024 / 1024 / 1024).toFixed(0)} GB` : '∞'}
              </span>
            </div>
            {user?.storageLimit && user?.storageUsed && (
              <div className="mt-4">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      user.storageUsed / user.storageLimit > 0.9
                        ? 'bg-red-500'
                        : user.storageUsed / user.storageLimit > 0.7
                        ? 'bg-amber-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min((user.storageUsed / user.storageLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
