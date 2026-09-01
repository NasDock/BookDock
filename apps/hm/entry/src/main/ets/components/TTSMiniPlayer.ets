// [API 23+] components/TTSMiniPlayer.ets — 全局底部 TTS 迷你播放器
// 显隐由 MainTabNavigator 控制：阅读/TTS/设置页始终隐藏，其他页有播放才显示。
// 数据联动 TTSPlayer 单例：封面/书名/章节/播放暂停/进度条/上下段。
import { promptAction } from '@kit.ArkUI';
import { getTheme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from './AppIcon';
import { TTSPlayer, TTSPlayerState } from '../player/TTSPlayer';
import { getApiClient } from '../network/ApiClient';
import { pushRoute, RouteName, BookParams } from '../router/AppRouter';
import { Book } from '../model/ApiModels';

@Component
export struct TTSMiniPlayer {
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themePrimary: string = '#4A90D9';
  @State private themeBorder: string = '#E5E7EB';

  // ─── TTSPlayer 状态镜像（@State 驱动 UI 刷新）─────────────────────────
  @State private isPlaying: boolean = false;
  @State private bookTitle: string = '';
  @State private chapterTitle: string = '';
  @State private coverUrl: string = '';
  @State private positionMs: number = 0;
  @State private durationMs: number = 0;
  @State private currentParagraph: number = 0;
  @State private totalParagraphs: number = 0;

  private player: TTSPlayer = TTSPlayer.shared();
  private stateUnsub: (() => void) | null = null;
  private progressUnsub: (() => void) | null = null;

  aboutToAppear(): void {
    const t = getTheme(false);
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themePrimary = t.colors.primary;
    this.themeBorder = t.colors.border;
    this.syncFromPlayer();
    this.subscribePlayer();
  }

  aboutToDisappear(): void {
    this.unsubscribePlayer();
  }

  // ─── 从 TTSPlayer 同步状态到 @State ───────────────────────────────────
  private syncFromPlayer(): void {
    this.isPlaying = this.player.state === TTSPlayerState.PLAYING;
    this.bookTitle = this.player.bookTitle;
    this.chapterTitle = this.player.chapterTitle;
    this.coverUrl = this.player.coverUrl;
    this.positionMs = this.player.positionMs;
    this.durationMs = this.player.durationMs;
    this.currentParagraph = this.player.getCurrentParagraphIndex();
    this.totalParagraphs = this.player.totalParagraphs;
  }

  // ─── 订阅 TTSPlayer 回调（状态 + 进度 + 段落切换）──────────────────────
  private subscribePlayer(): void {
    // 保存旧回调（TTSScreen 可能已注册），链式调用
    const prevStateCb = this.player.onStateChange;
    this.player.onStateChange = (state: TTSPlayerState, errorMsg?: string): void => {
      this.isPlaying = state === TTSPlayerState.PLAYING;
      prevStateCb?.(state, errorMsg);
    };

    const prevProgressCb = this.player.onProgressUpdate;
    this.player.onProgressUpdate = (positionMs: number, durationMs: number): void => {
      this.positionMs = positionMs;
      this.durationMs = durationMs;
      prevProgressCb?.(positionMs, durationMs);
    };

    const prevParaCb = this.player.onParagraphChange;
    this.player.onParagraphChange = (newIndex: number): void => {
      this.currentParagraph = newIndex;
      prevParaCb?.(newIndex);
    };

    // 记录取消函数（恢复旧回调）
    this.stateUnsub = (): void => {
      this.player.onStateChange = prevStateCb;
    };
    this.progressUnsub = (): void => {
      this.player.onProgressUpdate = prevProgressCb;
    };
  }

  private unsubscribePlayer(): void {
    this.stateUnsub?.();
    this.progressUnsub?.();
    this.stateUnsub = null;
    this.progressUnsub = null;
  }

  // ─── 整体进度（对齐 mobile overallProgress）───────────────────────────
  private overallProgress(): number {
    if (this.totalParagraphs === 0) {
      return 0;
    }
    const paraProgress: number = this.durationMs > 0 ? this.positionMs / this.durationMs : 0;
    return (this.currentParagraph + paraProgress) / this.totalParagraphs;
  }

  // ─── 播放/暂停 ────────────────────────────────────────────────────────
  private async handlePlayPause(): Promise<void> {
    if (this.isPlaying) {
      await this.player.pause();
    } else {
      await this.player.play();
    }
  }

  // ─── 上一段/下一段（MiniPlayer 只切索引，播放由 TTSScreen 的 onParagraphChange 联动）──
  private handleSkipBack(): void {
    // MiniPlayer 不直接播，展开到 TTSScreen 操作
    this.handleExpand();
  }

  private handleSkipForward(): void {
    this.handleExpand();
  }

  // ─── 点击展开到 TTSScreen（对齐 mobile handleExpand）────────────────────
  private handleExpand(): void {
    const bookId: string = this.player.currentBookId;
    if (!bookId) {
      return;
    }
    // 构造最小 Book 对象（TTSScreen 只需要 id 拉数据）
    const book: Book = {
      id: bookId,
      title: this.bookTitle,
      coverUrl: this.coverUrl
    } as Book;
    const p: BookParams = { book: book };
    pushRoute(RouteName.TTS_SCREEN, p);
  }

  build() {
    Column() {
      // ─── 顶部进度条（对齐 mobile progressBar）─────────────────────────
      Row()
        .width(`${this.overallProgress() * 100}%`)
        .height(2)
        .backgroundColor(this.themePrimary)

      // ─── 主体内容 ────────────────────────────────────────────────────
      Row() {
        // 封面（点击展开）
        Stack() {
          if (this.coverUrl) {
            Image(getApiClient().toAbsoluteUrl(this.coverUrl))
              .width(36)
              .height(48)
              .objectFit(ImageFit.Cover)
              .borderRadius(borderRadius.sm)
          } else {
            Column() {
              Text((this.bookTitle || 'T').charAt(0))
                .fontSize(fontSizes.lg)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.themePrimary)
            }
            .width(36)
            .height(48)
            .backgroundColor(this.themePrimary + '20')
            .borderRadius(borderRadius.sm)
            .justifyContent(FlexAlign.Center)
            .alignItems(HorizontalAlign.Center)
          }
        }
        .margin({ right: spacing.sm })
        .onClick((): void => {
          this.handleExpand();
        })

        // 信息区（点击展开）
        Column() {
          Text(this.chapterTitle || '未知章节')
            .fontSize(fontSizes.sm)
            .fontColor(this.themeText)
            .fontWeight(FontWeight.Medium)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(this.bookTitle || '未知书籍')
            .fontSize(fontSizes.xs)
            .fontColor(this.themeTextSec)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
        .onClick((): void => {
          this.handleExpand();
        })

        // 控制区：上一段 / 播放暂停 / 下一段
        Row() {
          // 上一段（展开到 TTSScreen 操作）
          Row() {
            AppIcon({ kind: AppIconKind.ArrowBack, iconSize: 18, iconColor: this.themeText })
          }
          .width(32)
          .height(32)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.handleSkipBack();
          })

          // 播放/暂停
          Row() {
            AppIcon({
              kind: this.isPlaying ? AppIconKind.Pause : AppIconKind.Play,
              iconSize: 20,
              iconColor: this.themePrimary
            })
          }
          .width(36)
          .height(36)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            void this.handlePlayPause();
          })

          // 下一段（展开到 TTSScreen 操作）
          Row() {
            AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 18, iconColor: this.themeText })
          }
          .width(32)
          .height(32)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.handleSkipForward();
          })
        }
      }
      .width('100%')
      .padding({ left: spacing.md, right: spacing.md, top: spacing.xs, bottom: spacing.xs })
    }
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.lg)
    .border({ width: 1, color: this.themeBorder })
    .margin({ left: spacing.md, right: spacing.md, bottom: 56 + spacing.sm })
    .shadow({ radius: 8, color: 'rgba(0,0,0,0.1)', offsetY: 2 })
  }
}
