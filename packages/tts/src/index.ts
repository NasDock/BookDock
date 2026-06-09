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
import type { BookLastReadPayload } from '@bookdock/api-client';
import {
    getApiClient,
    Paragraph,
    SynthesizeParagraphRequest,
    TtsProgressPayload,
    TTSProvider,
    TTSVoice
} from '@bookdock/api-client';

export type { Paragraph, TTSProvider, TTSVoice } from '@bookdock/api-client';

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

/** Per-call overrides (used by the reader page to switch voice/provider
 *  without mutating the global config). Empty / undefined fields fall
 *  back to `cfg`. */
export type TTSOverrides = Partial<Pick<TTSConfig, 'provider' | 'voiceId' | 'rate' | 'pitch' | 'volume'>>;

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
  /** Tracks the provider the voices list was loaded for, so we can
   *  refetch when the user switches provider. */
  private voicesProvider: string | null = null;
  private providers: TTSProvider[] = [];
  private providersLoaded = false;
  /** Per-call overrides set by the most recent play() call. */
  private activeOverrides: TTSOverrides | null = null;
  /** Last payload that was actually written to the server. Lets callers
   *  (e.g. Reader-TTS) read back the most recent server-side state
   *  for resume UI. */
  private lastSavedProgress: TtsProgressPayload | null = null;
  /** The ms offset within the current paragraph's audio where playback
   *  should resume. Set by callers via play(startOffsetMs) and
   *  consumed by playCurrent(). */
  private pendingOffsetMs = 0;

  async initialize(provider = 'edge'): Promise<void> {
    await this.loadProviders();
    await this.loadVoices(provider);
  }

  async loadProviders(): Promise<TTSProvider[]> {
    if (this.providersLoaded) return this.providers;
    try {
      const r = await this.api.getTtsProviders();
      const list = (r.success && r.data?.providers) ? r.data.providers : [];
      this.providers = list;
      this.providersLoaded = true;
    } catch {
      this.providers = [];
    }
    return this.providers;
  }

  getProviders(): TTSProvider[] { return this.providers; }

  /** Fetch the voice list for a given provider. Re-fetches if the
   *  provider differs from the last loaded one. */
  async loadVoices(provider = 'edge', language?: string): Promise<TTSVoice[]> {
    try {
      const r = await this.api.getVoices(provider, language);
      if (r.success && r.data) {
        this.voices = r.data;
        this.voicesProvider = provider;
      } else {
        this.voices = [];
        this.voicesProvider = provider;
      }
    } catch {
      this.voices = [];
    }
    return this.voices;
  }

  /** Returns the provider that the cached voices list belongs to. */
  getVoicesProvider(): string | null { return this.voicesProvider; }

  getAvailableVoices(): TTSVoice[] { return this.voices; }
  getState(): TTSState { return this.state; }
  getProgress(): TTSProgress { return this.progress; }

  setConfig(cfg: TTSConfig) { this.cfg = { ...this.cfg, ...cfg }; }
  setProvider(p: string) { this.cfg.provider = p; }
  setVoice(voiceId: string) { this.cfg.voiceId = voiceId; }

  /** Read the live configuration (bookId / provider / voice / rate /
   *  volume). Useful for callers that need the most recent values
   *  without waiting for the React effect to flush stale state
   *  into the manager. */
  getConfig(): TTSConfig { return { ...this.cfg }; }
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
    overrides?: TTSOverrides,
    startOffsetMs = 0,
  ): Promise<void> {
    if (!paragraphs.length) {
      callbacks.onError?.(new Error('No paragraphs to play'));
      return;
    }
    this.paragraphs = paragraphs;
    this.progress.totalParagraphs = paragraphs.length;
    this.cb = callbacks;
    this.currentIndex = Math.max(0, Math.min(startIndex, paragraphs.length - 1));
    this.activeOverrides = overrides || null;
    this.pendingOffsetMs = Math.max(0, startOffsetMs);
    // If the voice/provider changed, drop the cache so the new request
    // goes through with the new audio URL.
    if (overrides && (overrides.provider !== undefined || overrides.voiceId !== undefined)) {
      this.cache.forEach((c) => { try { URL.revokeObjectURL(c.url); } catch { /* ignore */ } });
      this.cache.clear();
    }
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
    this.detachAudioListeners(this.audio);
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.state = 'idle';
    this.progress.isPlaying = false;
    this.cache.forEach((c) => { try { URL.revokeObjectURL(c.url); } catch { /* ignore */ } });
    this.cache.clear();
    this.audio = null;
    this.activeOverrides = null;
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

    const eff = this._effective();

    // Split paragraph text into ≤ 2500-char chunks (server's hard cap is
    // 3000, we leave headroom for UTF-8 expansion / SSML overhead).
    const chunks = splitForTts(para.text, 2500);
    if (chunks.length === 0) {
      this.cb.onError?.(new Error('Paragraph is empty'));
      return;
    }

    this.state = 'loading';
    const audios: HTMLAudioElement[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkParaId = chunks.length > 1 ? `${para.id}#${i}` : para.id;
        let entry = this.cache.get(chunkParaId);
        if (!entry) {
          const r = await this.api.synthesizeParagraph({
            bookId: this.cfg.bookId,
            paragraphId: chunkParaId,
            text: chunk,
            provider: eff.provider,
            voice: eff.voiceId,
            rate: eff.rate,
            pitch: eff.pitch,
            volume: eff.volume,
          } as SynthesizeParagraphRequest);
          if (!r.success || !r.data) throw new Error(r.error || 'synthesize failed');
          const audio = new Audio();
          audio.preload = 'auto';
          const audioUrl = r.data.url.startsWith('http') ? r.data.url : `${this.api.serverBaseURL}${r.data.url}`;
          audio.src = audioUrl;
          audio.playbackRate = eff.rate ?? 1.0;
          audio.volume = eff.volume ?? 1.0;
          entry = { url: audioUrl, audio, loaded: false };
          this.cache.set(chunkParaId, entry);
          await new Promise<void>((resolve, reject) => {
            const onCanPlay = () => { audio.removeEventListener('canplaythrough', onCanPlay); audio.removeEventListener('error', onErr); resolve(); };
            const onErr = () => { audio.removeEventListener('canplaythrough', onCanPlay); audio.removeEventListener('error', onErr); reject(new Error('audio load failed')); };
            audio.addEventListener('canplaythrough', onCanPlay);
            audio.addEventListener('error', onErr);
            audio.load();
          });
          entry.loaded = true;
        }
        audios.push(entry.audio);
      }
    } catch (err) {
      this.state = 'error';
      this.cb.onError?.(err as Error);
      return;
    }

    this.state = 'playing';
    this.progress.isPlaying = true;
    this.cb.onStart?.();
    this.audio = audios[0];
    this.attachAudioListeners(autoAdvance);
    try {
      await this.audio.play();
      // Resume from a specific position within the first chunk's audio.
      // Used by play(startOffsetMs) when restoring server-side progress.
      if (this.pendingOffsetMs > 0) {
        const dur = this.audio.duration;
        if (Number.isFinite(dur) && dur > 0) {
          this.audio.currentTime = Math.min(this.pendingOffsetMs / 1000, dur);
        }
        this.pendingOffsetMs = 0;
      }
    } catch (err) {
      this.cb.onError?.(err as Error);
      return;
    }
    // Chain chunks: each chunk (except the last) plays the next on ended.
    // The last chunk relies on attachAudioListeners(autoAdvance) to move
    // to the next paragraph, so we must NOT add another ended listener.
    for (let i = 1; i < audios.length; i++) {
      const prev = audios[i - 1];
      const next = audios[i];
      // prev is not the last chunk, so detach its paragraph-advance listener
      // and replace with a chunk-chain listener.
      prev.removeEventListener('ended', this._onEnded);
      prev.addEventListener('ended', () => {
        this.detachAudioListeners(this.audio);
        this.audio = next;
        this.attachAudioListeners(autoAdvance);
        next.play().catch((e) => this.cb.onError?.(e as Error));
      }, { once: true });
    }

    this.prefetch(this.currentIndex + 1);
    this.persistProgress();
  }

  private _onTimeUpdate = () => {
    const audio = this.audio;
    if (!audio) return;
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

  private _onEnded = () => {
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

  private _onError = () => {
    this.state = 'error';
    this.cb.onError?.(new Error('Audio playback error'));
  };

  private attachAudioListeners(autoAdvance: boolean) {
    if (!this.audio) return;
    const audio = this.audio;
    audio.addEventListener('timeupdate', this._onTimeUpdate);
    if (autoAdvance) {
      audio.addEventListener('ended', this._onEnded);
    }
    audio.addEventListener('error', this._onError);
  }

  private detachAudioListeners(audio: HTMLAudioElement | null) {
    if (!audio) return;
    audio.removeEventListener('timeupdate', this._onTimeUpdate);
    audio.removeEventListener('ended', this._onEnded);
    audio.removeEventListener('error', this._onError);
  }

  private async prefetch(idx: number) {
    if (idx >= this.paragraphs.length) return;
    const para = this.paragraphs[idx];
    const eff = this._effective();
    try {
      const r = await this.api.synthesizeParagraph({
        bookId: this.cfg.bookId,
        paragraphId: para.id,
        text: para.text,
        provider: eff.provider,
        voice: eff.voiceId,
        rate: eff.rate,
        pitch: eff.pitch,
        volume: eff.volume,
      } as SynthesizeParagraphRequest);
      if (!r.success || !r.data) return;
      const audio = new Audio();
      audio.preload = 'auto';
      const audioUrl = r.data.url.startsWith('http') ? r.data.url : `${this.api.serverBaseURL}${r.data.url}`;
      audio.src = audioUrl;
      audio.load();
      this.cache.set(para.id, { url: audioUrl, audio, loaded: false });
    } catch {
      // Prefetch failures are non-fatal.
    }
  }

  /** Merge `cfg` with `activeOverrides` (overrides win). */
  private _effective(): TTSConfig {
    return { ...this.cfg, ...(this.activeOverrides || {}) };
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
    this.lastSavedProgress = payload;
    this.api.saveTtsProgress(payload).catch((err) => {
      console.error('[TTSManager] saveTtsProgress failed:', err);
    });
    // Mirror the latest position into the global "last listened" pointer
    // so the book detail page's "继续听书" button can deep-link straight
    // back here across devices.
    const lastRead: BookLastReadPayload = {
      bookId: payload.bookId,
      chapterIndex: payload.chapterIndex,
      paragraphIndex: payload.paragraphIndex,
      audioOffsetMs: payload.audioOffsetMs,
    };
    this.api.saveBookLastRead(lastRead).catch((err) => {
      console.error('[TTSManager] saveBookLastRead failed:', err);
    });
    // suppress unused-arg warnings; force is reserved for future use
    void force;
  }

  /** Most recent payload that the manager wrote to the server. Useful
   *  for UI to show "last saved" status / for the resume flow to read
   *  back the audioOffsetMs. */
  getLastSavedProgress(): TtsProgressPayload | null {
    return this.lastSavedProgress;
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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Split a paragraph into ≤ maxLen-character chunks for TTS.
 * Tries to break on sentence boundaries (CJK + Western punctuation),
 * falling back to hard-cuts at whitespace if a single sentence is
 * longer than maxLen.
 */
export function splitForTts(text: string, maxLen: number): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const sentenceEnd = /(?<=[.!?。！？；;])\s*/g;
  const sentences = text.split(sentenceEnd).filter(Boolean);
  const out: string[] = [];
  let buf = '';

  for (const s of sentences) {
    if (s.length > maxLen) {
      // Single sentence is too long — flush whatever we have, then
      // hard-split this monster on whitespace.
      if (buf) { out.push(buf); buf = ''; }
      let rest = s;
      while (rest.length > maxLen) {
        let cutAt = rest.lastIndexOf(' ', maxLen);
        if (cutAt <= 0) cutAt = maxLen; // no whitespace, hard cut
        out.push(rest.slice(0, cutAt));
        rest = rest.slice(cutAt).trimStart();
      }
      if (rest) {
        if (rest.length > maxLen) {
          // Last-resort hard cut
          out.push(rest.slice(0, maxLen));
          out.push(rest.slice(maxLen));
        } else {
          buf = rest;
        }
      }
      continue;
    }
    if ((buf + ' ' + s).trim().length > maxLen) {
      if (buf) out.push(buf);
      buf = s;
    } else {
      buf = buf ? buf + ' ' + s : s;
    }
  }
  if (buf) out.push(buf);
  return out;
}
