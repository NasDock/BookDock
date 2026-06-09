/**
 * useTTS — React wrapper around @bookdock/tts TTSManager.
 *
 * Exposes the manager's full surface (play/pause/resume/stop/seek/jumpTo)
 * plus a `playWithOverrides` entry point so the Reader-TTS page can
 * locally switch provider/voice without mutating the global config.
 */
import {
    Paragraph,
    TTSManager,
    TTSOverrides,
    TTSProgress,
    TTSProvider,
    TTSState,
    TTSVoice,
} from '@bookdock/tts';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTTSReturn {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  error: string | null;
  progress: TTSProgress;
  voices: TTSVoice[];
  providers: TTSProvider[];
  currentProvider: string | null;
  rate: number;
  volume: number;
  play: (paragraphs: Paragraph[], startIndex?: number, overrides?: TTSOverrides) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (ratio: number) => Promise<void>;
  jumpTo: (idx: number) => Promise<void>;
  setVoice: (voiceId: string) => void;
  setRate: (rate: number) => void;
  setVolume: (v: number) => void;
  setProvider: (provider: string) => Promise<void>;
  loadVoices: (provider: string, language?: string) => Promise<void>;
}

export function useTTS(): UseTTSReturn {
  const managerRef = useRef<TTSManager | null>(null);
  if (!managerRef.current) managerRef.current = new TTSManager();
  const manager = managerRef.current;

  const [state, setState] = useState<TTSState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<TTSProgress>({
    paragraphIndex: 0,
    totalParagraphs: 0,
    paragraphProgress: 0,
    chapterProgress: 0,
    currentText: '',
    isPlaying: false,
  });
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [providers, setProviders] = useState<TTSProvider[]>([]);
  const [currentProvider, setCurrentProvider] = useState<string | null>(null);
  const [rate, setRateState] = useState(1.0);
  const [volume, setVolumeState] = useState(1.0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ps = await manager.loadProviders();
      if (cancelled) return;
      setProviders(ps);
      const defaultProvider = (ps.find((p) => p.enabled) || ps[0])?.name || 'edge';
      const vs = await manager.loadVoices(defaultProvider);
      if (cancelled) return;
      setVoices(vs);
      setCurrentProvider(manager.getVoicesProvider());
    })();
    return () => {
      cancelled = true;
      manager.stop();
    };
  }, [manager]);

  const play = useCallback(
    async (
      paragraphs: Paragraph[],
      startIndex = 0,
      overrides?: TTSOverrides,
      startOffsetMs = 0,
    ) => {
      setError(null);
      await manager.play(
        paragraphs,
        startIndex,
        {
          onStart: () => setState('playing'),
          onPause: () => setState('paused'),
          onResume: () => setState('playing'),
          onEnd: () => setState('idle'),
          onError: (e) => { setError(e.message); setState('error'); },
          onProgress: (p) => setProgress(p),
          onParagraphChange: () => { /* progress event already fires */ },
        },
        overrides,
        startOffsetMs,
      );
    },
    [manager],
  );

  const pause = useCallback(() => manager.pause(), [manager]);
  const resume = useCallback(() => manager.resume(), [manager]);
  const stop = useCallback(() => { manager.stop(); setState('idle'); }, [manager]);
  const seek = useCallback(async (ratio: number) => { await manager.seek(ratio); }, [manager]);
  const jumpTo = useCallback(async (idx: number) => { await manager.jumpTo(idx); }, [manager]);
  const setVoice = useCallback((id: string) => manager.setVoice(id), [manager]);
  const setRate = useCallback((r: number) => { setRateState(r); manager.setPlaybackRate(r); }, [manager]);
  const setVolume = useCallback((v: number) => { setVolumeState(v); manager.setVolume(v); }, [manager]);

  const setProvider = useCallback(async (provider: string) => {
    setCurrentProvider(provider);
    setVoices([]); // clear until new list arrives
    const vs = await manager.loadVoices(provider);
    setVoices(vs);
  }, [manager]);

  const loadVoices = useCallback(async (provider: string, language?: string) => {
    const vs = await manager.loadVoices(provider, language);
    setVoices(vs);
    setCurrentProvider(manager.getVoicesProvider());
  }, [manager]);

  return {
    isPlaying: state === 'playing',
    isPaused: state === 'paused',
    isLoading: state === 'loading',
    error,
    progress,
    voices,
    providers,
    currentProvider,
    rate,
    volume,
    play, pause, resume, stop, seek, jumpTo,
    setVoice, setRate, setVolume,
    setProvider, loadVoices,
  };
}
