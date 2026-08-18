// [API 23+] store/ReaderStore.ets — 1:1 对齐 mobile readerStore.ts
// zustand persist → @Observed 单例 + PreferencesStore(READER_PREFS)
// 持久化键对齐 mobile 'bookdock-reader-config'
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0008;
const TAG = 'ReaderStore';

export type ReaderMode = 'light' | 'dark' | 'sepia';
export type ReadingMode = 'scroll' | 'page';
export type TextDirection = 'ltr' | 'rtl';

export interface ReaderConfig {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  margin: number;
  mode: ReaderMode;
  textDirection: TextDirection;
  readingMode: ReadingMode;
  autoSaveProgress: boolean;
  autoScrollEnabled: boolean;
  autoScrollSpeed: number; // 1-100
}

const DEFAULT_CONFIG: ReaderConfig = {
  fontSize: 18,
  fontFamily: 'System',
  lineHeight: 1.8,
  margin: 16,
  mode: 'light',
  textDirection: 'ltr',
  readingMode: 'scroll',
  autoSaveProgress: true,
  autoScrollEnabled: false,
  autoScrollSpeed: 30,
};

@Observed
export class ReaderStore {
  private static instance: ReaderStore | null = null;

  fontSize: number = DEFAULT_CONFIG.fontSize;
  fontFamily: string = DEFAULT_CONFIG.fontFamily;
  lineHeight: number = DEFAULT_CONFIG.lineHeight;
  margin: number = DEFAULT_CONFIG.margin;
  mode: ReaderMode = DEFAULT_CONFIG.mode;
  textDirection: TextDirection = DEFAULT_CONFIG.textDirection;
  readingMode: ReadingMode = DEFAULT_CONFIG.readingMode;
  autoSaveProgress: boolean = DEFAULT_CONFIG.autoSaveProgress;
  autoScrollEnabled: boolean = DEFAULT_CONFIG.autoScrollEnabled;
  autoScrollSpeed: number = DEFAULT_CONFIG.autoScrollSpeed;

  private listeners: Array<() => void> = [];

  static shared(): ReaderStore {
    if (!ReaderStore.instance) {
      ReaderStore.instance = new ReaderStore();
    }
    return ReaderStore.instance;
  }

  async load(): Promise<void> {
    try {
      const saved = await PreferencesStore.readObject<ReaderConfig>(PrefKey.READER_PREFS, DEFAULT_CONFIG);
      this.fontSize = saved.fontSize ?? DEFAULT_CONFIG.fontSize;
      this.fontFamily = saved.fontFamily ?? DEFAULT_CONFIG.fontFamily;
      this.lineHeight = saved.lineHeight ?? DEFAULT_CONFIG.lineHeight;
      this.margin = saved.margin ?? DEFAULT_CONFIG.margin;
      this.mode = saved.mode ?? DEFAULT_CONFIG.mode;
      this.textDirection = saved.textDirection ?? DEFAULT_CONFIG.textDirection;
      this.readingMode = saved.readingMode ?? DEFAULT_CONFIG.readingMode;
      this.autoSaveProgress = saved.autoSaveProgress ?? DEFAULT_CONFIG.autoSaveProgress;
      this.autoScrollEnabled = saved.autoScrollEnabled ?? DEFAULT_CONFIG.autoScrollEnabled;
      this.autoScrollSpeed = saved.autoScrollSpeed ?? DEFAULT_CONFIG.autoScrollSpeed;
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'load fail, use defaults');
    }
  }

  private async persist(): Promise<void> {
    const cfg: ReaderConfig = {
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      lineHeight: this.lineHeight,
      margin: this.margin,
      mode: this.mode,
      textDirection: this.textDirection,
      readingMode: this.readingMode,
      autoSaveProgress: this.autoSaveProgress,
      autoScrollEnabled: this.autoScrollEnabled,
      autoScrollSpeed: this.autoScrollSpeed,
    };
    await PreferencesStore.writeObject(PrefKey.READER_PREFS, cfg);
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return (): void => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    }
  }

  // ─── Actions(对齐 mobile)────────────────────────────────────

  setFontSize(size: number): void {
    this.fontSize = Math.max(12, Math.min(32, size));
    void this.persist();
  }

  setFontFamily(family: string): void {
    this.fontFamily = family;
    void this.persist();
  }

  setLineHeight(height: number): void {
    this.lineHeight = Math.max(1, Math.min(3, height));
    void this.persist();
  }

  setMargin(margin: number): void {
    this.margin = Math.max(8, Math.min(48, margin));
    void this.persist();
  }

  setMode(mode: ReaderMode): void {
    this.mode = mode;
    void this.persist();
  }

  setTextDirection(direction: TextDirection): void {
    this.textDirection = direction;
    void this.persist();
  }

  setReadingMode(mode: ReadingMode): void {
    this.readingMode = mode;
    void this.persist();
  }

  setAutoSaveProgress(autoSave: boolean): void {
    this.autoSaveProgress = autoSave;
    void this.persist();
  }

  setAutoScrollEnabled(enabled: boolean): void {
    this.autoScrollEnabled = enabled;
    void this.persist();
  }

  setAutoScrollSpeed(speed: number): void {
    this.autoScrollSpeed = Math.max(1, Math.min(100, Math.round(speed)));
    void this.persist();
  }

  resetToDefaults(): void {
    this.fontSize = DEFAULT_CONFIG.fontSize;
    this.fontFamily = DEFAULT_CONFIG.fontFamily;
    this.lineHeight = DEFAULT_CONFIG.lineHeight;
    this.margin = DEFAULT_CONFIG.margin;
    this.mode = DEFAULT_CONFIG.mode;
    this.textDirection = DEFAULT_CONFIG.textDirection;
    this.readingMode = DEFAULT_CONFIG.readingMode;
    this.autoSaveProgress = DEFAULT_CONFIG.autoSaveProgress;
    this.autoScrollEnabled = DEFAULT_CONFIG.autoScrollEnabled;
    this.autoScrollSpeed = DEFAULT_CONFIG.autoScrollSpeed;
    void this.persist();
  }

  getConfig(): ReaderConfig {
    return {
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      lineHeight: this.lineHeight,
      margin: this.margin,
      mode: this.mode,
      textDirection: this.textDirection,
      readingMode: this.readingMode,
      autoSaveProgress: this.autoSaveProgress,
      autoScrollEnabled: this.autoScrollEnabled,
      autoScrollSpeed: this.autoScrollSpeed,
    };
  }
}
