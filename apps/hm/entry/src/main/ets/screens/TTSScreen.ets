// [API 23+] screens/TTSScreen.ets — 1:1 对齐 mobile TTSScreen.tsx (2200 行)
// P1 范围:布局 / 数据流 / 交互全部对齐,播放功能 P4 阶段用 AVPlayer 实装。
//   - 封面控制视图(默认) / 段落列表视图(点封面切换,对齐 mobile toggleViewMode)
//   - 宽屏双栏布局(screenWidth > 600 时左封面右段落,对齐 mobile isWideScreen)
//   - Header:chevron-down(缩小回 MiniPlayer,先 popRoute 占位) / 切换视图 / ⋮ 更多选项
//   - 控制栏:阅读 / 上一段 / 播放暂停(isPlaying 时红色) / 下一段 / 目录
//   - 5 个 Sheet:倍速(7 档 0.5-2.0) / 定时(0,5,10,15,30,45,60) / 更多选项 / TTS设置(provider+voice) / 章节
//   - 睡眠定时倒计时(setInterval 1000ms,到期 isPlaying=false)
//   - 章节 skipEmpty:EPUB 开头空章(封面/版权页)自动跳到第一章有内容的
//   - 进度持久化:切章/退出时 saveTtsProgress + saveBookLastRead
//
// mobile → hm 关键差异:
//   1. react-native-track-player → P4 用 AVPlayer,P1 播放键只切 isPlaying + toast
//   2. mobile 用 Paragraph.id 做 chunk key;hm ApiModels.Paragraph 只有 index/text/duration
//      → List 的 keyGenerator 用 `p_${item.index}`
//   3. LinearGradient 封面降级为纯色(getBookGradientStart 取第一色,复用 BookDetailScreen 范式)
//   4. RN Modal → @Builder + Stack 全屏 overlay(对齐 ProfileScreen 范式)
//   5. Ionicons → AppIcon(emoji 全部禁用,未验证 sys.symbol 走几何字符)
//   6. mobile Paragraph 有 startOffset/endOffset 字段,hm 没有 → 进度条只按段落索引算,不按字符偏移
import { promptAction, window } from '@kit.ArkUI';
import {
  ApiResponse,
  Book,
  ChapterListItem,
  ChapterParagraphs,
  Paragraph,
  TTSProvider,
  TTSVoice,
  TtsProgressRecord,
  TtsProgressPayload,
  TtsProvidersResponse,
  BookLastReadPayload
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute, pushRoute, RouteName, BookParams } from '../router/AppRouter';
import { TTSPlayer, TTSPlayerState } from '../player/TTSPlayer';

