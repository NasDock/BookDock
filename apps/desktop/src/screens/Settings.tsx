import React, { useEffect, useState } from 'react';
import { useDesktopStore } from '../stores/desktopStore';
import {
  loadSettings,
  saveSettings,
  openFolderDialog,
  minimizeToTray,
} from '../hooks/useDesktopCommands';

export function SettingsScreen() {
  const { settings, updateSettings, setTheme } = useDesktopStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        updateSettings(loaded);
        setLocalSettings(loaded);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(localSettings);
      updateSettings(localSettings);
      setSaveMessage('设置已保存');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      setSaveMessage('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNasPath = async () => {
    const path = await openFolderDialog();
    if (path && !localSettings.nasPaths.includes(path)) {
      setLocalSettings({
        ...localSettings,
        nasPaths: [...localSettings.nasPaths, path],
      });
    }
  };

  const handleRemoveNasPath = (path: string) => {
    setLocalSettings({
      ...localSettings,
      nasPaths: localSettings.nasPaths.filter((p) => p !== path),
    });
  };

  const handleMinimizeToTray = () => {
    minimizeToTray().catch(console.error);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">⚙️ 设置</h1>

        {/* Appearance */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            外观
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                主题
              </label>
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => {
                      setLocalSettings({ ...localSettings, theme });
                      setTheme(theme);
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      localSettings.theme === theme
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {theme === 'light' ? '☀️ 浅色' : theme === 'dark' ? '🌙 深色' : '💻 跟随系统'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                字体大小: {localSettings.fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="24"
                value={localSettings.fontSize}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    fontSize: parseInt(e.target.value),
                  })
                }
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>12px</span>
                <span>18px</span>
                <span>24px</span>
              </div>
            </div>
          </div>
        </section>

        {/* NAS Paths */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            📁 NAS/本地路径
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            添加 NAS 挂载路径或本地文件夹，BookDock 将自动扫描其中的电子书。
          </p>

          <div className="space-y-2 mb-4">
            {localSettings.nasPaths.length === 0 ? (
              <p className="text-sm text-gray-400 italic">暂无配置路径</p>
            ) : (
              localSettings.nasPaths.map((path) => (
                <div
                  key={path}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                    {path}
                  </span>
                  <button
                    onClick={() => handleRemoveNasPath(path)}
                    className="ml-2 p-1 text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            onClick={handleAddNasPath}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + 添加路径
          </button>
        </section>

        {/* TTS Settings */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            🔊 听书设置
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  自动播放
                </p>
                <p className="text-xs text-gray-500">
                  打开书籍时自动开始朗读
                </p>
              </div>
              <button
                onClick={() =>
                  setLocalSettings({
                    ...localSettings,
                    autoPlayTts: !localSettings.autoPlayTts,
                  })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  localSettings.autoPlayTts ? 'bg-blue-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                    localSettings.autoPlayTts ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                默认语速: {localSettings.ttsRate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={localSettings.ttsRate}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    ttsRate: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0.5x (慢)</span>
                <span>1x (正常)</span>
                <span>2x (快)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                默认音量: {Math.round(localSettings.ttsVolume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={localSettings.ttsVolume}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    ttsVolume: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            ⌨️ 全局快捷键
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            即使应用在后台运行，这些快捷键也可用。
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                播放/暂停听书
              </span>
              <kbd className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded text-sm font-mono">
                Ctrl+Shift+B
              </kbd>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                下一段
              </span>
              <kbd className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded text-sm font-mono">
                Ctrl+Shift+N
              </kbd>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                上一段
              </span>
              <kbd className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded text-sm font-mono">
                Ctrl+Shift+P
              </kbd>
            </div>
          </div>
        </section>

        {/* System */}
        <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            🖥️ 系统
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  开机自启
                </p>
                <p className="text-xs text-gray-500">
                  系统启动时自动运行 BookDock
                </p>
              </div>
              <button
                onClick={() => {
                  // Would integrate with autostart plugin
                  console.log('Toggle autostart');
                }}
                className="w-12 h-6 rounded-full bg-gray-300 transition-colors"
              >
                <div className="w-5 h-5 bg-white rounded-full shadow transform translate-x-0.5" />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  最小化到托盘
                </p>
                <p className="text-xs text-gray-500">
                  关闭按钮最小化到系统托盘而非退出
                </p>
              </div>
              <button
                onClick={handleMinimizeToTray}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm transition-colors"
              >
                测试托盘
              </button>
            </div>
          </div>
        </section>

        {/* Save button */}
        <div className="flex items-center justify-between">
          {saveMessage && (
            <span
              className={`text-sm ${
                saveMessage.includes('失败') ? 'text-red-500' : 'text-green-500'
              }`}
            >
              {saveMessage}
            </span>
          )}
          <div className="ml-auto">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>

        {/* About */}
        <section className="mt-8 text-center text-sm text-gray-400">
          <p>BookDock 桌面版 v0.1.0</p>
          <p className="mt-1">专为 NAS 用户设计的电子书阅读器</p>
        </section>
      </div>
    </div>
  );
}
