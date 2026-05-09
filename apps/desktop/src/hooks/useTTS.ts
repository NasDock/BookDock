import { useEffect, useRef, useState, useCallback } from 'react';
import { getTTSManager, initTTSManager, TTSManager, TTSProgress, TTSState, TTSVoice } from '@bookdock/tts';
import { useAuthStore } from '../stores/authStore';

interface UseTTSOptions {
  autoInit?: boolean;
  defaultVoiceId?: string;
  defaultRate?: number;
  defaultVolume?: number;
}

interface UseTTSReturn {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  error: string | null;
  progress: TTSProgress;
  voices: TTSVoice[];
  currentVoice: TTSVoice | null;
  rate: number;
  volume: number;
  
  speak: (text: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  togglePlayPause: () => void;
  setVoice: (voiceId: string) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  init: () => Promise<void>;
}

// Persisted TTS settings
interface PersistedTTSConfig {
  voiceId: string | null;
  rate: number;
  volume: number;
}

const TTS_CONFIG_KEY = 'bookdock-tts-config';

function loadTTSConfig(): PersistedTTSConfig {
  try {
    const stored = localStorage.getItem(TTS_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore
  }
  return {
    voiceId: null,
    rate: 1.0,
    volume: 1.0,
  };
}

function saveTTSConfig(config: PersistedTTSConfig): void {
  try {
    localStorage.setItem(TTS_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore
  }
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const ttsManagerRef = useRef<TTSManager | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TTSProgress>({
    currentText: '',
    currentIndex: 0,
    totalChunks: 0,
    percentage: 0,
    isPlaying: false,
  });
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [currentVoice, setCurrentVoice] = useState<TTSVoice | null>(null);
  const [rate, setRateState] = useState(options.defaultRate ?? loadTTSConfig().rate);
  const [volume, setVolumeState] = useState(options.defaultVolume ?? loadTTSConfig().volume);

  // Initialize TTS manager
  const init = useCallback(async () => {
    if (ttsManagerRef.current) return;

    setIsLoading(true);
    try {
      ttsManagerRef.current = initTTSManager();
      await ttsManagerRef.current.initialize();
      
      const availableVoices = ttsManagerRef.current.getAvailableVoices();
      setVoices(availableVoices);

      // Set default or saved voice
      const savedConfig = loadTTSConfig();
      if (savedConfig.voiceId) {
        const voice = availableVoices.find((v) => v.id === savedConfig.voiceId);
        if (voice) {
          setCurrentVoice(voice);
          ttsManagerRef.current.setVoice(voice.id);
        }
      } else if (availableVoices.length > 0) {
        // Prefer Chinese voice
        const chineseVoice = availableVoices.find((v) => v.lang.startsWith('zh'));
        const voice = chineseVoice || availableVoices[0];
        setCurrentVoice(voice);
        ttsManagerRef.current.setVoice(voice.id);
      }

      setIsLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (options.autoInit !== false) {
      init();
    }
  }, [init, options.autoInit]);

  const speak = useCallback(async (text: string) => {
    if (!ttsManagerRef.current) {
      await init();
    }

    setError(null);
    setIsPlaying(true);
    setIsPaused(false);

    try {
      await ttsManagerRef.current!.speak(
        text,
        {
          voiceId: currentVoice?.id || options.defaultVoiceId || undefined,
          rate,
          volume,
        },
        {
          onStart: () => {
            setIsPlaying(true);
            setIsPaused(false);
          },
          onPause: () => {
            setIsPaused(true);
            setIsPlaying(false);
          },
          onResume: () => {
            setIsPaused(false);
            setIsPlaying(true);
          },
          onEnd: () => {
            setIsPlaying(false);
            setIsPaused(false);
            setProgress((prev) => ({ ...prev, isPlaying: false, percentage: 100 }));
          },
          onProgress: (newProgress) => {
            setProgress(newProgress);
          },
          onError: (err) => {
            setError(err.message);
            setIsPlaying(false);
            setIsPaused(false);
          },
        }
      );
    } catch (err) {
      setError((err as Error).message);
      setIsPlaying(false);
    }
  }, [currentVoice, rate, volume, init, options.defaultVoiceId]);

  const pause = useCallback(() => {
    ttsManagerRef.current?.pause();
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    ttsManagerRef.current?.resume();
    setIsPaused(false);
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    ttsManagerRef.current?.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setProgress({
      currentText: '',
      currentIndex: 0,
      totalChunks: 0,
      percentage: 0,
      isPlaying: false,
    });
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (isPaused) {
      resume();
    }
  }, [isPlaying, isPaused, pause, resume]);

  const setVoice = useCallback((voiceId: string) => {
    const voice = voices.find((v) => v.id === voiceId);
    if (voice) {
      setCurrentVoice(voice);
      ttsManagerRef.current?.setVoice(voiceId);
      
      const config = loadTTSConfig();
      saveTTSConfig({ ...config, voiceId });
    }
  }, [voices]);

  const setRate = useCallback((newRate: number) => {
    setRateState(newRate);
    ttsManagerRef.current?.setRate(newRate);
    
    const config = loadTTSConfig();
    saveTTSConfig({ ...config, rate: newRate });
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume);
    ttsManagerRef.current?.setVolume(newVolume);
    
    const config = loadTTSConfig();
    saveTTSConfig({ ...config, volume: newVolume });
  }, []);

  return {
    isPlaying,
    isPaused,
    isLoading,
    error,
    progress,
    voices,
    currentVoice,
    rate,
    volume,
    speak,
    pause,
    resume,
    stop,
    togglePlayPause,
    setVoice,
    setRate,
    setVolume,
    init,
  };
}

// Hook to sync TTS with reader content
export function useReaderTTS(bookContent: string, options?: UseTTSOptions) {
  const tts = useTTS(options);
  const [extractedText, setExtractedText] = useState('');

  // Extract plain text from HTML/markdown content
  useEffect(() => {
    if (!bookContent) {
      setExtractedText('');
      return;
    }

    // If it's already plain text
    if (!bookContent.includes('<') && !bookContent.includes('[')) {
      setExtractedText(bookContent);
      return;
    }

    // Create a temporary element to strip HTML
    const temp = document.createElement('div');
    temp.innerHTML = bookContent;
    setExtractedText(temp.textContent || temp.innerText || '');
  }, [bookContent]);

  const speakAll = useCallback(async () => {
    if (extractedText) {
      await tts.speak(extractedText);
    }
  }, [extractedText, tts.speak]);

  return {
    ...tts,
    speak: speakAll,
  };
}
