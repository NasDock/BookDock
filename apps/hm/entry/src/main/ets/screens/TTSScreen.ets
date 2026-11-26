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
  TtsLocalPrefs,
  BookLastReadPayload
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { PreferencesStore, PrefKey } from '../utils/PreferencesStore';
import { ThemeStore, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
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

// 默认朗读音色:中文·云扬(Edge TTS ShortName = zh-CN-YunyangNeural)
const DEFAULT_TTS_VOICE_ID: string = 'zh-CN-YunyangNeural';

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
  // 听书入口:detail=书籍详情页(恢复上次听书位置) / reader=阅读页(带当前章节)
  @Prop initialSource: string = 'detail';
  // 从阅读页进入时的当前章节(0-based),-1 表示未指定
  @Prop initialChapter: number = -1;

  // ─── 数据 ─────────────────────────────────────────────────────
  @State private book: Book = {} as Book;
  @State private chapters: ChapterListItem[] = [];
  @State private chapterIndex: number = 0;
  @State private chapterTitle: string = '';
  @State private paragraphs: Paragraph[] = [];
  // @Watch:播放切段 / 手动跳段 / 恢复进度时,段落列表跟随当前段居中
  @State @Watch('onCurrentParagraphChange') private currentParagraph: number = 0;
  @State private providers: TTSProvider[] = [];
  @State private voices: TTSVoice[] = [];
  @State private provider: string = 'edge';
  @State private voiceId: string = '';
  // 本地 TTS 偏好(跨书籍/章节保留音色),对齐 mobile ttsStore 的持久化行为
  private localPrefs: TtsLocalPrefs = {};

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

  // ─── 段落列表滚动(对齐 mobile flatListRef + scrollToIndex viewPosition 0.5)──
  private paragraphScroller: ListScroller = new ListScroller();
  private paragraphScrollTimerId: number = -1;

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

  private unsubscribeTheme: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeTheme = ThemeStore.shared().subscribe((): void => {
      this.applyTheme();
    });
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
    this.unsubscribeTheme?.();
    this.clearSleepTimer();
    this.clearParagraphScrollTimer();
    // 对齐 mobile beforeRemove:离开听书页时落库当前段落 + 段内偏移,
    // 否则听到一半直接返回书籍详情页,下次只能从上次切段时保存的位置(可能还是第一段)续播。
    if (this.book.id && this.paragraphs.length > 0) {
      const player: TTSPlayer = TTSPlayer.shared();
      const exitOffsetMs: number = player.currentBookId === this.book.id ? Math.max(0, player.positionMs) : 0;
      void this.persistProgress(this.currentParagraph, exitOffsetMs);
    }
    // 不 release TTSPlayer:全局 mini 播放器的显隐依赖单例的 currentBookId/state,
    // release 会清空它们导致返回书籍详情页后 mini 消失且播放中断。
    // 对齐 mobile:离开听书页只落库进度,全局播放器(TrackPlayer/AVPlayer)继续存活。
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
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
  }

  // ─── TTS 本地偏好(音色/provider/倍速)────────────────────────────────
  // 对齐 mobile ttsStore persist:'bookdock-tts' 的 selectedProvider/selectedVoice/playbackRate。
  // hm 用 PrefKey.TTS_PREFS 同一份 JSON,避免每次进入听书页被 voices[0] 或章节进度覆盖。
  private async loadLocalPrefs(): Promise<void> {
    try {
      const empty: TtsLocalPrefs = {};
      const prefs: TtsLocalPrefs = await PreferencesStore.readObject<TtsLocalPrefs>(PrefKey.TTS_PREFS, empty);
      this.localPrefs = prefs;
      if (prefs.provider) {
        this.provider = prefs.provider;
      }
      if (prefs.voiceId) {
        this.voiceId = prefs.voiceId;
      }
      if (prefs.playbackRate !== undefined) {
        this.playbackRate = prefs.playbackRate;
      }
    } catch {
      this.localPrefs = {};
    }
  }

  private async saveLocalPrefs(): Promise<void> {
    try {
      const prefs: TtsLocalPrefs = {
        provider: this.provider,
        voiceId: this.voiceId,
        playbackRate: this.playbackRate
      };
      this.localPrefs = prefs;
      await PreferencesStore.writeObject<TtsLocalPrefs>(PrefKey.TTS_PREFS, prefs);
    } catch {
      // 持久化失败不影响播放
    }
  }

  // 无已选音色时优先中文·云扬,其次任意中文音色,最后才退回列表第一项
  private preferredVoiceId(): string {
    if (this.voices.length === 0) {
      return DEFAULT_TTS_VOICE_ID;
    }
    const yunyang: TTSVoice | undefined = this.voices.find(
      (v: TTSVoice): boolean => v.id === DEFAULT_TTS_VOICE_ID);
    if (yunyang) {
      return yunyang.id;
    }
    const chinese: TTSVoice | undefined = this.voices.find(
      (v: TTSVoice): boolean => (v.language || '').toLowerCase().startsWith('zh'));
    return chinese ? chinese.id : this.voices[0].id;
  }

  // ─── 取"上次听书位置":全书所有章节里 updatedAt 最新的一条进度 ──────
  // 后端 GET /tts/progress?bookId=xxx(不带 chapterIndex)返回该书全部章节记录
  private async fetchLastTtsProgress(bookId: string): Promise<TtsProgressRecord | null> {
    try {
      const res: ApiResponse<TtsProgressRecord | TtsProgressRecord[] | null> =
        await getApiClient().getTtsProgress(bookId);
      if (!res.success || !res.data) {
        return null;
      }
      const list: TtsProgressRecord[] = Array.isArray(res.data)
        ? res.data
        : [res.data as TtsProgressRecord];
      let latest: TtsProgressRecord | null = null;
      let latestMs: number = -1;
      for (const rec of list) {
        // ISO 字符串用 Date.parse 比较;无效时间按 0 处理
        const parsed: number = rec.updatedAt ? Date.parse(rec.updatedAt) : 0;
        const ms: number = Number.isNaN(parsed) ? 0 : parsed;
        if (ms >= latestMs) {
          latestMs = ms;
          latest = rec;
        }
      }
      return latest;
    } catch {
      return null;
    }
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
      // 先读本地音色偏好,再拉服务商/音色列表;否则会被列表首项覆盖
      await this.loadLocalPrefs();
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
        const valid: boolean = this.voices.some((v: TTSVoice): boolean => v.id === this.voiceId);
        if (!valid) {
          // 没有本地偏好(或偏好音色不在当前服务商列表)时使用中文·云扬
          this.voiceId = this.preferredVoiceId();
          this.localPrefs.voiceId = this.voiceId;
          void this.saveLocalPrefs();
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

      // ── 决定听书起点 ──────────────────────────────────────────────
      // mini 展开 / 从其它页返回时:若全局播放器正在播同一本书,直接接续其真实状态。
      // 不从服务端旧进度恢复(否则回到第一章第一节),也不重新 playParagraph(否则打断后台音频)。
      const player: TTSPlayer = TTSPlayer.shared();
      const liveBookId: string = player.currentBookId;
      const isLiveSameBook: boolean = liveBookId === this.book.id &&
        (player.state === TTSPlayerState.PLAYING || player.state === TTSPlayerState.PAUSED);
      if (isLiveSameBook) {
        const liveChapter: number = player.currentChapterIndex;
        await this.loadChapter(liveChapter >= 0 ? liveChapter : 0, true, false);
        // 播放器段落索引优先(后台已播到第 N 段),不让云端进度覆盖
        const livePara: number = player.getCurrentParagraphIndex();
        if (livePara >= 0 && livePara < this.paragraphs.length) {
          this.currentParagraph = livePara;
        }
        this.isPlaying = player.state === TTSPlayerState.PLAYING;
        this.registerPlayerCallbacks();
        return;
      }

      // 上次听书位置(全书最新一条进度),用于详情页续听 / 阅读页同章判断
      const lastRec: TtsProgressRecord | null = await this.fetchLastTtsProgress(this.book.id);
      let startChapter: number = 0;
      // 是否需要续听(恢复段落进度)。false 表示从章节开头开始
      let resume: boolean = false;

      if (this.initialSource === 'reader' && this.initialChapter >= 0) {
        // 从阅读详情页进入:以当前阅读章节为准
        // 当前章 == 上次听书章 且上次确实听了一部分 → 续听;否则从当前章开头
        startChapter = this.initialChapter;
        if (lastRec !== null && lastRec.chapterIndex === startChapter) {
          const lastPara: number = lastRec.paragraphIndex ?? 0;
          const lastOffset: number = lastRec.audioOffsetMs ?? 0;
          resume = lastPara > 0 || lastOffset > 0;
        }
      } else if (lastRec !== null && lastRec.chapterIndex >= 0 && lastRec.chapterIndex < this.chapters.length) {
        // 从书籍详情页进入:恢复上次听书位置(跨章续听)
        startChapter = lastRec.chapterIndex;
        resume = true;
      }

      await this.loadChapter(startChapter, true, resume);

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
  // resume=false 时不恢复云端段落进度,从本章第 0 段开始(阅读页进入但非上次听书章)
  private async loadChapter(ci: number, skipEmpty: boolean = false, resume: boolean = true): Promise<void> {
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
      // resume=false 时只保留音色/倍速偏好,段落进度与偏移归零
      try {
        const prog: ApiResponse<TtsProgressRecord | TtsProgressRecord[] | null> =
          await api.getTtsProgress(this.book.id, effectiveCi);
        if (prog.success && prog.data && !Array.isArray(prog.data)) {
          const rec: TtsProgressRecord = prog.data as TtsProgressRecord;
          // 音色/provider 只认本地偏好(默认云扬),不再用章节进度覆盖:
          // 章节级记录缺失或换书/换章时会把用户选过的音色打回 voices[0]。
          if (rec.currentRate && this.localPrefs.playbackRate === undefined) {
            this.playbackRate = rec.currentRate;
          }
          if (resume) {
            this.currentParagraph = Math.min(rec.paragraphIndex ?? 0, this.paragraphs.length - 1);
            // 恢复段内偏移(对齐 mobile setResumeOffsetMs(rec.audioOffsetMs))
            this.resumeOffsetMs = rec.audioOffsetMs ?? 0;
          }
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

  // ─── 注册播放器回调(新播 / mini 展开接续共用)─────────────────────
  private registerPlayerCallbacks(): void {
    const player: TTSPlayer = TTSPlayer.shared();
    player.onProgressUpdate = (positionMs: number, durationMs: number): void => {
      // 段内进度由 TTSPlayer.positionMs 维护,退出时落库;这里仅保留扩展点
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
    this.registerPlayerCallbacks();

    const ok: boolean = await player.playParagraphs(
      this.paragraphs,
      idx,
      this.book.id,
      this.provider,
      this.voiceId,
      startOffset,
      this.book.title ?? '',
      this.chapterTitle,
      this.book.coverUrl ?? '',
      this.chapterIndex
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
    // 与 mobile ttsStore 一致,倍速也进本地偏好(TTS_PREFS.playbackRate)
    void this.saveLocalPrefs();
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
      // 字段名对齐服务端 SaveTtsProgressDto(voice/provider/totalParagraphs)。
      // 旧版用 currentProvider/currentVoice/currentRate,被 forbidNonWhitelisted 拒绝导致进度从未落库。
      const ttsPayload: TtsProgressPayload = {
        bookId: this.book.id,
        chapterIndex: this.chapterIndex,
        paragraphIndex: idx,
        audioOffsetMs: positionMs,
        voice: this.voiceId,
        provider: this.provider,
        totalParagraphs: this.paragraphs.length
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

  // ─── 段落列表滚动:当前段居中(对齐 mobile scrollToIndex viewPosition 0.5)──
  private clearParagraphScrollTimer(): void {
    if (this.paragraphScrollTimerId >= 0) {
      clearTimeout(this.paragraphScrollTimerId);
      this.paragraphScrollTimerId = -1;
    }
  }

  private scrollToCurrentParagraph(smooth: boolean, delayMs: number): void {
    this.clearParagraphScrollTimer();
    // 列表只在 content 视图挂载;controls / 加载中时无需滚动
    if (this.viewMode !== 'content' || this.paragraphs.length === 0 ||
      this.currentParagraph < 0 || this.currentParagraph >= this.paragraphs.length) {
      return;
    }
    // 等列表布局完成后再滚,否则 scrollToIndex 拿不到正确的 item 高度
    this.paragraphScrollTimerId = setTimeout((): void => {
      this.paragraphScrollTimerId = -1;
      try {
        this.paragraphScroller.scrollToIndex(this.currentParagraph, smooth, ScrollAlign.CENTER);
      } catch {
        // 列表尚未布局完成时忽略,下次段落变化会再滚
      }
    }, delayMs);
  }

  // 播放切段 / 手动跳段 / 进度恢复时:平滑跟随当前段(mobile 100ms effect)
  private onCurrentParagraphChange(): void {
    this.scrollToCurrentParagraph(true, 100);
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
      List({ scroller: this.paragraphScroller }) {
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
      .onAppear((): void => {
        // 进入朗读文本页:当前段立即居中(对齐 mobile 300ms initial effect)
        this.scrollToCurrentParagraph(false, 300);
      })

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
                      void this.saveLocalPrefs();
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
                    // 立即持久化,下次进入听书页/换章不再回退到默认音色
                    void this.saveLocalPrefs();
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
        if (!found) {
          this.voiceId = this.preferredVoiceId();
          void this.saveLocalPrefs();
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