// ─── 封面渐变底色(与 BookDetailScreen 同一函数,P2 抽到 utils)────────────
function getBookGradientStart(title: string): string {
  const gradients: string[] = [
    '#3B82F6', '#8B5CF6', '#06B6D4', '#10B981',
    '#F59E0B', '#EF4444', '#EC4899', '#6366F1'
  ];
  let hash: number = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// ─── provider 中文标签(对齐 mobile providerLabel)────────────────────────
function providerLabel(name: string): string {
  if (name === 'edge') {
    return 'Edge';
  }
  if (name === 'mi') {
    return '小米';
  }
  return name;
}

// ─── 音色名截断(对齐 mobile formatVoiceName)─────────────────────────────
function formatVoiceName(voice: TTSVoice): string {
  const name: string = voice.name || '';
  if (!name) {
    return '默认';
  }
  if (name.length > 20) {
    return name.substring(0, 18) + '...';
  }
  return name;
}

// ─── 倍速档位(对齐 mobile [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0])──────────
const SPEED_OPTIONS: number[] = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

// ─── 定时档位(对齐 mobile [0, 5, 10, 15, 30, 45, 60])──────────────────────
const TIMER_OPTIONS: number[] = [0, 5, 10, 15, 30, 45, 60];

// ─── 路由入参(cast NavPathInfo.param 用)─────────────────────────────
interface RouteTTSParams {
  book: Book;
  showChapterPicker?: boolean;
}

// ─── 视图模式(对齐 mobile viewMode)─────────────────────────────────
type ViewMode = 'controls' | 'content';

@Component
export struct TTSScreen {
  // 路由参数在 aboutToAppear 里通过 @Prop 注入,@Prop 兜底为空书
  @Prop initialBook: Book = {} as Book;
  @Prop initialShowChapterPicker: boolean = false;

  // ─── 数据 ─────────────────────────────────────────────────────
  @State private book: Book = {} as Book;
  @State private chapters: ChapterListItem[] = [];
  @State private chapterIndex: number = 0;
  @State private chapterTitle: string = '';
  @State private paragraphs: Paragraph[] = [];
  @State private currentParagraph: number = 0;
  @State private providers: TTSProvider[] = [];
  @State private voices: TTSVoice[] = [];
  @State private provider: string = 'edge';
  @State private voiceId: string = '';

  // ─── UI 状态 ──────────────────────────────────────────────────
  @State private isLoading: boolean = true;
  @State private loadError: string | null = null;
  @State private viewMode: ViewMode = 'controls';
  @State private isPlaying: boolean = false;
  @State private playbackRate: number = 1.0;

  // ─── 睡眠定时 ─────────────────────────────────────────────────
  @State private sleepMinutes: number = 0;
  @State private sleepRemaining: number = 0;
  private sleepTimerId: number = -1;

  // ─── 恢复播放偏移(对齐 mobile resumeOffsetMs)───────────────────────
  private resumeOffsetMs: number = 0;

  // ─── Sheet 显隐(5 个,对齐 mobile)───────────────────────────────
  @State private showSpeedPicker: boolean = false;
  @State private showTimerPicker: boolean = false;
  @State private showSettings: boolean = false;
  @State private showTTSConfig: boolean = false;
  @State private showChapterPicker: boolean = false;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  // ─── 状态栏安全区(对齐 ReaderScreen setupImmersive)─────────────
  @State private safeAreaTop: number = 0;
  private mainWindow: window.Window | null = null;
  private prevFullScreen: boolean = false;

  aboutToAppear(): void {
    this.applyTheme();
    void this.initSafeArea();
    this.book = this.initialBook;
    void this.loadInitialData();
  }

  private async initSafeArea(): Promise<void> {
    try {
      const win = await window.getLastWindow(getContext(this));
      this.mainWindow = win;
      // 进入前先记下原全屏状态,退出时还原
      // (当前 SDK 的 Window 没有 getWindowLayoutFullScreen getter,默认按 true 处理)
      this.prevFullScreen = true;
      // 进入全屏: 内容延伸到状态栏,这样 getWindowAvoidArea(TYPE_SYSTEM) 才能拿到真实状态栏高度
      await win.setWindowLayoutFullScreen(true);
      const avoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      this.safeAreaTop = px2vp(avoidArea.topRect.height);
    } catch {
      // 取不到安全区时保持默认 0
    }
  }

  aboutToDisappear(): void {
    this.clearSleepTimer();
    // 页面销毁时停止播放并释放 AVPlayer 资源
    void TTSPlayer.shared().release();
    // 退出全屏(对齐 ReaderScreen exitImmersive)
    if (this.mainWindow && this.prevFullScreen) {
      try {
        this.mainWindow.setWindowLayoutFullScreen(false);
      } catch {
        // 静默
      }
    }
    this.mainWindow = null;
  }

  private applyTheme(): void {
    const t: Theme = getTheme(false);
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
  }

  // ─── 初始数据加载(对齐 mobile useEffect [book.id])──────────────────
  private async loadInitialData(): Promise<void> {
    if (!this.book.id) {
      this.isLoading = false;
      this.loadError = '书籍信息缺失';
      return;
    }
    this.isLoading = true;
    this.loadError = null;
    try {
      const api = getApiClient();

      // Providers(对齐 mobile getTtsProviders)
      const provRes: ApiResponse<TtsProvidersResponse> = await api.getTtsProviders();
      if (provRes.success && provRes.data) {
        this.providers = provRes.data.providers;
        const enabledNames: string[] = this.providers
          .filter((p: TTSProvider) => p.enabled)
          .map((p: TTSProvider) => p.name);
        if (!enabledNames.includes(this.provider)) {
          this.provider = enabledNames.length > 0 ? enabledNames[0] : 'edge';
        }
      }

      // Voices(对齐 mobile getVoices(provider))
      const vRes: ApiResponse<TTSVoice[]> = await api.getVoices(this.provider);
      if (vRes.success && vRes.data) {
        this.voices = vRes.data;
        if (!this.voiceId && this.voices.length > 0) {
          this.voiceId = this.voices[0].id;
        }
      }

      // Chapters(对齐 mobile getChapters)
      const chRes: ApiResponse<ChapterListItem[]> = await api.getChapters(this.book.id);
      if (!chRes.success || !chRes.data || chRes.data.length === 0) {
        this.loadError = '本书暂无章节内容，请先解析章节。';
        this.isLoading = false;
        return;
      }
      this.chapters = chRes.data;

      // Load first chapter(skipEmpty: true 自动跳过空章)
      await this.loadChapter(0, true);

      // 路由参数 showChapterPicker:从 Reader 跳过来时自动开章节选择(对齐 mobile line 331-335)
      if (this.initialShowChapterPicker && this.chapters.length > 0) {
        this.showChapterPicker = true;
      }
    } catch (err) {
      this.loadError = (err as Error)?.message ?? '加载失败';
    } finally {
      this.isLoading = false;
    }
  }

  // ─── 拉取指定章的段落(对齐 mobile loadChapter,支持 skipEmpty)─────────
  private async loadChapter(ci: number, skipEmpty: boolean = false): Promise<void> {
    if (!this.book.id) {
      return;
    }
    try {
      const api = getApiClient();
      let effectiveCi: number = ci;
      let pRes: ApiResponse<ChapterParagraphs> = await api.getChapterParagraphs(this.book.id, ci);

      // skipEmpty:EPUB 开头空章(封面/版权页)自动跳到第一章有内容的
      if (skipEmpty && (!pRes.success || !pRes.data || pRes.data.paragraphs.length === 0) && this.chapters.length > 1) {
        for (let i: number = ci + 1; i < this.chapters.length; i++) {
          const tryRes: ApiResponse<ChapterParagraphs> = await api.getChapterParagraphs(this.book.id, i);
          if (tryRes.success && tryRes.data && tryRes.data.paragraphs.length > 0) {
            effectiveCi = i;
            pRes = tryRes;
            break;
          }
        }
      }

      if (!pRes.success || !pRes.data) {
        this.loadError = '加载章节失败';
        return;
      }

      this.chapterIndex = effectiveCi;
      // ChapterParagraphs 没有 title 字段,从 chapters 数组取(对齐 mobile setChapterTitle)
      this.chapterTitle = this.chapters[effectiveCi]?.title ?? `第 ${effectiveCi + 1} 章`;
      this.paragraphs = pRes.data.paragraphs;
      this.currentParagraph = 0;

      // Resume from saved cloud progress(对齐 mobile getTtsProgress(bookId, chapterIndex))
      try {
        const prog: ApiResponse<TtsProgressRecord | TtsProgressRecord[] | null> =
          await api.getTtsProgress(this.book.id, effectiveCi);
        if (prog.success && prog.data && !Array.isArray(prog.data)) {
          const rec: TtsProgressRecord = prog.data as TtsProgressRecord;
          if (rec.currentProvider) {
            this.provider = rec.currentProvider;
          }
          if (rec.currentVoice) {
            this.voiceId = rec.currentVoice;
          }
          if (rec.currentRate) {
            this.playbackRate = rec.currentRate;
          }
          this.currentParagraph = Math.min(rec.paragraphIndex ?? 0, this.paragraphs.length - 1);
          // 恢复段内偏移(对齐 mobile setResumeOffsetMs(rec.audioOffsetMs))
          this.resumeOffsetMs = rec.audioOffsetMs ?? 0;
        }
      } catch {
        // 进度恢复失败静默,从 0 开始
      }
    } catch (err) {
      this.loadError = (err as Error)?.message ?? '加载章节失败';
    }
  }

  // ─── 播放/暂停(接 TTSPlayer)──────────────────────────────────────
  private async handlePlayPause(): Promise<void> {
    const player: TTSPlayer = TTSPlayer.shared();
    if (this.isPlaying) {
      // 播放中 → 暂停 + 持久化进度
      await player.pause();
      this.isPlaying = false;
      void this.persistProgress(this.currentParagraph, player.positionMs);
      return;
    }
    // 已暂停 → 继续播
    if (player.state === TTSPlayerState.PAUSED) {
      await player.play();
      this.isPlaying = true;
      return;
    }
    // 空闲 → 从头播当前段
    if (this.paragraphs.length === 0) {
      promptAction.showToast({ message: '暂无内容可朗读', duration: 1500 });
      return;
    }
    await this.playParagraph(this.currentParagraph);
  }

  // ─── 播放指定段落(对齐 mobile playParagraph)────────────────────────
  private async playParagraph(idx: number): Promise<void> {
    if (idx < 0 || idx >= this.paragraphs.length) {
      this.currentParagraph = 0;
      this.isPlaying = false;
      return;
    }
    this.currentParagraph = idx;
    const startOffset: number = this.resumeOffsetMs;
    this.resumeOffsetMs = 0;
    const player: TTSPlayer = TTSPlayer.shared();
    // 注册回调(每次播放前重新注册，防止闭包旧值)
    player.onProgressUpdate = (positionMs: number, durationMs: number): void => {
      // paragraphProgress = 当前段内播放进度 / 段总时长(用于 persistProgress 第二参数)
      // 简化:直接用 positionMs 作为 positionMs 持久化
    };
    player.onParagraphChange = (newIndex: number): void => {
      // AVPlayer 播完当前段自动切下一段时回调
      this.currentParagraph = newIndex;
      void this.persistProgress(newIndex, 0);
      // 预取下一段
      const nextIdx: number = newIndex + 1;
      if (nextIdx < this.paragraphs.length) {
        void player.prefetchParagraph(this.paragraphs, nextIdx, this.book.id, this.provider, this.voiceId);
      }
    };
    player.onStateChange = (state: TTSPlayerState, errorMsg?: string): void => {
      if (state === TTSPlayerState.PLAYING) {
        this.isPlaying = true;
      } else if (state === TTSPlayerState.PAUSED || state === TTSPlayerState.IDLE) {
        this.isPlaying = false;
      } else if (state === TTSPlayerState.ERROR) {
        this.isPlaying = false;
        promptAction.showToast({ message: errorMsg ?? '播放出错', duration: 2000 });
      }
    };

    const ok: boolean = await player.playParagraphs(
      this.paragraphs,
      idx,
      this.book.id,
      this.provider,
      this.voiceId,
      startOffset,
      this.book.title ?? '',
      this.chapterTitle,
      this.book.coverUrl ?? ''
    );
    if (!ok) {
      this.isPlaying = false;
    }
  }

  // ─── 上一段/下一段(对齐 mobile handleSkipBack/handleSkipForward)─────
  private handleSkipBack(): void {
    this.handleJumpToParagraph(Math.max(0, this.currentParagraph - 1));
  }

  private handleSkipForward(): void {
    this.handleJumpToParagraph(Math.min(this.paragraphs.length - 1, this.currentParagraph + 1));
  }

  // ─── 跳段(对齐 mobile handleJumpToParagraph)───────────────────────
  private handleJumpToParagraph(idx: number): void {
    if (idx < 0 || idx >= this.paragraphs.length) {
      return;
    }
    const player: TTSPlayer = TTSPlayer.shared();
    if (this.isPlaying || player.state === TTSPlayerState.PAUSED) {
      // 播放中或已暂停 → 停止当前并播新段
      void player.stop();
      void this.playParagraph(idx);
    } else {
      // 空闲 → 只切索引 + 持久化
      this.currentParagraph = idx;
      void this.persistProgress(idx);
    }
  }

  // ─── 切章(对齐 mobile handleChapterChange)─────────────────────────
  private async handleChapterChange(ci: number): Promise<void> {
    if (ci === this.chapterIndex) {
      return;
    }
    // 停止播放并清空队列(对齐 mobile TrackPlayer.pause + reset)
    const player: TTSPlayer = TTSPlayer.shared();
    await player.stop();
    player.clearPrefetchCache();
    this.isPlaying = false;
    this.showChapterPicker = false;
    await this.loadChapter(ci, false);
  }

  // ─── 倍速切换(对齐 mobile handleRateChange)─────────────────────────
  private async handleRateChange(r: number): Promise<void> {
    this.playbackRate = Math.max(0.5, Math.min(2.0, r));
    this.showSpeedPicker = false;
    // 同步到播放器(对齐 mobile TrackPlayer.setRate)
    await TTSPlayer.shared().setPlaybackSpeed(this.playbackRate);
  }

  // ─── 定时切换(对齐 mobile handleSleepTimerSet)──────────────────────
  private handleSleepTimerSet(minutes: number): void {
    this.sleepMinutes = minutes;
    this.showTimerPicker = false;
    this.clearSleepTimer();

    if (minutes === 0) {
      promptAction.showToast({ message: '已取消睡眠定时', duration: 1500 });
      return;
    }

    promptAction.showToast({ message: `${minutes} 分钟后将暂停播放`, duration: 1500 });
    this.sleepRemaining = minutes * 60;
    this.sleepTimerId = setInterval((): void => {
      this.sleepRemaining = this.sleepRemaining - 1;
      if (this.sleepRemaining <= 0) {
        // 真正暂停播放器(对齐 mobile TrackPlayer.pause)
        void TTSPlayer.shared().pause();
        this.isPlaying = false;
        this.sleepMinutes = 0;
        this.sleepRemaining = 0;
        this.clearSleepTimer();
        promptAction.showToast({ message: '睡眠定时已到，已暂停播放', duration: 2000 });
      }
    }, 1000);
  }

  private clearSleepTimer(): void {
    if (this.sleepTimerId >= 0) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = -1;
    }
  }

  // ─── 进度持久化(对齐 mobile persistProgress,positionMs 为段内毫秒偏移)────
  private async persistProgress(idx: number, positionMs: number = 0): Promise<void> {
    if (!this.book.id) {
      return;
    }
    try {
      const api = getApiClient();
      const ttsPayload: TtsProgressPayload = {
        bookId: this.book.id,
        chapterIndex: this.chapterIndex,
        paragraphIndex: idx,
        audioOffsetMs: positionMs,
        currentProvider: this.provider,
        currentVoice: this.voiceId,
        currentRate: this.playbackRate
      };
      const lastReadPayload: BookLastReadPayload = {
        bookId: this.book.id,
        chapterIndex: this.chapterIndex,
        paragraphIndex: idx,
        audioOffsetMs: positionMs
      };
      await Promise.all([
        api.saveTtsProgress(ttsPayload),
        api.saveBookLastRead(lastReadPayload)
      ]);
    } catch {
      // 静默失败
    }
  }

  // ─── 视图切换(对齐 mobile toggleViewMode)─────────────────────────
  private toggleViewMode(): void {
    this.viewMode = this.viewMode === 'controls' ? 'content' : 'controls';
  }

  // ─── 跳阅读器(对齐 mobile handleReadBook)─────────────────────────
  private handleReadBook(): void {
    const p: BookParams = { book: this.book };
    pushRoute(RouteName.READER, p);
  }

  // ─── 返回(对齐 mobile handleMinimize)──────────────────────────────
  private handleMinimize(): void {
    // P4 阶段:ttsStore.setMiniPlayerVisible(true)
    popRoute();
  }

  // ─── 进度百分比(对齐 mobile overallProgress)────────────────────────
  private overallProgress(): number {
    if (this.paragraphs.length === 0) {
      return 0;
    }
    return this.currentParagraph / this.paragraphs.length;
  }

  // ─── 当前音色显示名(更多选项 Sheet 用)──────────────────────────────
  private currentVoiceName(): string {
    const v: TTSVoice | undefined = this.voices.find((item: TTSVoice) => item.id === this.voiceId);
    return v ? formatVoiceName(v) : '默认';
  }

  build() {
    Stack() {
      Column() {
        // ─── Header(对齐 mobile renderHeader)─────────────────────────
        Row() {
          // 左侧:chevron-down(缩小回 MiniPlayer)
          Row() {
            AppIcon({ kind: AppIconKind.ChevronDown, iconSize: 28, iconColor: this.themeText })
          }
          .width(48)
          .height(48)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.handleMinimize();
          })

          // 中间:切换视图图标(controls 时显示文档,content 时显示图片)
          Row() {
            AppIcon({
              kind: this.viewMode === 'controls' ? AppIconKind.DocText : AppIconKind.Book,
              iconSize: 22,
              iconColor: this.themeText
            })
          }
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.toggleViewMode();
          })

          // 右侧:⋮ 更多选项
          Row() {
            AppIcon({ kind: AppIconKind.MoreVertical, iconSize: 22, iconColor: this.themeText })
          }
          .width(48)
          .height(48)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.showSettings = true;
          })
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, top: this.safeAreaTop + spacing.sm, bottom: spacing.sm })
        .backgroundColor(this.themeBg)
        .alignItems(VerticalAlign.Center)

        // ─── 主体 ───────────────────────────────────────────────
        if (this.isLoading) {
          this.LoadingView()
        } else if (this.loadError || this.paragraphs.length === 0) {
          this.ErrorView()
        } else if (this.viewMode === 'controls') {
          this.ControlsView()
        } else {
          this.ContentView()
        }
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.themeBg)

      // ─── 5 个 Sheet(全屏 Stack overlay)───────────────────────────
      if (this.showSpeedPicker) {
        this.SpeedPickerSheet()
      }
      if (this.showTimerPicker) {
        this.TimerPickerSheet()
      }
      if (this.showSettings) {
        this.SettingsSheet()
      }
      if (this.showTTSConfig) {
        this.TTSConfigSheet()
      }
      if (this.showChapterPicker) {
        this.ChapterPickerSheet()
      }
    }
    .width('100%')
    .height('100%')
  }

  // ─── Loading 视图(对齐 mobile loading)──────────────────────────────
  @Builder
  private LoadingView() {
    Column() {
      LoadingProgress()
        .width(48)
        .height(48)
        .color(this.themePrimary)
      Text('加载听书内容…')
        .fontSize(fontSizes.sm)
        .fontColor(this.themeTextSec)
        .margin({ top: spacing.md })
    }
    .width('100%')
    .layoutWeight(1)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  // ─── Error 视图(对齐 mobile loadError)──────────────────────────────
  @Builder
  private ErrorView() {
    Column() {
      AppIcon({ kind: AppIconKind.Close, iconSize: 48, iconColor: this.themeError })
      Text(this.loadError ?? '无法加载内容')
        .fontSize(fontSizes.md)
        .fontColor(this.themeError)
        .textAlign(TextAlign.Center)
        .margin({ top: spacing.md })
      Text('返回')
        .fontSize(fontSizes.md)
        .fontColor('#FFFFFF')
        .fontWeight(FontWeight.Medium)
        .padding({
          left: spacing.lg,
          right: spacing.lg,
          top: spacing.sm,
          bottom: spacing.sm
        })
        .backgroundColor(this.themePrimary)
        .borderRadius(borderRadius.md)
        .margin({ top: spacing.lg })
        .onClick((): void => {
          this.handleMinimize();
        })
    }
    .width('100%')
    .layoutWeight(1)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  // ─── 封面(160x224,对齐 mobile bookCoverLarge;点按切视图)─────────────
  @Builder
  private Cover() {
    Stack() {
      if (this.book.coverUrl) {
        Image(getApiClient().toAbsoluteUrl(this.book.coverUrl))
          .width(160)
          .height(224)
          .objectFit(ImageFit.Cover)
          .borderRadius(borderRadius.xl)
      } else {
        Column() {
          Text((this.book.title || '?').charAt(0))
            .fontSize(52)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themePrimary)
        }
        .width(160)
        .height(224)
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.xl)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      }

      // 睡眠角标(对齐 mobile sleepBadge)
      if (this.sleepMinutes > 0) {
        Row() {
          Text('◐')
            .fontSize(12)
            .fontColor('#FFFFFF')
          Text(`${Math.floor(this.sleepRemaining / 60)}m`)
            .fontSize(fontSizes.xs)
            .fontColor('#FFFFFF')
            .fontWeight(FontWeight.Medium)
            .margin({ left: spacing.xs })
        }
        .padding({ left: spacing.sm, right: spacing.sm, top: spacing.xs, bottom: spacing.xs })
        .backgroundColor(this.themePrimary)
        .borderRadius(borderRadius.full)
        .offset({ x: 40, y: -110 })
      }
    }
    .width(160)
    .height(224)
    .onClick((): void => {
      this.toggleViewMode();
    })
  }

  // ─── 章节信息(对齐 mobile renderChapterInfo)──────────────────────────
  @Builder
  private ChapterInfo() {
    Text(this.book.title || '未知书籍')
      .fontSize(fontSizes.xl)
      .fontWeight(FontWeight.Medium)
      .fontColor(this.themeText)
      .textAlign(TextAlign.Center)
      .maxLines(2)
      .textOverflow({ overflow: TextOverflow.Ellipsis })
      .margin({ top: spacing.lg, bottom: spacing.xs })
  }

  // ─── 简介(对齐 mobile renderDescription)─────────────────────────────
  @Builder
  private Description() {
    if (this.book.description) {
      Column() {
        Text('简介')
          .fontSize(fontSizes.sm)
          .fontColor(this.themeTextSec)
          .margin({ bottom: spacing.xs })
        Text(this.book.description)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeText)
          .lineHeight(fontSizes.sm * 1.6)
          .maxLines(6)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .margin({ top: spacing.lg })
      .alignItems(HorizontalAlign.Start)
    }
  }

  // ─── 进度条(对齐 mobile renderProgress)──────────────────────────────
  @Builder
  private ProgressSection() {
    Column() {
      Row() {
        Text(this.chapterTitle)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeTextSec)
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(`${Math.round(this.overallProgress() * 100)}%`)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeTextSec)
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceBetween)
      .margin({ bottom: spacing.xs })

      // 进度条(6px 高,圆角 3,Stack 显式 TopStart 让彩色条从左往右走)
      Stack({ alignContent: Alignment.TopStart }) {
        Column()
          .width('100%')
          .height(6)
          .backgroundColor(this.themeBorder + '40')
          .borderRadius(3)
        Column()
          .width(`${this.overallProgress() * 100}%`)
          .height(6)
          .backgroundColor(this.themePrimary)
          .borderRadius(3)
      }
      .width('100%')
      .height(6)
    }
    .width('100%')
    .margin({ bottom: spacing.lg })
  }

  // ─── 控制栏(对齐 mobile renderControls)──────────────────────────────
  @Builder
  private ControlsRow() {
    Row() {
      // 阅读
      Column() {
        AppIcon({ kind: AppIconKind.ReadBook, iconSize: 20, iconColor: this.themeText })
      }
      .width(44)
      .height(44)
      .borderRadius(22)
      .backgroundColor(this.themeSurface)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .onClick((): void => {
        this.handleReadBook();
      })

      // 上一段
      Column() {
        AppIcon({ kind: AppIconKind.ArrowBack, iconSize: 22, iconColor: this.themeText })
      }
      .width(44)
      .height(44)
      .borderRadius(22)
      .backgroundColor(this.themeSurface)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .onClick((): void => {
        this.handleSkipBack();
      })

      // 播放/暂停(isPlaying 时红色,对齐 mobile)
      Column() {
        AppIcon({
          kind: this.isPlaying ? AppIconKind.Pause : AppIconKind.Play,
          iconSize: 32,
          iconColor: '#FFFFFF'
        })
      }
      .width(72)
      .height(72)
      .borderRadius(36)
      .backgroundColor(this.isPlaying ? this.themeError : this.themePrimary)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .onClick((): void => {
        void this.handlePlayPause();
      })

      // 下一段
      Column() {
        AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 22, iconColor: this.themeText })
      }
      .width(44)
      .height(44)
      .borderRadius(22)
      .backgroundColor(this.themeSurface)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .onClick((): void => {
        this.handleSkipForward();
      })

      // 目录
      Column() {
        AppIcon({ kind: AppIconKind.Menu, iconSize: 20, iconColor: this.themeText })
      }
      .width(44)
      .height(44)
      .borderRadius(22)
      .backgroundColor(this.themeSurface)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .onClick((): void => {
        this.showChapterPicker = true;
      })
    }
    .width('100%')
    .padding({ left: spacing.md, right: spacing.md })
    .justifyContent(FlexAlign.SpaceEvenly)
    .alignItems(VerticalAlign.Center)
  }

  // ─── 底部固定栏(对齐 mobile renderBottomBar)─────────────────────────
  @Builder
  private BottomBar() {
    Column() {
      this.ProgressSection()
      this.ControlsRow()
    }
    .width('100%')
    .padding({ left: spacing.lg, right: spacing.lg, top: spacing.sm, bottom: 20 })
    .backgroundColor(this.themeBg)
  }

  // ─── 视图 1:封面控制视图(对齐 mobile viewMode === 'controls')─────────
  @Builder
  private ControlsView() {
    Column() {
      Scroll() {
        Column() {
          this.Cover()
          this.ChapterInfo()
          this.Description()
        }
        .width('100%')
        .padding({
          left: spacing.lg,
          right: spacing.lg,
          top: spacing.sm,
          bottom: spacing.xxl
        })
        .alignItems(HorizontalAlign.Center)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.Top)

      this.BottomBar()
    }
    .width('100%')
    .layoutWeight(1)
  }

  // ─── 视图 2:段落列表视图(对齐 mobile viewMode === 'content')──────────
  @Builder
  private ContentView() {
    Column() {
      // 段落列表(对齐 mobile renderParagraphList)
      List() {
        ForEach(this.paragraphs, (item: Paragraph, index: number) => {
          ListItem() {
            Column() {
              Text(item.text)
                .fontSize(fontSizes.md)
                .fontColor(
                  index === this.currentParagraph
                    ? this.themeText
                    : index < this.currentParagraph
                      ? this.themeTextSec
                      : this.themeText
                )
                .fontWeight(index === this.currentParagraph ? FontWeight.Medium : FontWeight.Normal)
                .opacity(index < this.currentParagraph ? 0.55 : 1)
                .lineHeight(fontSizes.md * 1.5)
            }
            .width('100%')
            .padding({
              left: spacing.sm,
              right: spacing.sm,
              top: spacing.sm,
              bottom: spacing.sm
            })
            .backgroundColor(
              index === this.currentParagraph
                ? this.themePrimary + '25'
                : this.themeBg
            )
            .borderRadius(borderRadius.sm)
            .onClick((): void => {
              this.handleJumpToParagraph(index);
            })
          }
        }, (item: Paragraph): string => `p_${item.index}`)
      }
      .width('100%')
      .layoutWeight(1)
      .padding(spacing.md)
      .scrollBar(BarState.Off)

      this.BottomBar()
    }
    .width('100%')
    .layoutWeight(1)
  }

  // ─── Sheet 1:倍速选择(对齐 mobile Speed Picker Modal)─────────────────
  @Builder
  private SpeedPickerSheet() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showSpeedPicker = false;
        })

      Column() {
        Column()
          .width(40)
          .height(4)
          .backgroundColor('rgba(150,150,150,0.3)')
          .borderRadius(2)
          .margin({ top: spacing.xs, bottom: spacing.md })

        Row() {
          Text('倍速')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
          AppIcon({ kind: AppIconKind.Close, iconSize: 24, iconColor: this.themeText })
            .onClick((): void => {
              this.showSpeedPicker = false;
            })
        }
        .width('100%')
        .margin({ bottom: spacing.md })

        Column({ space: spacing.sm }) {
          ForEach(SPEED_OPTIONS, (rate: number) => {
            Text(`${rate}x`)
              .fontSize(fontSizes.md)
              .fontColor(this.playbackRate === rate ? '#FFFFFF' : this.themeText)
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding({ top: spacing.md, bottom: spacing.md })
              .backgroundColor(this.playbackRate === rate ? this.themePrimary : this.themeBg)
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                void this.handleRateChange(rate);
              })
          }, (rate: number): string => `speed_${rate}`)
        }
        .width('100%')
      }
      .width('100%')
      .backgroundColor(this.themeSurface)
      .borderRadius({ topLeft: 20, topRight: 20 })
      .padding({ left: spacing.lg, right: spacing.lg, bottom: spacing.xl })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.End)
  }

  // ─── Sheet 2:定时选择(对齐 mobile Timer Picker Modal)─────────────────
  @Builder
  private TimerPickerSheet() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showTimerPicker = false;
        })

      Column() {
        Column()
          .width(40)
          .height(4)
          .backgroundColor('rgba(150,150,150,0.3)')
          .borderRadius(2)
          .margin({ top: spacing.xs, bottom: spacing.md })

        Row() {
          Text('定时关闭')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
          AppIcon({ kind: AppIconKind.Close, iconSize: 24, iconColor: this.themeText })
            .onClick((): void => {
              this.showTimerPicker = false;
            })
        }
        .width('100%')
        .margin({ bottom: spacing.md })

        Column({ space: spacing.sm }) {
          ForEach(TIMER_OPTIONS, (minutes: number) => {
            Text(minutes === 0 ? '关闭' : `${minutes} 分钟`)
              .fontSize(fontSizes.md)
              .fontColor(this.sleepMinutes === minutes ? '#FFFFFF' : this.themeText)
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding({ top: spacing.md, bottom: spacing.md })
              .backgroundColor(this.sleepMinutes === minutes ? this.themePrimary : this.themeBg)
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.handleSleepTimerSet(minutes);
              })
          }, (minutes: number): string => `timer_${minutes}`)
        }
        .width('100%')
      }
      .width('100%')
      .backgroundColor(this.themeSurface)
      .borderRadius({ topLeft: 20, topRight: 20 })
      .padding({ left: spacing.lg, right: spacing.lg, bottom: spacing.xl })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.End)
  }

  // ─── Sheet 3:更多选项(对齐 mobile Settings Bottom Sheet)──────────────
  @Builder
  private SettingsSheet() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showSettings = false;
        })

      Column() {
        Column()
          .width(40)
          .height(4)
          .backgroundColor('rgba(150,150,150,0.3)')
          .borderRadius(2)
          .margin({ top: spacing.xs, bottom: spacing.md })

        Text('更多选项')
          .fontSize(fontSizes.xl)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .textAlign(TextAlign.Center)
          .width('100%')
          .margin({ bottom: spacing.lg })

        // 播放倍速
        Row() {
          AppIcon({ kind: AppIconKind.Refresh, iconSize: 22, iconColor: this.themeText })
          Text('播放倍速')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .margin({ left: spacing.md })
          Text(`${this.playbackRate.toFixed(1)}x`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .margin({ right: spacing.xs })
          AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 18, iconColor: this.themeTextSec })
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)
        .onClick((): void => {
          this.showSettings = false;
          this.showSpeedPicker = true;
        })

        // 定时关闭
        Row() {
          AppIcon({ kind: AppIconKind.Close, iconSize: 22, iconColor: this.themeText })
          Text('定时关闭')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .margin({ left: spacing.md })
          Text(this.sleepMinutes > 0 ? `${this.sleepMinutes}分钟` : '关闭')
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .margin({ right: spacing.xs })
          AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 18, iconColor: this.themeTextSec })
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)
        .onClick((): void => {
          this.showSettings = false;
          this.showTimerPicker = true;
        })

        // TTS 设置
        Row() {
          AppIcon({ kind: AppIconKind.Settings, iconSize: 22, iconColor: this.themeText })
          Text('TTS 设置')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .margin({ left: spacing.md })
          Text(`${providerLabel(this.provider)} · ${this.currentVoiceName()}`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .margin({ right: spacing.xs })
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 18, iconColor: this.themeTextSec })
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)
        .onClick((): void => {
          this.showSettings = false;
          this.showTTSConfig = true;
        })

        // 分隔线
        Column()
          .width('100%')
          .height(1)
          .backgroundColor(this.themeBorder + '40')
          .margin({ top: spacing.sm, bottom: spacing.sm })
      }
      .width('100%')
      .backgroundColor(this.themeSurface)
      .borderRadius({ topLeft: 20, topRight: 20 })
      .padding({ left: spacing.lg, right: spacing.lg, bottom: spacing.xl })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.End)
  }

  // ─── Sheet 4:TTS 设置(对齐 mobile TTS Config Modal)───────────────────
  @Builder
  private TTSConfigSheet() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showTTSConfig = false;
        })

      Column() {
        Column()
          .width(40)
          .height(4)
          .backgroundColor('rgba(150,150,150,0.3)')
          .borderRadius(2)
          .margin({ top: spacing.xs, bottom: spacing.md })

        Text('TTS 设置')
          .fontSize(fontSizes.xl)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .textAlign(TextAlign.Center)
          .width('100%')
          .margin({ bottom: spacing.lg })

        Scroll() {
          Column() {
            // TTS 服务商
            Text('TTS 服务商')
              .fontSize(fontSizes.sm)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeTextSec)
              .margin({ top: spacing.md, bottom: spacing.xs })
              .width('100%')

            Flex({ wrap: FlexWrap.Wrap }) {
              ForEach(this.providers, (p: TTSProvider) => {
                Text(providerLabel(p.name))
                  .fontSize(fontSizes.sm)
                  .fontColor(this.provider === p.name ? '#FFFFFF' : this.themeText)
                  .padding({ left: spacing.md, right: spacing.md, top: spacing.xs, bottom: spacing.xs })
                  .backgroundColor(this.provider === p.name ? this.themePrimary : this.themeBg)
                  .borderRadius(borderRadius.md)
                  .opacity(p.enabled ? 1 : 0.4)
                  .margin({ right: spacing.xs, bottom: spacing.xs })
                  .onClick((): void => {
                    if (p.enabled) {
                      this.provider = p.name;
                      // Reload voices for new provider
                      void this.reloadVoices();
                    }
                  })
              }, (p: TTSProvider): string => p.name)
            }
            .width('100%')

            // 音色
            Text('音色')
              .fontSize(fontSizes.sm)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeTextSec)
              .margin({ top: spacing.md, bottom: spacing.xs })
              .width('100%')

            Column({ space: spacing.xs }) {
              ForEach(
                this.voices.filter((v: TTSVoice) => {
                  const lang: string = (v.language || '').toLowerCase();
                  return lang.startsWith('zh');
                }),
                (v: TTSVoice) => {
                  Row() {
                    Column() {
                      Text(formatVoiceName(v))
                        .fontSize(fontSizes.md)
                        .fontWeight(FontWeight.Medium)
                        .fontColor(this.voiceId === v.id ? this.themePrimary : this.themeText)
                      Text(v.language || 'zh-CN')
                        .fontSize(fontSizes.sm)
                        .fontColor(this.themeTextSec)
                        .margin({ top: spacing.xs })
                    }
                    .layoutWeight(1)
                    .alignItems(HorizontalAlign.Start)

                    if (this.voiceId === v.id) {
                      AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 22, iconColor: this.themePrimary })
                    }
                  }
                  .width('100%')
                  .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
                  .backgroundColor(this.voiceId === v.id ? this.themePrimary + '20' : this.themeBg)
                  .border({
                    width: 1,
                    color: this.voiceId === v.id ? this.themePrimary : this.themeBorder + '40'
                  })
                  .borderRadius(borderRadius.md)
                  .alignItems(VerticalAlign.Center)
                  .onClick((): void => {
                    this.voiceId = v.id;
                  })
                },
                (v: TTSVoice): string => v.id
              )
            }
            .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
        .height(400)
        .scrollBar(BarState.Off)
      }
      .width('100%')
      .backgroundColor(this.themeSurface)
      .borderRadius({ topLeft: 20, topRight: 20 })
      .padding({ left: spacing.lg, right: spacing.lg, bottom: spacing.xl })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.End)
  }

  // ─── 切换 provider 后重拉音色(对齐 mobile useEffect [provider])─────────
  private async reloadVoices(): Promise<void> {
    try {
      const api = getApiClient();
      const vRes: ApiResponse<TTSVoice[]> = await api.getVoices(this.provider);
      if (vRes.success && vRes.data) {
        this.voices = vRes.data;
        const found: boolean = this.voices.some((v: TTSVoice) => v.id === this.voiceId);
        if (!found && this.voices.length > 0) {
          this.voiceId = this.voices[0].id;
        }
      }
    } catch {
      // 静默失败
    }
  }

  // ─── Sheet 5:章节选择(对齐 mobile Chapter Picker Modal)───────────────
  @Builder
  private ChapterPickerSheet() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showChapterPicker = false;
        })

      Column() {
        Column()
          .width(40)
          .height(4)
          .backgroundColor('rgba(150,150,150,0.3)')
          .borderRadius(2)
          .margin({ top: spacing.xs, bottom: spacing.md })

        Row() {
          Text('章节列表')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
          AppIcon({ kind: AppIconKind.Close, iconSize: 24, iconColor: this.themeText })
            .onClick((): void => {
              this.showChapterPicker = false;
            })
        }
        .width('100%')
        .margin({ bottom: spacing.md })

        List() {
          ForEach(this.chapters, (c: ChapterListItem) => {
            ListItem() {
              Row() {
                Text(`${c.index + 1}. `)
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeTextSec)
                Text(c.title)
                  .fontSize(fontSizes.md)
                  .fontColor(this.chapterIndex === c.index ? this.themePrimary : this.themeText)
                  .layoutWeight(1)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
              }
              .width('100%')
              .padding({ top: spacing.md, bottom: spacing.md, left: spacing.sm, right: spacing.sm })
              .backgroundColor(this.chapterIndex === c.index ? this.themePrimary + '20' : this.themeSurface)
              .border({ width: { bottom: 1 }, color: this.themeBorder + '30' })
              .onClick((): void => {
                void this.handleChapterChange(c.index);
              })
            }
          }, (c: ChapterListItem): string => `ch_${c.index}`)
        }
        .width('100%')
        .height(400)
        .scrollBar(BarState.Off)
      }
      .width('100%')
      .backgroundColor(this.themeSurface)
      .borderRadius({ topLeft: 20, topRight: 20 })
      .padding({ left: spacing.lg, right: spacing.lg, bottom: spacing.xl })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.End)
  }
}
