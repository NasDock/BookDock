// [API 23+] screens/ReaderScreen.ets — 1:1 对齐 mobile ReaderScreen.tsx(滚动模式 + 原生 PDF)
// 核心: ArkWeb Web 组件 + generateReaderHtml(滚动) + injectedJS(进度/划线/点击/自动滚动)
// + PDF 走 HarmonyOS 原生 @kit.PDFKit(PdfView + PdfController),免 H5/无 base64/无 OOM
// P5 范围: 原生 PDF 阅读 + 翻页/章节跳转/进度同步/主题切换
import { webview } from '@kit.ArkWeb';
import { pdfViewManager, pdfService, PdfView } from '@kit.PDFKit';
import { promptAction, window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import {
  ApiResponse,
  Book,
  ChapterContentResponse,
  ChapterListItem,
  CreateHighlightDto,
  CreateNoteDto,
  ReadingProgressResponse
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { ReaderStore, ReaderMode, ReadingMode } from '../store/ReaderStore';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute, pushRoute, RouteName, BookParams, TTSParams } from '../router/AppRouter';
import { FileHelper } from '../utils/FileHelper';
import {
  generateReaderHtml,
  generateInjectedJs,
  generateApplySettingsJs,
  generateHighlightJs,
  generateAutoScrollStartJs,
  generateAutoScrollStopJs,
  generateAutoScrollSetSpeedJs,
  generateReportPositionJs
} from '../reader/ReaderHtml';

const DOMAIN = 0x000A;
const TAG = 'ReaderScreen';

// ─── 阅读主题(对齐 mobile READER_THEMES)─────────────────────────────
interface ReaderTheme {
  key: ReaderMode;
  label: string;
  bg: string;
  text: string;
  barBg: string;
  barText: string;
  border: string;
}

const READER_THEMES: ReaderTheme[] = [
  { key: 'light', label: '浅色', bg: '#ffffff', text: '#1a1a1a', barBg: '#ffffff', barText: '#1a1a1a', border: '#e5e5e5' },
  { key: 'dark', label: '深色', bg: '#1a1a1a', text: '#e0e0e0', barBg: '#1a1a1a', barText: '#e0e0e0', border: '#333333' },
  { key: 'sepia', label: '护眼', bg: '#f4ecd8', text: '#5c4b37', barBg: '#f4ecd8', barText: '#5c4b37', border: '#d4c4a8' },
];

interface FontOption {
  label: string;
  value: string;
}

const FONT_OPTIONS: FontOption[] = [
  { label: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: '衬线体', value: 'Georgia, "Noto Serif SC", serif' },
  { label: '黑体', value: '"Noto Sans SC", "PingFang SC", sans-serif' },
];

// ─── 路由入参 ─────────────────────────────────────────────────────
interface RouteBookParams {
  book: Book;
}

// ─── WebView message 类型 ──────────────────────────────────────────
interface WebViewMessage {
  type: string;
  progress?: number;
  scrollOffset?: number;
  direction?: string;
  text?: string;
  y?: number;
  page?: number;
  total?: number;
  edge?: string;
  running?: boolean;
  speed?: number;
  outline?: Array<PdfOutlineItem>;
  message?: string;
}

// ─── PDF 目录项(对齐 mobile generatePdfViewerHtml 上报结构)──────────
interface PdfOutlineItem {
  title: string;
  page: number;
}

// ─── 文件读取错误类型(ArkTS 不能 unknown,固定字段)────────────────
interface FsErrorLike {
  code?: number;
  message?: string;
}

// ─── H5 → 原生 JS 桥接对象(注册到 window.readerBridge)──────────────
class ReaderJsBridge {
  private screen: ReaderScreen;

  constructor(screen: ReaderScreen) {
    this.screen = screen;
  }

  postMessage(json: string): void {
    try {
      const data: WebViewMessage = JSON.parse(json) as WebViewMessage;
      this.screen.handleWebViewMessage(data);
    } catch (err) {
      console.error(`ReaderJsBridge parse error: ${(err as Error)?.message ?? ''}`);
    }
  }
}

@Component
export struct ReaderScreen {
  @Prop initialBook: Book = {} as Book;

  // ─── 数据 ─────────────────────────────────────────────────────
  @State private book: Book = {} as Book;
  @State private chapters: ChapterListItem[] = [];
  @State private currentChapter: number = 0;
  @State private htmlContent: string = '';
  @State private isLoading: boolean = true;
  @State private error: string | null = null;
  @State private readingProgress: number = 0;
  @State private savedScrollOffset: number = 0;

  // ─── PDF 状态(P5 新增,@kit.PDFKit 接管)───────────────────────
  @State private pdfTotalPages: number = 0;
  @State private pdfCurrentPage: number = 1;
  @State private pdfOutline: PdfOutlineItem[] = [];

  // ─── UI 状态 ──────────────────────────────────────────────────
  @State private showBars: boolean = true;
  @State private showSettings: boolean = false;
  @State private showChapters: boolean = false;
  @State private showActionSheet: boolean = false;
  @State private showNoteModal: boolean = false;
  @State private selectedText: string = '';
  @State private noteText: string = '';
  @State private isSavingNote: boolean = false;

  // ─── 阅读配置(mirror ReaderStore)─────────────────────────────
  @State private fontSize: number = 18;
  @State private lineHeight: number = 1.8;
  @State private pageMargin: number = 16;
  @State private readerMode: ReaderMode = 'light';
  @State private fontFamily: string = 'System';
  @State private readingMode: ReadingMode = 'scroll';
  @State private autoScrollEnabled: boolean = false;
  @State private autoScrollSpeed: number = 30;

  // ─── 阅读主题色(派生)─────────────────────────────────────────
  @State private themeBg: string = '#ffffff';
  @State private themeText: string = '#1a1a1a';
  @State private themeBarBg: string = '#ffffff';
  @State private themeBarText: string = '#1a1a1a';
  @State private themeBorder: string = '#e5e5e5';

  // ─── 内部 ─────────────────────────────────────────────────────
  private readerStore: ReaderStore = ReaderStore.shared();
  private webController: webview.WebviewController = new webview.WebviewController();
  // H5 → 原生消息桥接(替代 react-native-webview 的 onMessage)
  private jsBridge: ReaderJsBridge = new ReaderJsBridge(this);
  private webViewReady: boolean = false;
  private latestPercentage: number = 0;
  private latestScrollOffset: number = 0;
  private unsubscribeReader: (() => void) | null = null;

  // ─── PDF 内部(@kit.PDFKit 原生接管)───────────────────────────
  private pdfController: pdfViewManager.PdfController = new pdfViewManager.PdfController();
  private pdfDocLoaded: boolean = false;

  // 安全区域(手动获取，替代 expandSafeArea)
  @State private safeAreaTop: number = 0;
  @State private safeAreaBottom: number = 0;

  // 窗口引用(用于设置系统状态栏颜色)
  private mainWindow: window.Window | null = null;

  // 阅读计时(对齐 mobile reading timer)
  private readingStartTime: number = 0;
  private accumulatedReadingTime: number = 0;
  private isReadingActive: boolean = false;

  aboutToAppear(): void {
    this.book = this.initialBook;
    this.readingProgress = this.book.readingProgress ?? 0;
    this.latestPercentage = this.readingProgress;
    this.applyReaderTheme();
    void this.setupImmersive();
    // 注册 PDF 翻页监听(@kit.PDFKit 原生支持,无需 H5 桥接)
    this.registerPdfListeners();
    void this.init();
  }

  /**
   * 注册 PDF 翻页监听(PdfController.registerPageChangedListener)。
   * 当前页变化时同步更新进度 + 保存阅读记录。
   * 注意:监听器只回调当前页(0-based),总页数通过 getPageCount() 实时拿。
   */
  private registerPdfListeners(): void {
    try {
      this.pdfController.registerPageChangedListener((pageIndex: number): void => {
        const page: number = pageIndex + 1;
        const totalPages: number = this.pdfController.getPageCount();
        this.pdfCurrentPage = page;
        this.pdfTotalPages = totalPages;
        this.currentChapter = page - 1;
        const pct: number = totalPages > 0 ? Math.round((page / totalPages) * 100) : 0;
        this.latestPercentage = pct;
        this.readingProgress = pct;
        this.latestScrollOffset = 0;
        if (this.readerStore.autoSaveProgress) {
          this.saveProgress();
        }
      });
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'registerPdfListeners failed: %{public}s', JSON.stringify(err));
    }
  }

  /** 进入阅读页：开启全屏沉浸 + 记录安全区 + 应用系统栏颜色 */
  private async setupImmersive(): Promise<void> {
    try {
      const win = await window.getLastWindow(getContext(this));
      this.mainWindow = win;
      // 开启全屏：内容延伸到状态栏和手势条区域，小横条区域才能用我们的背景色
      await win.setWindowLayoutFullScreen(true);
      const avoidArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      this.safeAreaTop = px2vp(avoidArea.topRect.height);
      this.safeAreaBottom = px2vp(avoidArea.bottomRect.height);
      // 手势导航条区域(type=TYPE_NAVIGATION_INDICATOR)的高度
      const navArea = win.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      const navBottom = px2vp(navArea.bottomRect.height);
      if (navBottom > 0) {
        this.safeAreaBottom = navBottom;
      }
      hilog.info(DOMAIN, TAG, 'safeArea top=%{public}s bottom=%{public}s',
        this.safeAreaTop.toString(), this.safeAreaBottom.toString());
      this.applySystemBarTheme();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'setupImmersive failed: %{public}s', JSON.stringify(err));
    }
  }

  aboutToDisappear(): void {
    this.stopReadingTimer();
    if (this.unsubscribeReader) {
      this.unsubscribeReader();
    }
    this.saveProgress();
    this.exitImmersive();
  }

  /** 离开阅读页：恢复非全屏 + 系统栏默认颜色 */
  private exitImmersive(): void {
    if (!this.mainWindow) {
      return;
    }
    try {
      this.mainWindow.setWindowLayoutFullScreen(false);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'exitImmersive failed: %{public}s', JSON.stringify(err));
    }
    this.restoreSystemBarTheme();
  }

  private async init(): Promise<void> {
    await this.readerStore.load();
    this.syncFromStore();
    this.unsubscribeReader = this.readerStore.subscribe((): void => {
      this.syncFromStore();
      if (this.webViewReady) {
        this.applySettings();
      }
    });
    this.applyReaderTheme();
    void this.loadBookContent();
    this.startReadingTimer();
  }

  private syncFromStore(): void {
    this.fontSize = this.readerStore.fontSize;
    this.lineHeight = this.readerStore.lineHeight;
    this.pageMargin = this.readerStore.margin;
    this.readerMode = this.readerStore.mode;
    this.fontFamily = this.readerStore.fontFamily;
    this.readingMode = this.readerStore.readingMode;
    this.autoScrollEnabled = this.readerStore.autoScrollEnabled;
    this.autoScrollSpeed = this.readerStore.autoScrollSpeed;
  }

  private applyReaderTheme(): void {
    const t: ReaderTheme = READER_THEMES.find((tm: ReaderTheme): boolean => tm.key === this.readerMode) ?? READER_THEMES[0];
    this.themeBg = t.bg;
    this.themeText = t.text;
    this.themeBarBg = t.barBg;
    this.themeBarText = t.barText;
    this.themeBorder = t.border;
    this.applySystemBarTheme();
  }

  /** 设置系统状态栏/导航栏颜色与阅读主题一致 */
  private applySystemBarTheme(): void {
    if (!this.mainWindow) {
      return;
    }
    try {
      this.mainWindow.setWindowSystemBarProperties({
        statusBarColor: this.themeBarBg,
        navigationBarColor: this.themeBarBg,
        // 深色/护眼主题用浅色图标，浅色主题用深色图标
        statusBarContentColor: this.readerMode === 'light' ? '#000000' : '#FFFFFF',
        navigationBarContentColor: this.readerMode === 'light' ? '#000000' : '#FFFFFF'
      });
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'setWindowSystemBarProperties failed: %{public}s', JSON.stringify(err));
    }
  }

  /** 恢复系统栏默认颜色(离开阅读页时调用) */
  private restoreSystemBarTheme(): void {
    if (!this.mainWindow) {
      return;
    }
    try {
      this.mainWindow.setWindowSystemBarProperties({
        statusBarColor: '#FFFFFF',
        navigationBarColor: '#FFFFFF',
        statusBarContentColor: '#000000',
        navigationBarContentColor: '#000000'
      });
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'restoreSystemBarTheme failed: %{public}s', JSON.stringify(err));
    }
  }

  // ─── 数据加载 ─────────────────────────────────────────────────

  private async loadBookContent(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      // 先恢复阅读进度
      let initialChapter: number = 0;
      let initialScrollOffset: number = 0;
      try {
        const progressRes: ApiResponse<ReadingProgressResponse> = await getApiClient().getReadingProgress(this.book.id);
        if (progressRes.success && progressRes.data) {
          initialChapter = progressRes.data.currentChapter ?? 0;
          initialScrollOffset = progressRes.data.scrollOffset ?? 0;
          this.latestPercentage = progressRes.data.progressPct;
          this.readingProgress = progressRes.data.progressPct;
        }
      } catch {
        // 网络失败用本地进度
      }
      this.savedScrollOffset = initialScrollOffset;
      this.currentChapter = initialChapter;
      // 恢复 PDF 进度(PDF 的 currentChapter 即页码 - 1)
      const fileTypeOrFormat: string = this.book.fileType ?? this.book.format ?? '';
      if (fileTypeOrFormat === 'pdf') {
        this.pdfCurrentPage = Math.max(1, initialChapter + 1);
      }

      // PDF 走独立加载分支(不需要 chapters/content)
      if (fileTypeOrFormat === 'pdf') {
        await this.loadPdfContent();
        return;
      }

      const api = getApiClient();
      // 拉章节列表
      const chaptersRes: ApiResponse<ChapterListItem[]> = await api.getChapters(this.book.id);
      if (!chaptersRes.success || !chaptersRes.data) {
        throw new Error(chaptersRes.error ?? '获取章节目录失败');
      }
      this.chapters = chaptersRes.data;

      // 拉第一章内容
      const contentRes: ApiResponse<ChapterContentResponse> = await api.getChapterContent(this.book.id, initialChapter);
      if (!contentRes.success || !contentRes.data) {
        throw new Error(contentRes.error ?? '加载章节内容失败');
      }

      const chapterContent: string = contentRes.data.content;
      this.htmlContent = generateReaderHtml(
        this.book.title,
        this.book.author,
        chapterContent,
        this.book.fileType ?? 'txt',
        this.readerStore.getConfig()
      );

      const overallPct: number = this.chapters.length > 0
        ? Math.round(((initialChapter + 1) / this.chapters.length) * 100)
        : 0;
      this.readingProgress = overallPct;
      this.latestPercentage = overallPct;
      this.latestScrollOffset = initialScrollOffset;
    } catch (err) {
      const msg: string = err instanceof Error ? err.message : '加载书籍失败';
      this.error = msg;
      hilog.error(DOMAIN, TAG, 'loadBookContent fail: %{public}s', msg);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadChapter(chapterIndex: number, scrollOffset: number = 0): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      this.currentChapter = chapterIndex;
      this.savedScrollOffset = scrollOffset;
      const contentRes: ApiResponse<ChapterContentResponse> = await getApiClient().getChapterContent(this.book.id, chapterIndex);
      if (!contentRes.success || !contentRes.data) {
        throw new Error(contentRes.error ?? '加载章节内容失败');
      }
      const chapterContent: string = contentRes.data.content;
      this.htmlContent = generateReaderHtml(
        this.book.title,
        this.book.author,
        chapterContent,
        this.book.fileType ?? 'txt',
        this.readerStore.getConfig()
      );
      const overallPct: number = this.chapters.length > 0
        ? Math.round(((chapterIndex + 1) / this.chapters.length) * 100)
        : 0;
      this.readingProgress = overallPct;
      this.latestPercentage = overallPct;
      this.latestScrollOffset = scrollOffset;
    } catch (err) {
      const msg: string = err instanceof Error ? err.message : '加载章节失败';
      this.error = msg;
    } finally {
      this.isLoading = false;
    }
  }

  // ─── PDF 加载(P5,@kit.PDFKit 接管)────────────────────────────
  // 流程: 本地优先 → ApiClient.getBookFile 远程下载 → 写沙箱 books/{id}.pdf → PdfController.loadDocument 直接加载
  private async loadPdfContent(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.pdfDocLoaded = false;
    this.pdfTotalPages = 0;
    this.pdfOutline = [];
    try {
      const localPath: string = FileHelper.bookLocalPath(this.book.id, 'pdf');
      if (!FileHelper.exists(localPath)) {
        // 本地无缓存,远程下载
        const remote: ArrayBuffer | null = await getApiClient().getBookFile(this.book.id);
        if (!remote) {
          throw new Error('下载 PDF 失败: 服务器返回为空');
        }
        // 校验 magic bytes "%PDF-"
        const head: Uint8Array = new Uint8Array(remote, 0, Math.min(5, remote.byteLength));
        if (head[0] !== 0x25 || head[1] !== 0x50 || head[2] !== 0x44 || head[3] !== 0x46) {
          throw new Error('下载的文件不是有效的 PDF');
        }
        await FileHelper.ensureBooksDir();
        await FileHelper.writeBytes(localPath, remote);
        hilog.info(DOMAIN, TAG, 'PDF 已缓存到 %{public}s size=%{public}d', localPath, remote.byteLength);
      }
      // 直接加载沙箱里的 PDF 文件路径(原生 Kit,无需 base64/无需 webview)
      const initIdx: number = Math.max(0, this.pdfCurrentPage - 1);
      const result = await this.pdfController.loadDocument(localPath, '', initIdx);
      this.pdfDocLoaded = true;
      this.pdfTotalPages = this.pdfController.getPageCount();
      hilog.info(DOMAIN, TAG, 'PDF loadDocument success, totalPages=%{public}d', this.pdfTotalPages);
      void result;
    } catch (err) {
      const msg: string = err instanceof Error ? err.message : '加载 PDF 失败';
      this.error = msg;
      hilog.error(DOMAIN, TAG, 'loadPdfContent fail: %{public}s', msg);
    } finally {
      this.isLoading = false;
    }
  }

  /** 当前书籍是否为 PDF(对外暴露,build() 用) */
  private isPdf(): boolean {
    return (this.book.fileType ?? this.book.format ?? '') === 'pdf';
  }

  // ─── 阅读计时 ─────────────────────────────────────────────────

  private startReadingTimer(): void {
    if (!this.isReadingActive) {
      this.isReadingActive = true;
      this.readingStartTime = Date.now();
    }
  }

  private stopReadingTimer(): void {
    if (this.isReadingActive && this.readingStartTime > 0) {
      const elapsed: number = Math.floor((Date.now() - this.readingStartTime) / 1000);
      this.accumulatedReadingTime += elapsed;
      this.isReadingActive = false;
      this.readingStartTime = 0;
    }
    // 上报(对齐 mobile flushReadingTimer,≥10s 才报)
    if (this.accumulatedReadingTime >= 10) {
      const hour: number = new Date().getHours();
      void getApiClient().recordReadingSession(this.book.id, this.accumulatedReadingTime, hour).catch((): void => undefined);
      this.accumulatedReadingTime = 0;
    }
  }

  // ─── 进度保存 ─────────────────────────────────────────────────

  private saveProgress(): void {
    if (!this.readerStore.autoSaveProgress) return;
    void getApiClient().updateReadingProgress(
      this.book.id,
      this.latestPercentage,
      this.currentChapter,
      this.latestScrollOffset,
      0
    ).catch((): void => undefined);
  }

  // ─── WebView 消息处理 ─────────────────────────────────────────

  // 供 ReaderJsBridge 调用,必须 public
  handleWebViewMessage(msg: WebViewMessage): void {
    if (msg.type === 'scroll') {
      const progress: number = msg.progress ?? 0;
      const scrollOffset: number = msg.scrollOffset ?? 0;
      const overallPercentage: number = this.chapters.length > 0
        ? Math.max(0, Math.min(100, Math.round(((this.currentChapter + (progress / 100)) / this.chapters.length) * 100)))
        : progress;
      this.latestPercentage = overallPercentage;
      this.latestScrollOffset = scrollOffset;
      this.readingProgress = overallPercentage;
      if (this.readerStore.autoSaveProgress) {
        this.saveProgress();
      }
    } else if (msg.type === 'scrollDirection') {
      if (this.readerStore.autoScrollEnabled) return;
      if (msg.direction === 'down') {
        this.showBars = false;
      } else if (msg.direction === 'up') {
        this.showBars = true;
      }
    } else if (msg.type === 'click') {
      const y: number = msg.y ?? 0;
      // 简化: 点击中部切换工具栏(对齐 mobile 点击区域逻辑)
      this.showBars = !this.showBars;
    } else if (msg.type === 'textSelected') {
      const text: string = msg.text ?? '';
      if (text.trim().length > 0) {
        this.selectedText = text.trim();
        this.showActionSheet = true;
      }
    } else if (msg.type === 'autoScrollEnd') {
      this.readerStore.setAutoScrollEnabled(false);
    } else if (msg.type === 'outline') {
      // PDF.js 报告 outline,镜像到状态(供章节抽屉展示)
      const arr: PdfOutlineItem[] = msg.outline ?? [];
      this.pdfOutline = arr;
    }
  }

  // ─── 设置面板 ─────────────────────────────────────────────────

  private applySettings(): void {
    const js: string = generateApplySettingsJs(
      this.readerStore.mode,
      this.readerStore.fontFamily,
      this.readerStore.fontSize,
      this.readerStore.lineHeight,
      this.readerStore.margin
    );
    this.webController.runJavaScript(js);
    // PDF 主题切换通过 PdfView.backgroundColor + readerMode 派生(由 build() 监听 themeBg 重渲染)
    this.applyReaderTheme();
  }

  // ─── 操作 ─────────────────────────────────────────────────────

  private handleBack(): void {
    this.webController.runJavaScript(generateReportPositionJs());
    setTimeout((): void => {
      this.saveProgress();
      popRoute();
    }, 120);
  }

  private handleChapterPress(index: number): void {
    this.showChapters = false;
    const isPdf: boolean = (this.book.fileType ?? this.book.format ?? '') === 'pdf';
    if (isPdf) {
      // PDF 章节索引即 outline 项下标,page 已经是 1-based
      const outline: PdfOutlineItem | undefined = this.pdfOutline[index];
      const targetPage: number = outline ? outline.page : index + 1;
      this.jumpToPdfPage(targetPage);
      return;
    }
    void this.loadChapter(index, 0);
  }

  private handlePrevPage(): void {
    const isPdf: boolean = (this.book.fileType ?? this.book.format ?? '') === 'pdf';
    if (isPdf) {
      if (this.pdfCurrentPage > 1) {
        this.jumpToPdfPage(this.pdfCurrentPage - 1);
      } else {
        promptAction.showToast({ message: '已经是第一页了', duration: 1500 });
      }
      return;
    }
    if (this.currentChapter > 0) {
      void this.loadChapter(this.currentChapter - 1, 0);
    } else {
      promptAction.showToast({ message: '已经是第一章了', duration: 1500 });
    }
  }

  private handleNextPage(): void {
    const isPdf: boolean = (this.book.fileType ?? this.book.format ?? '') === 'pdf';
    if (isPdf) {
      if (this.pdfCurrentPage < this.pdfTotalPages) {
        this.jumpToPdfPage(this.pdfCurrentPage + 1);
      } else {
        promptAction.showToast({ message: '已经是最后一页了', duration: 1500 });
      }
      return;
    }
    if (this.currentChapter < this.chapters.length - 1) {
      void this.loadChapter(this.currentChapter + 1, 0);
    } else {
      promptAction.showToast({ message: '已经是最后一章了', duration: 1500 });
    }
  }

  /** PDF 跳页:同步更新本地状态 + 调用 PdfController.goToPage */
  private jumpToPdfPage(page: number): void {
    this.pdfCurrentPage = page;
    this.currentChapter = page - 1;
    this.latestPercentage = this.pdfTotalPages > 0 ? Math.round((page / this.pdfTotalPages) * 100) : 0;
    this.readingProgress = this.latestPercentage;
    if (this.pdfDocLoaded) {
      // PdfController.goToPage 接受 0-based
      void this.pdfController.goToPage(Math.max(0, page - 1));
    }
  }

  private handleToggleAutoScroll(): void {
    const next: boolean = !this.autoScrollEnabled;
    this.readerStore.setAutoScrollEnabled(next);
    if (next) {
      this.webController.runJavaScript(generateAutoScrollStartJs(this.autoScrollSpeed));
    } else {
      this.webController.runJavaScript(generateAutoScrollStopJs());
    }
  }

  private handleTTS(): void {
    const p: TTSParams = { book: this.book };
    pushRoute(RouteName.TTS_SCREEN, p);
  }

  private handleCreateNote(): void {
    this.showActionSheet = false;
    this.showNoteModal = true;
  }

  private async handleSaveNote(): Promise<void> {
    if (!this.selectedText.trim() || !this.noteText.trim()) return;
    this.isSavingNote = true;
    try {
      const dto: CreateNoteDto = {
        bookId: this.book.id,
        text: this.selectedText.trim(),
        note: this.noteText.trim(),
        percentage: this.latestPercentage,
        author: this.book.author ?? '',
        bookTitle: this.book.title ?? '',
      };
      await getApiClient().createNote(dto);
      promptAction.showToast({ message: '笔记已保存', duration: 1500 });
      this.showNoteModal = false;
      this.noteText = '';
      this.selectedText = '';
    } catch {
      promptAction.showToast({ message: '保存笔记失败', duration: 1500 });
    } finally {
      this.isSavingNote = false;
    }
  }

  private async handleCreateHighlight(): Promise<void> {
    if (!this.selectedText.trim()) return;
    this.showActionSheet = false;
    try {
      const dto: CreateHighlightDto = {
        bookId: this.book.id,
        text: this.selectedText.trim(),
        color: 'yellow',
      };
      await getApiClient().createHighlight(dto);
      this.webController.runJavaScript(generateHighlightJs());
      promptAction.showToast({ message: '高亮已保存', duration: 1500 });
      this.selectedText = '';
    } catch {
      promptAction.showToast({ message: '保存高亮失败', duration: 1500 });
    }
  }

  // ─── 渲染 ─────────────────────────────────────────────────────

  build() {
    Stack({ alignContent: Alignment.Top }) {
      // WebView 主体
      if (this.isLoading) {
        Column() {
          LoadingProgress().color('#4A90D9').width(48).height(48)
          Text('正在加载书籍...')
            .fontSize(fontSizes.md)
            .fontColor('#6B7280')
            .margin({ top: spacing.md })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(this.themeBg)
      } else if (this.error) {
        Column() {
          AppIcon({ kind: AppIconKind.Close, iconSize: 48, iconColor: '#EF4444' })
          Text(this.error)
            .fontSize(fontSizes.md)
            .fontColor('#EF4444')
            .margin({ top: spacing.md })
          Text('重试')
            .fontSize(fontSizes.md)
            .fontColor('#4A90D9')
            .margin({ top: spacing.lg })
            .padding({ left: spacing.lg, right: spacing.lg, top: spacing.sm, bottom: spacing.sm })
            .border({ width: 1, color: '#4A90D9' })
            .borderRadius(borderRadius.md)
            .onClick((): void => {
              void this.loadBookContent();
            })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(this.themeBg)
      } else if (this.htmlContent) {
        Web({ src: `data:text/html;charset=utf-8,${encodeURIComponent(this.htmlContent)}`, controller: this.webController })
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .onPageEnd((): void => {
            this.webViewReady = true;
            // 注入脚本(滚动监听/点击/选择/自动滚动)
            const js: string = generateInjectedJs(
              this.savedScrollOffset,
              this.readerStore.autoScrollSpeed,
              this.readerStore.autoScrollEnabled
            );
            this.webController.runJavaScript(js);
          })
          .javaScriptProxy({
            object: this.jsBridge,
            name: 'readerBridge',
            methodList: ['postMessage'],
            controller: this.webController
          })
          .width('100%')
          .height('100%')
          .backgroundColor(this.themeBg)
      } else if (this.isPdf()) {
        // ─── PDF 走 HarmonyOS 原生 @kit.PDFKit ──────────────────────────────
        // 直接渲染 PdfView 组件,PdfController 已通过 loadDocument(本地 PDF 路径) 加载,
        // registerPageChangedListener 已接管翻页进度上报。完全无 H5、无 base64、无 webview。
        if (this.pdfDocLoaded) {
          PdfView({
            controller: this.pdfController,
            pageFit: pdfService.PageFit.FIT_WIDTH,
            pageLayout: pdfService.PageLayout.LAYOUT_SINGLE,
            isContinuous: false
          })
            .width('100%')
            .height('100%')
            .backgroundColor(this.themeBg)
        } else {
          // 加载未完成:isLoading/error 分支已处理,这里是兜底占位
          Text('正在准备 PDF 阅读器...')
            .fontSize(fontSizes.md)
            .fontColor(this.themeText)
            .width('100%')
            .height('100%')
            .textAlign(TextAlign.Center)
            .backgroundColor(this.themeBg)
        }
      }

      // 顶部工具栏
      if (this.showBars && !this.isLoading && !this.error) {
        Row() {
          Row() {
            AppIcon({ kind: AppIconKind.ArrowBack, iconSize: 22, iconColor: this.themeBarText })
          }
          .width(40)
          .height(40)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.handleBack();
          })
          Text(this.chapters[this.currentChapter]?.title ?? this.book.title)
            .fontSize(fontSizes.md)
            .fontColor(this.themeBarText)
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .margin({ left: spacing.sm })
          Row() {
            AppIcon({ kind: AppIconKind.MoreVertical, iconSize: 22, iconColor: this.themeBarText })
          }
          .width(40)
          .height(40)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.showSettings = true;
          })
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, top: this.safeAreaTop + spacing.sm, bottom: spacing.sm })
        .backgroundColor(this.themeBarBg)
        .border({ width: { bottom: 1 }, color: this.themeBorder })
        .alignItems(VerticalAlign.Center)
      }

      // 底部工具栏
      if (this.showBars && !this.isLoading && !this.error) {
        Row() {
          // 目录
          Column() {
            AppIcon({ kind: AppIconKind.Book, iconSize: 22, iconColor: this.themeBarText })
            Text('目录').fontSize(10).fontColor(this.themeBarText).margin({ top: 2 })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Center)
          .onClick((): void => {
            this.showChapters = true;
          })

          // 进度
          Text(this.isPdf() ? `${this.pdfCurrentPage}/${Math.max(1, this.pdfTotalPages)}` : `${Math.round(this.readingProgress)}%`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeBarText)
            .layoutWeight(1)
            .textAlign(TextAlign.Center)

          // 上一章
          Column() {
            AppIcon({ kind: AppIconKind.ArrowBack, iconSize: 22, iconColor: this.themeBarText })
            Text('上一章').fontSize(10).fontColor(this.themeBarText).margin({ top: 2 })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Center)
          .onClick((): void => {
            this.handlePrevPage();
          })

          // 下一章
          Column() {
            AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 22, iconColor: this.themeBarText })
            Text('下一章').fontSize(10).fontColor(this.themeBarText).margin({ top: 2 })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Center)
          .onClick((): void => {
            this.handleNextPage();
          })

          // TTS
          Column() {
            AppIcon({ kind: AppIconKind.Headset, iconSize: 22, iconColor: this.themeBarText })
            Text('听书').fontSize(10).fontColor(this.themeBarText).margin({ top: 2 })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Center)
          .onClick((): void => {
            this.handleTTS();
          })

          // 自动滚动(仅滚动模式)
          if (this.readingMode === 'scroll') {
            Column() {
              AppIcon({
                kind: this.autoScrollEnabled ? AppIconKind.Play : AppIconKind.Play,
                iconSize: 22,
                iconColor: this.autoScrollEnabled ? '#4A90D9' : this.themeBarText
              })
              Text(this.autoScrollEnabled ? '停止' : '自动').fontSize(10)
                .fontColor(this.autoScrollEnabled ? '#4A90D9' : this.themeBarText).margin({ top: 2 })
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Center)
            .onClick((): void => {
              this.handleToggleAutoScroll();
            })
          }

          // 设置
          Column() {
            AppIcon({ kind: AppIconKind.MoreVertical, iconSize: 22, iconColor: this.themeBarText })
            Text('设置').fontSize(10).fontColor(this.themeBarText).margin({ top: 2 })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Center)
          .onClick((): void => {
            this.showSettings = true;
          })
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: this.safeAreaBottom + spacing.sm })
        .backgroundColor(this.themeBarBg)
        .border({ width: { top: 1 }, color: this.themeBorder })
        .position({ y: '100%' })
        .translate({ y: '-100%' })
      }

      // 设置面板
      if (this.showSettings) {
        this.SettingsPanel()
      }

      // 目录抽屉
      if (this.showChapters) {
        this.ChaptersPanel()
      }

      // 划线 actionSheet
      if (this.showActionSheet) {
        this.ActionSheet()
      }

      // 笔记 modal
      if (this.showNoteModal) {
        this.NoteModal()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }

  // ─── 设置面板 ─────────────────────────────────────────────────

  @Builder
  private SettingsPanel() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showSettings = false;
        })

      Column() {
        Text('阅读设置')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themeBarText)
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: spacing.md, bottom: spacing.md })

        // 阅读方式
        Row() {
          Text('阅读方式').fontSize(fontSizes.md).fontColor(this.themeBarText).width(80)
          Row({ space: spacing.sm }) {
            Text('上下滚动')
              .fontSize(fontSizes.sm)
              .fontColor(this.readingMode === 'scroll' ? '#4A90D9' : this.themeBarText)
              .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.readingMode === 'scroll' ? '#4A90D9' : this.themeBorder })
              .borderRadius(borderRadius.md)
              .backgroundColor(this.readingMode === 'scroll' ? '#4A90D920' : 'transparent')
              .onClick((): void => {
                this.readerStore.setReadingMode('scroll');
              })
            Text('左右翻页')
              .fontSize(fontSizes.sm)
              .fontColor(this.readingMode === 'page' ? '#4A90D9' : this.themeBarText)
              .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.readingMode === 'page' ? '#4A90D9' : this.themeBorder })
              .borderRadius(borderRadius.md)
              .backgroundColor(this.readingMode === 'page' ? '#4A90D920' : 'transparent')
              .onClick((): void => {
                this.readerStore.setReadingMode('page');
              })
          }
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)

        // 阅读底色
        Row() {
          Text('阅读底色').fontSize(fontSizes.md).fontColor(this.themeBarText).width(80)
          Row({ space: spacing.sm }) {
            ForEach(READER_THEMES, (tm: ReaderTheme) => {
              Text(tm.label)
                .fontSize(fontSizes.sm)
                .fontColor(tm.text)
                .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
                .backgroundColor(tm.bg)
                .border({ width: 1, color: this.readerMode === tm.key ? '#4A90D9' : this.themeBorder })
                .borderRadius(borderRadius.md)
                .onClick((): void => {
                  this.readerStore.setMode(tm.key);
                })
            }, (tm: ReaderTheme): string => tm.key)
          }
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)

        // 字体
        Row() {
          Text('字体').fontSize(fontSizes.md).fontColor(this.themeBarText).width(80)
          Row({ space: spacing.sm }) {
            ForEach(FONT_OPTIONS, (f: FontOption) => {
              Text(f.label)
                .fontSize(fontSizes.sm)
                .fontColor(this.fontFamily === f.value ? '#4A90D9' : this.themeBarText)
                .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
                .border({ width: 1, color: this.fontFamily === f.value ? '#4A90D9' : this.themeBorder })
                .borderRadius(borderRadius.md)
                .backgroundColor(this.fontFamily === f.value ? '#4A90D920' : 'transparent')
                .onClick((): void => {
                  this.readerStore.setFontFamily(f.value);
                })
            }, (f: FontOption): string => f.value)
          }
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)

        // 字体大小
        Row() {
          Text('字体大小').fontSize(fontSizes.md).fontColor(this.themeBarText).width(80)
          Row({ space: spacing.sm }) {
            Text('A-')
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .padding({ left: spacing.lg, right: spacing.lg, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.readerStore.setFontSize(Math.max(12, this.fontSize - 2));
              })
            Text(`${this.fontSize}px`)
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .width(60)
              .textAlign(TextAlign.Center)
            Text('A+')
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .padding({ left: spacing.lg, right: spacing.lg, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.readerStore.setFontSize(Math.min(32, this.fontSize + 2));
              })
          }
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)

        // 行间距
        Row() {
          Text('行间距').fontSize(fontSizes.md).fontColor(this.themeBarText).width(80)
          Row({ space: spacing.sm }) {
            Text('-')
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .padding({ left: spacing.xl, right: spacing.xl, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.readerStore.setLineHeight(Math.max(1, this.lineHeight - 0.2));
              })
            Text(this.lineHeight.toFixed(1))
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .width(60)
              .textAlign(TextAlign.Center)
            Text('+')
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .padding({ left: spacing.xl, right: spacing.xl, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.readerStore.setLineHeight(Math.min(3, this.lineHeight + 0.2));
              })
          }
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)

        // 页边距
        Row() {
          Text('页边距').fontSize(fontSizes.md).fontColor(this.themeBarText).width(80)
          Row({ space: spacing.sm }) {
            Text('-')
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .padding({ left: spacing.xl, right: spacing.xl, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.readerStore.setMargin(Math.max(8, this.pageMargin - 4));
              })
            Text(`${this.pageMargin}px`)
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .width(60)
              .textAlign(TextAlign.Center)
            Text('+')
              .fontSize(fontSizes.md)
              .fontColor(this.themeBarText)
              .padding({ left: spacing.xl, right: spacing.xl, top: spacing.sm, bottom: spacing.sm })
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                this.readerStore.setMargin(Math.min(48, this.pageMargin + 4));
              })
          }
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
        .alignItems(VerticalAlign.Center)

        // 自动翻页速度(仅滚动模式)
        if (this.readingMode === 'scroll') {
          Row() {
            Text('自动翻页速度').fontSize(fontSizes.md).fontColor(this.themeBarText).width(100)
            Row({ space: spacing.sm }) {
              Text('-')
                .fontSize(fontSizes.md)
                .fontColor(this.themeBarText)
                .padding({ left: spacing.xl, right: spacing.xl, top: spacing.sm, bottom: spacing.sm })
                .border({ width: 1, color: this.themeBorder })
                .borderRadius(borderRadius.md)
                .onClick((): void => {
                  this.readerStore.setAutoScrollSpeed(Math.max(1, this.autoScrollSpeed - 5));
                  this.webController.runJavaScript(generateAutoScrollSetSpeedJs(this.autoScrollSpeed));
                })
              Text(`${this.autoScrollSpeed}`)
                .fontSize(fontSizes.md)
                .fontColor(this.themeBarText)
                .width(40)
                .textAlign(TextAlign.Center)
              Text('+')
                .fontSize(fontSizes.md)
                .fontColor(this.themeBarText)
                .padding({ left: spacing.xl, right: spacing.xl, top: spacing.sm, bottom: spacing.sm })
                .border({ width: 1, color: this.themeBorder })
                .borderRadius(borderRadius.md)
                .onClick((): void => {
                  this.readerStore.setAutoScrollSpeed(Math.min(100, this.autoScrollSpeed + 5));
                  this.webController.runJavaScript(generateAutoScrollSetSpeedJs(this.autoScrollSpeed));
                })
            }
          }
          .width('100%')
          .padding({ left: spacing.md, right: spacing.md, bottom: spacing.md })
          .alignItems(VerticalAlign.Center)
        }

        Text('完成')
          .fontSize(fontSizes.md)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
          .width('100%')
          .textAlign(TextAlign.Center)
          .height(48)
          .backgroundColor('#4A90D9')
          .borderRadius(borderRadius.md)
          .margin({ left: spacing.md, right: spacing.md, top: spacing.md, bottom: spacing.xl })
          .onClick((): void => {
            this.showSettings = false;
          })
      }
      .width('100%')
      .backgroundColor(this.themeBarBg)
      .borderRadius({ topLeft: borderRadius.xl, topRight: borderRadius.xl })
      .padding({ bottom: this.safeAreaBottom })
    }
    .width('100%')
    .height('100%')
  }

  // ─── 目录抽屉 ─────────────────────────────────────────────────

  @Builder
  private ChaptersPanel() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showChapters = false;
        })

      Column() {
        Row() {
          Text('章节列表')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeBarText)
            .layoutWeight(1)
          AppIcon({ kind: AppIconKind.Close, iconSize: 24, iconColor: this.themeBarText })
            .onClick((): void => {
              this.showChapters = false;
            })
        }
        .width('100%')
        .padding(spacing.md)

        Scroll() {
          Column() {
            if (this.chapters.length === 0) {
              Text('暂无章节信息')
                .fontSize(fontSizes.md)
                .fontColor(this.themeBarText)
                .width('100%')
                .textAlign(TextAlign.Center)
                .padding(spacing.xl)
            } else {
              ForEach(this.chapters, (ch: ChapterListItem, idx: number) => {
                Row({ space: spacing.sm }) {
                  Text(`${idx + 1}`)
                    .fontSize(fontSizes.sm)
                    .fontColor(ch.index === this.currentChapter ? this.themeBarText : this.themeBarText + '80')
                    .width(32)
                  Text(ch.title)
                    .fontSize(fontSizes.md)
                    .fontColor(ch.index === this.currentChapter ? this.themeBarText : this.themeBarText + '80')
                    .fontWeight(ch.index === this.currentChapter ? FontWeight.Bold : FontWeight.Normal)
                    .layoutWeight(1)
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                  if (ch.index === this.currentChapter) {
                    AppIcon({ kind: AppIconKind.Book, iconSize: 16, iconColor: '#4A90D9' })
                  }
                }
                .width('100%')
                .padding({ top: spacing.sm, bottom: spacing.sm, left: spacing.md, right: spacing.md })
                .border({ width: { bottom: 1 }, color: this.themeBorder })
                .onClick((): void => {
                  this.handleChapterPress(ch.index);
                })
              }, (ch: ChapterListItem): string => String(ch.index))
            }
          }
          .width('100%')
        }
        .scrollBar(BarState.Off)
        .layoutWeight(1)
      }
      .width('100%')
      .height('70%')
      .backgroundColor(this.themeBarBg)
      .borderRadius({ topLeft: borderRadius.xl, topRight: borderRadius.xl })
      .padding({ bottom: this.safeAreaBottom })
    }
    .width('100%')
    .height('100%')
  }

  // ─── 划线 actionSheet ─────────────────────────────────────────

  @Builder
  private ActionSheet() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.3)')
        .onClick((): void => {
          this.showActionSheet = false;
          this.selectedText = '';
        })

      Column() {
        Text(this.selectedText.length > 60 ? this.selectedText.substring(0, 60) + '...' : this.selectedText)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeBarText)
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding(spacing.md)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Row({ space: spacing.sm }) {
          AppIcon({ kind: AppIconKind.DocText, iconSize: 22, iconColor: '#4A90D9' })
          Text('记笔记').fontSize(fontSizes.md).fontColor(this.themeBarText)
        }
        .width('100%')
        .padding(spacing.md)
        .onClick((): void => {
          this.handleCreateNote();
        })

        Row({ space: spacing.sm }) {
          AppIcon({ kind: AppIconKind.Plus, iconSize: 22, iconColor: '#FF9800' })
          Text('高亮').fontSize(fontSizes.md).fontColor(this.themeBarText)
        }
        .width('100%')
        .padding(spacing.md)
        .onClick((): void => {
          void this.handleCreateHighlight();
        })

        Text('取消')
          .fontSize(fontSizes.md)
          .fontColor('#EF4444')
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding(spacing.md)
          .onClick((): void => {
            this.showActionSheet = false;
            this.selectedText = '';
          })
      }
      .width('100%')
      .backgroundColor(this.themeBarBg)
      .borderRadius({ topLeft: borderRadius.xl, topRight: borderRadius.xl })
      .padding({ bottom: this.safeAreaBottom + spacing.lg })
    }
    .width('100%')
    .height('100%')
  }

  // ─── 笔记 modal ───────────────────────────────────────────────

  @Builder
  private NoteModal() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showNoteModal = false;
          this.noteText = '';
        })

      Column() {
        Text('添加笔记')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themeBarText)
          .width('100%')
          .padding({ bottom: spacing.md })

        Column() {
          Text('选中文本:')
            .fontSize(fontSizes.sm)
            .fontColor(this.themeBarText + '80')
            .width('100%')
            .textAlign(TextAlign.Start)
          Text(this.selectedText)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeBarText)
            .width('100%')
            .textAlign(TextAlign.Start)
            .maxLines(4)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .margin({ top: spacing.xs })
        }
        .width('100%')
        .padding(spacing.sm)
        .backgroundColor(this.themeBg)
        .borderRadius(borderRadius.md)
        .margin({ bottom: spacing.md })

        TextArea({ placeholder: '输入笔记内容...', text: this.noteText })
          .placeholderColor(this.themeBarText + '80')
          .fontColor(this.themeBarText)
          .height(120)
          .padding(spacing.md)
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .backgroundColor(this.themeBg)
          .width('100%')
          .onChange((v: string): void => {
            this.noteText = v;
          })

        Row({ space: spacing.md }) {
          Text('取消')
            .fontSize(fontSizes.md)
            .fontColor(this.themeBarText + '80')
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
            .height(44)
            .border({ width: 1, color: this.themeBorder })
            .borderRadius(borderRadius.md)
            .onClick((): void => {
              this.showNoteModal = false;
              this.noteText = '';
            })
          if (this.isSavingNote) {
            LoadingProgress()
              .width(24)
              .height(24)
              .color('#FFFFFF')
              .layoutWeight(1)
          } else {
            Text('保存')
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Bold)
              .fontColor('#FFFFFF')
              .layoutWeight(1)
              .textAlign(TextAlign.Center)
              .height(44)
              .backgroundColor('#4A90D9')
              .borderRadius(borderRadius.md)
              .enabled(this.noteText.trim().length > 0)
              .onClick((): void => {
                void this.handleSaveNote();
              })
          }
        }
        .width('100%')
        .margin({ top: spacing.md })
      }
      .width('85%')
      .padding(spacing.lg)
      .backgroundColor(this.themeBarBg)
      .borderRadius(borderRadius.xl)
      .shadow({ radius: 16, color: 'rgba(0,0,0,0.25)', offsetY: 8 })
    }
    .width('100%')
    .height('100%')
  }
}
