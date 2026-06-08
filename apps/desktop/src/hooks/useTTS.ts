/**
 * useTTS — thin React wrapper around @bookdock/tts TTSManager.
 *
 * The manager has been refactored to operate on Paragraph[] directly,
 * so this hook exposes play(paragraphs), pause, resume, stop, seek, jumpTo.
 */
import { Paragraph, TTSManager, TTSProgress, TTSState, TTSVoice } from '@bookdock/tts';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTTSReturn {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  error: string | null;
  progress: TTSProgress;
  voices: TTSVoice[];
  rate: number;
  volume: number;
  play: (paragraphs: Paragraph[], startIndex?: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (ratio: number) => Promise<void>;
  jumpTo: (idx: number) => Promise<void>;
  setVoice: (voiceId: string) => void;
  setRate: (rate: number) => void;
  setVolume: (v: number) => void;
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
  const [rate, setRateState] = useState(1.0);
  const [volume, setVolumeState] = useState(1.0);

  useEffect(() => {
    manager.initialize('edge').then(() => setVoices(manager.getAvailableVoices()));
    return () => { manager.stop(); };
  }, [manager]);

  const play = useCallback(async (paragraphs: Paragraph[], startIndex = 0) => {
    setError(null);
    await manager.play(paragraphs, startIndex, {
      onStart: () => setState('playing'),
      onPause: () => setState('paused'),
      onResume: () => setState('playing'),
      onEnd: () => setState('idle'),
      onError: (e) => { setError(e.message); setState('error'); },
      onProgress: (p) => setProgress(p),
      onParagraphChange: () => { /* progress event already fires */ },
    });
  }, [manager]);

  const pause = useCallback(() => manager.pause(), [manager]);
  const resume = useCallback(() => manager.resume(), [manager]);
  const stop = useCallback(() => { manager.stop(); setState('idle'); }, [manager]);
  const seek = useCallback(async (ratio: number) => {
    await manager.seek(ratio);
  }, [manager]);
  const jumpTo = useCallback(async (idx: number) => {
    await manager.jumpTo(idx);
  }, [manager]);
  const setVoice = useCallback((id: string) => manager.setVoice(id), [manager]);
  const setRate = useCallback((r: number) => { setRateState(r); manager.setPlaybackRate(r); }, [manager]);
  const setVolume = useCallback((v: number) => { setVolumeState(v); manager.setVolume(v); }, [manager]);

  return {
    isPlaying: state === 'playing',
    isPaused: state === 'paused',
    isLoading: state === 'loading',
    error,
    progress,
    voices,
    rate,
    volume,
    play, pause, resume, stop, seek, jumpTo, setVoice, setRate, setVolume,
  };
}
