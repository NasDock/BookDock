/**
 * @bookdock/tts — paragraph-level TTS manager for the desktop app.
 *
 * Replaces the previous single-blob ServerTTS implementation. This version
 * operates on a list of paragraphs (not free text) and exposes
 * paragraph-aware seek + progress callbacks.
 *
 * Key behaviour:
 *   - On `play()`, fetches audio URL for paragraph[i], plays it.
 *   - On `ended`, automatically advances to i+1 (after prefetching it).
 *   - Prefetches the next paragraph's audio while the current one plays.
 *   - Persists progress to the server (debounced).
 *   - `seek(globalProgress)` finds the paragraph + audio offset for any
 *     0..1 position and jumps there.
 */
import {
    getApiClient,
    Paragraph,
    SynthesizeParagraphRequest,
    TtsProgressPayload,
    TTSVoice
} from '@bookdock/api-client';

export type { Paragraph, TTSVoice } from '@bookdock/api-client';

export interface TTSConfig {
  provider?: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Set by callers so progress is persisted against this book */
  bookId?: string;
  chapterIndex?: number;
}

export interface TTSProgress {
  paragraphIndex: number;
  totalParagraphs: number;
  /** 0..1, within the current paragraph audio */
  paragraphProgress: number;
  /** 0..1, across the whole chapter */
  chapterProgress: number;
  currentText: string;
  isPlaying: boolean;
}

export type TTSState = 'idle' | 'playing' | 'paused' | 'loading' | 'error';

export interface TTSEventCallbacks {
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onEnd?: () => void;
  onProgress?: (p: TTSProgress) => void;
  onParagraphChange?: (paragraphIndex: number, paragraph: Paragraph) => void;
  onError?: (err: Error) => void;
}

interface CachedAudio {
  url: string;
  audio: HTMLAudioElement;
  loaded: boolean;
}

export class TTSManager {
  private api = getApiClient();
  private cfg: TTSConfig = {};

  private paragraphs: Paragraph[] = [];
  private currentIndex = 0;
  private audio: HTMLAudioElement | null = null;
  private cache = new Map<string, CachedAudio>();
  private state: TTSState = 'idle';
  private cb: TTSEventCallbacks = {};
  private progress: TTSProgress = {
    paragraphIndex: 0,
    totalParagraphs: 0,
    paragraphProgress: 0,
    chapterProgress: 0,
    currentText: '',
    isPlaying: false,
  };
  private voices: TTSVoice[] = [];
  private lastSaveAt = 0;
  private voicesLoaded = false;

  async initialize(provider = 'edge'): Promise<void> {
    if (this.voicesLoaded) return;
    try {
      const r = await this.api.getVoices(provider);
      if (r.success && r.data) {
        this.voices = r.data;
        this.voicesLoaded = true;
      }
    } catch {
      this.voices = [];
    }
  }

  getAvailableVoices(): TTSVoice[] { return this.voices; }
  getState(): TTSState { return this.state; }
  getProgress(): TTSProgress { return this.progress; }

