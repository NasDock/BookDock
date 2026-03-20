import React, { useEffect, useState } from 'react';
import { useDesktopStore } from '../stores/desktopStore';
import { useTTS, getSystemVoices } from '../hooks/useDesktopCommands';

interface Voice {
  id: string;
  name: string;
  lang: string;
  local: boolean;
}

interface TTSControlsProps {
  text?: string;
  bookId?: string;
  onClose?: () => void;
}

export const TTSControls: React.FC<TTSControlsProps> = ({ text, bookId, onClose }) => {
  const { ttsState, settings, updateSettings } = useDesktopStore();
  const { speak, pause, resume, stop, togglePlayPause } = useTTS();

  const [voices, setVoices] = useState<Voice[]>([]);
  const [currentVoice, setCurrentVoice] = useState<string>(settings.ttsVoiceId || 'zh-CN-female');
  const [rate, setRate] = useState(settings.ttsRate);
  const [volume, setVolume] = useState(settings.ttsVolume);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Load system voices
    getSystemVoices()
      .then(setVoices)
      .catch(console.error);

    // Also try to get Web Speech API voices
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        const webVoices = window.speechSynthesis.getVoices();
        if (webVoices.length > 0) {
          const converted: Voice[] = webVoices.map((v, i) => ({
            id: `web-${i}`,
            name: v.name,
            lang: v.lang,
            local: v.localService,
          }));
          setVoices((prev) => {
            const existing = new Set(prev.map((v) => v.id));
            const newVoices = converted.filter((v) => !existing.has(v.id));
            return [...prev, ...newVoices];
          });
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handlePlay = () => {
    if (text) {
      speak(text, bookId);
    }
  };

  const handleVoiceChange = (voiceId: string) => {
    setCurrentVoice(voiceId);
    updateSettings({ ttsVoiceId: voiceId });
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    updateSettings({ ttsRate: newRate });
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    updateSettings({ ttsVolume: newVolume });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Compact view */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={togglePlayPause}
          disabled={!text}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${
            ttsState.isPlaying
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          } disabled:opacity-50`}
        >
          {ttsState.isPlaying ? '⏸' : '▶'}
        </button>

        <button
          onClick={stop}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          title="停止"
        >
          ⏹
        </button>

        {/* Progress indicator */}
        <div className="flex-1">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${ttsState.progress}%` }}
            />
          </div>
        </div>

        {/* Status */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {ttsState.isPlaying ? '播放中' : ttsState.isPaused ? '已暂停' : '就绪'}
        </span>

        {/* Expand button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {isExpanded ? '▲' : '▼'}
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      {/* Expanded settings panel */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
          {/* Current text preview */}
          {ttsState.currentText && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300 italic line-clamp-2">
                "{ttsState.currentText}"
              </p>
            </div>
          )}

          {/* Voice selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              语音
            </label>
            <select
              value={currentVoice}
              onChange={(e) => handleVoiceChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Speed control */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              语速: {rate.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0.5x</span>
              <span>1x</span>
              <span>2x</span>
            </div>
          </div>

          {/* Volume control */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              音量: {Math.round(volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          {/* Quick actions */}
          <div className="flex gap-2">
            <button
              onClick={handlePlay}
              disabled={!text}
              className="flex-1 py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              🔊 开始朗读
            </button>
            <button
              onClick={() => {
                if (ttsState.isPlaying) {
                  pause();
                } else if (ttsState.isPaused) {
                  resume();
                } else {
                  handlePlay();
                }
              }}
              disabled={!text}
              className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {ttsState.isPlaying ? '⏸ 暂停' : ttsState.isPaused ? '▶ 继续' : '▶ 播放'}
            </button>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-gray-400 text-center">
            快捷键: Ctrl+Shift+B 播放/暂停 | Ctrl+Shift+N 下一段 | Ctrl+Shift+P 上一段
          </div>
        </div>
      )}
    </div>
  );
};
