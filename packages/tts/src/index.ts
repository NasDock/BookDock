import { TTSVoice, getApiClient } from '@bookdock/api-client';
export type { TTSVoice } from '@bookdock/api-client';

export interface TTSConfig {
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

export interface TTSProgress {
  currentText: string;
  currentIndex: number;
  totalChunks: number;
  percentage: number;
  isPlaying: boolean;
}

export type TTSState = 'idle' | 'playing' | 'paused' | 'loading' | 'error';

export interface TTSEventCallbacks {
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onEnd?: () => void;
  onProgress?: (progress: TTSProgress) => void;
  onError?: (error: Error) => void;
}

// Server-side TTS using API
class ServerTTS {
  private audioElement: HTMLAudioElement | null = null;
  private currentBlob: Blob | null = null;
  private config: TTSConfig = {};

  async speak(
    text: string,
    config: TTSConfig = {},
    callbacks: TTSEventCallbacks = {}
  ): Promise<void> {
    this.stop();
    this.config = config;

    try {
      callbacks.onProgress?.({
        currentText: text,
        currentIndex: 0,
        totalChunks: 1,
        percentage: 0,
        isPlaying: true,
      });

      const apiClient = getApiClient();
      const voiceId = config.voiceId || 'default';
      
      const blob = await apiClient.convertToSpeech(text, voiceId);
      this.currentBlob = blob;

      const url = URL.createObjectURL(blob);
      this.audioElement = new Audio(url);

      this.audioElement.onplay = () => callbacks.onStart?.();
      this.audioElement.onpause = () => callbacks.onPause?.();
      this.audioElement.onended = () => {
        URL.revokeObjectURL(url);
        callbacks.onEnd?.();
      };
      this.audioElement.onerror = (event) => {
        const error = new Error('Audio playback error');
        callbacks.onError?.(error);
      };

      // Simulate progress updates
      const duration = this.audioElement.duration || 0;
      const updateProgress = () => {
        if (this.audioElement && !this.audioElement.paused) {
          const currentTime = this.audioElement.currentTime;
          const percentage = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
          callbacks.onProgress?.({
            currentText: text,
            currentIndex: 0,
            totalChunks: 1,
            percentage,
            isPlaying: true,
          });
          requestAnimationFrame(updateProgress);
        }
      };

      await this.audioElement.play();
      updateProgress();
    } catch (error) {
      callbacks.onError?.(error as Error);
      throw error;
    }
  }

  pause(): void {
    this.audioElement?.pause();
  }

  resume(): void {
    this.audioElement?.play();
  }

  stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    if (this.currentBlob) {
      URL.revokeObjectURL(URL.createObjectURL(this.currentBlob));
      this.currentBlob = null;
    }
  }

  isPaused(): boolean {
    return this.audioElement?.paused ?? false;
  }

  isSpeaking(): boolean {
    return this.audioElement ? !this.audioElement.paused && !this.audioElement.ended : false;
  }

  setVolume(volume: number): void {
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, volume));
    }
  }

  setPlaybackRate(rate: number): void {
    if (this.audioElement) {
      this.audioElement.playbackRate = rate;
    }
  }
}

// Unified TTS Manager
export class TTSManager {
  private serverTTS: ServerTTS;
  private serverVoices: TTSVoice[] = [];
  private currentConfig: TTSConfig = {};
  private textChunks: string[] = [];
  private currentChunkIndex: number = 0;
  private state: TTSState = 'idle';
  private callbacks: TTSEventCallbacks = {};
  private progress: TTSProgress = {
    currentText: '',
    currentIndex: 0,
    totalChunks: 0,
    percentage: 0,
    isPlaying: false,
  };

  constructor() {
    this.serverTTS = new ServerTTS();
  }

  async initialize(): Promise<void> {
    // Load server voices from backend
    try {
      const apiClient = getApiClient();
      const response = await apiClient.getVoices();
      if (response.success && response.data) {
        this.serverVoices = response.data;
      }
    } catch {
      console.log('Server TTS not available');
    }
  }

  getAvailableVoices(): TTSVoice[] {
    return this.serverVoices;
  }

  getState(): TTSState {
    return this.state;
  }

  getProgress(): TTSProgress {
    return this.progress;
  }

  async speak(
    text: string,
    config: TTSConfig = {},
    callbacks: TTSEventCallbacks = {}
  ): Promise<void> {
    this.callbacks = callbacks;
    this.currentConfig = config;
    this.state = 'loading';

    // Split text into manageable chunks
    this.textChunks = this.splitIntoChunks(text);
    this.currentChunkIndex = 0;
    this.progress.totalChunks = this.textChunks.length;

    await this.speakChunk();
  }

  private async speakChunk(): Promise<void> {
    if (this.currentChunkIndex >= this.textChunks.length) {
      this.state = 'idle';
      this.callbacks.onEnd?.();
      return;
    }

    const chunk = this.textChunks[this.currentChunkIndex];
    this.progress.currentText = chunk;
    this.progress.currentIndex = this.currentChunkIndex;
    this.progress.percentage = Math.round((this.currentChunkIndex / this.textChunks.length) * 100);
    this.progress.isPlaying = true;
    
    this.state = 'playing';
    this.callbacks.onProgress?.(this.progress);

    try {
      await this.serverTTS.speak(chunk, this.currentConfig, {
        onEnd: () => {
          this.currentChunkIndex++;
          this.speakChunk();
        },
        onError: (error) => {
          this.state = 'error';
          this.callbacks.onError?.(error);
        },
      });
    } catch (error) {
      this.state = 'error';
      this.callbacks.onError?.(error as Error);
    }
  }

  private splitIntoChunks(text: string, maxLength: number = 300): string[] {
    // Split by sentences or paragraphs for natural reading
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  pause(): void {
    this.serverTTS.pause();
    this.state = 'paused';
    this.progress.isPlaying = false;
    this.callbacks.onPause?.();
  }

  resume(): void {
    this.serverTTS.resume();
    this.state = 'playing';
    this.progress.isPlaying = true;
    this.callbacks.onResume?.();
  }

  stop(): void {
    this.serverTTS.stop();
    this.state = 'idle';
    this.progress.isPlaying = false;
    this.textChunks = [];
    this.currentChunkIndex = 0;
  }

  togglePlayPause(): void {
    if (this.state === 'playing') {
      this.pause();
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  setRate(rate: number): void {
    this.currentConfig.rate = rate;
    this.serverTTS.setPlaybackRate(rate);
  }

  setVolume(volume: number): void {
    this.currentConfig.volume = volume;
    this.serverTTS.setVolume(volume);
  }

  setVoice(voiceId: string): void {
    this.currentConfig.voiceId = voiceId;
  }
}

// Singleton instance
let ttsManagerInstance: TTSManager | null = null;

export function getTTSManager(): TTSManager {
  if (!ttsManagerInstance) {
    ttsManagerInstance = new TTSManager();
  }
  return ttsManagerInstance;
}

export function initTTSManager(): TTSManager {
  ttsManagerInstance = new TTSManager();
  return ttsManagerInstance;
}

export { ServerTTS };