  setConfig(cfg: TTSConfig) { this.cfg = { ...this.cfg, ...cfg }; }
  setProvider(p: string) { this.cfg.provider = p; }
  setVoice(voiceId: string) { this.cfg.voiceId = voiceId; }
  setRate(rate: number) {
    this.cfg.rate = rate;
    if (this.audio) this.audio.playbackRate = Math.max(0.25, Math.min(4, rate));
  }
  setVolume(volume: number) {
    this.cfg.volume = volume;
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, volume));
  }
  setPlaybackRate(rate: number) { this.setRate(rate); }

  async play(
    paragraphs: Paragraph[],
    startIndex = 0,
    callbacks: TTSEventCallbacks = {},
  ): Promise<void> {
    if (!paragraphs.length) {
      callbacks.onError?.(new Error('No paragraphs to play'));
      return;
    }
    this.paragraphs = paragraphs;
    this.progress.totalParagraphs = paragraphs.length;
    this.cb = callbacks;
    this.currentIndex = Math.max(0, Math.min(startIndex, paragraphs.length - 1));
    await this.playCurrent();
  }

  resume(): void {
    if (this.state === 'paused' && this.audio) {
      this.audio.play().catch((e) => this.cb.onError?.(e as Error));
      this.state = 'playing';
      this.progress.isPlaying = true;
      this.cb.onResume?.();
    }
  }

  pause(): void {
    if (this.state === 'playing' && this.audio) {
      this.audio.pause();
      this.state = 'paused';
      this.progress.isPlaying = false;
      this.cb.onPause?.();
      this.persistProgress();
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.state = 'idle';
    this.progress.isPlaying = false;
    this.cache.forEach((c) => { try { URL.revokeObjectURL(c.url); } catch { /* ignore */ } });
    this.cache.clear();
    this.audio = null;
    this.persistProgress(true);
  }

  async seek(globalProgress: number): Promise<void> {
    if (!this.paragraphs.length) return;
    const clamped = Math.max(0, Math.min(1, globalProgress));
    const targetParaIdx = Math.floor(clamped * this.paragraphs.length);
    const fracInPara = clamped * this.paragraphs.length - targetParaIdx;
    await this.jumpTo(targetParaIdx, fracInPara);
  }

  async jumpTo(paragraphIndex: number, fracInParagraph = 0): Promise<void> {
    if (!this.paragraphs.length) return;
    const idx = Math.max(0, Math.min(paragraphIndex, this.paragraphs.length - 1));
    const wasPlaying = this.state === 'playing' || this.state === 'loading';
    if (this.audio) this.audio.pause();
    this.currentIndex = idx;
    await this.playCurrent(wasPlaying);
    if (this.audio && fracInParagraph > 0) {
      const dur = this.audio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        this.audio.currentTime = dur * fracInParagraph;
      }
    }
  }

  private async playCurrent(autoAdvance = true): Promise<void> {
    if (this.currentIndex >= this.paragraphs.length) {
      this.state = 'idle';
      this.cb.onEnd?.();
      return;
    }
    const para = this.paragraphs[this.currentIndex];
    this.progress.paragraphIndex = this.currentIndex;
    this.progress.currentText = para.text;
    this.cb.onParagraphChange?.(this.currentIndex, para);

    let entry = this.cache.get(para.id);
    if (!entry) {
      this.state = 'loading';
      try {
        const r = await this.api.synthesizeParagraph({
          bookId: this.cfg.bookId,
          paragraphId: para.id,
          text: para.text,
          provider: this.cfg.provider,
          voice: this.cfg.voiceId,
          rate: this.cfg.rate,
          pitch: this.cfg.pitch,
          volume: this.cfg.volume,
        } as SynthesizeParagraphRequest);
        if (!r.success || !r.data) throw new Error(r.error || 'synthesize failed');
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = r.data.url;
        audio.playbackRate = this.cfg.rate ?? 1.0;
        audio.volume = this.cfg.volume ?? 1.0;
        entry = { url: r.data.url, audio, loaded: false };
        this.cache.set(para.id, entry);
        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => { audio.removeEventListener('canplaythrough', onCanPlay); audio.removeEventListener('error', onErr); resolve(); };
          const onErr = () => { audio.removeEventListener('canplaythrough', onCanPlay); audio.removeEventListener('error', onErr); reject(new Error('audio load failed')); };
          audio.addEventListener('canplaythrough', onCanPlay);
          audio.addEventListener('error', onErr);
          audio.load();
        });
        entry.loaded = true;
      } catch (err) {
        this.state = 'error';
        this.cb.onError?.(err as Error);
        return;
      }
    }

    this.audio = entry.audio;
    this.attachAudioListeners(autoAdvance);
    this.state = 'playing';
    this.progress.isPlaying = true;
    this.cb.onStart?.();
    try {
      await this.audio.play();
    } catch (err) {
      this.cb.onError?.(err as Error);
      return;
    }
    this.prefetch(this.currentIndex + 1);
    this.persistProgress();
  }

  private attachAudioListeners(autoAdvance: boolean) {
    if (!this.audio) return;
    const audio = this.audio;
    audio.ontimeupdate = () => {
      const dur = audio.duration;
      const cur = audio.currentTime;
      this.progress.paragraphProgress = Number.isFinite(dur) && dur > 0 ? cur / dur : 0;
      this.progress.chapterProgress = (this.currentIndex + this.progress.paragraphProgress) / Math.max(1, this.paragraphs.length);
      this.cb.onProgress?.(this.progress);
      const now = Date.now();
      if (now - this.lastSaveAt > 5000) {
        this.lastSaveAt = now;
        this.persistProgress();
      }
    };
    audio.onended = () => {
      if (!autoAdvance) {
        this.state = 'idle';
        this.cb.onEnd?.();
        return;
      }
      this.currentIndex += 1;
      if (this.currentIndex >= this.paragraphs.length) {
        this.state = 'idle';
        this.progress.isPlaying = false;
        this.cb.onEnd?.();
        this.persistProgress(true);
        return;
      }
      this.playCurrent(true).catch((e) => this.cb.onError?.(e as Error));
    };
    audio.onerror = () => {
      this.state = 'error';
      this.cb.onError?.(new Error('Audio playback error'));
    };
  }

  private async prefetch(idx: number) {
    if (idx >= this.paragraphs.length) return;
    const para = this.paragraphs[idx];
    if (this.cache.has(para.id)) return;
    try {
      const r = await this.api.synthesizeParagraph({
        bookId: this.cfg.bookId,
        paragraphId: para.id,
        text: para.text,
        provider: this.cfg.provider,
        voice: this.cfg.voiceId,
        rate: this.cfg.rate,
        pitch: this.cfg.pitch,
        volume: this.cfg.volume,
      } as SynthesizeParagraphRequest);
      if (!r.success || !r.data) return;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = r.data.url;
      audio.load();
      this.cache.set(para.id, { url: r.data.url, audio, loaded: false });
    } catch {
      // Prefetch failures are non-fatal.
    }
  }

  private persistProgress(force = false) {
    if (!this.cfg.bookId) return;
    const payload: TtsProgressPayload = {
      bookId: this.cfg.bookId,
      chapterIndex: this.cfg.chapterIndex ?? 0,
      paragraphIndex: this.currentIndex,
      audioOffsetMs: this.audio ? Math.round(this.audio.currentTime * 1000) : 0,
      voice: this.cfg.voiceId,
      provider: this.cfg.provider,
      totalParagraphs: this.paragraphs.length,
    };
    this.api.saveTtsProgress(payload).catch(() => {
      // Persistence failures are non-fatal; just log.
    });
    // suppress unused-arg warnings; force is reserved for future use
    void force;
  }
}

let instance: TTSManager | null = null;

export function getTTSManager(): TTSManager {
  if (!instance) instance = new TTSManager();
  return instance;
}

export function initTTSManager(): TTSManager {
  instance = new TTSManager();
  return instance;
}
