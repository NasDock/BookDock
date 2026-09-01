// [API 23+] screens/RecommendScreen.ets — 首页(推荐)
// 1:1 对齐 mobile RecommendScreen.tsx:
//   - 页面内搜索条(点击跳 Search)
//   - 继续阅读(横向滚动,带进度条,按 progress 降序)
//   - 为你推荐(响应式网格:>=700vp 5 列 / >=500vp 4 列 / 否则 3 列,右上角刷新按钮)
//   - 最近阅读(横向滚动,按 lastReadAt 降序,取前 5,显示日期)
//   - 下拉刷新同时刷 books + 推荐
//   - 无任何内容时显示空态
// 图标一律走 AppIcon(几何字符/SymbolGlyph),不用 emoji。
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { Book, RecommendationsResponse, ApiResponse } from '../model/ApiModels';
import { LibraryStore } from '../store/LibraryStore';
import { ApiClient, getApiClient } from '../network/ApiClient';
import { pushRoute, RouteName, BookParams } from '../router/AppRouter';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { display } from '@kit.ArkUI';

// 封面渐变底色(对齐 mobile getBookGradient 的第一色,ArkUI 暂不用渐变)
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

function formatDate(dateStr?: string): string {
  if (!dateStr) {
    return '—';
  }
  const d: Date = new Date(dateStr);
  const hh: string = d.getHours().toString().padStart(2, '0');
  const mm: string = d.getMinutes().toString().padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

// 推荐网格列数(对齐 mobile getRecColumns,单位 vp)
function getRecColumns(screenWidthVp: number): number {
  if (screenWidthVp >= 700) {
    return 5;
  }
  if (screenWidthVp >= 500) {
    return 4;
  }
  return 3;
}

// 网格占位骨架的个数(recLoading && recommended 为空时)
const SKELETON_COUNT: number = 6;
// 下拉刷新时推荐取数条数(对齐 mobile)
const REC_LIMIT: number = 12;

@Component
export struct RecommendScreen {
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themePrimary: string = '#4A90D9';

  @State private books: Book[] = [];
  @State private isLoading: boolean = false;
  @State private refreshing: boolean = false;
  @State private hasLoaded: boolean = false;

  @State private recommended: Book[] = [];
  @State private recLoading: boolean = false;

  // 滚动 >60vp 时头部显示搜索图标(对齐 mobile showHeaderSearch)
  @State private showHeaderSearch: boolean = false;

  private scroller: Scroller = new Scroller();

  // 首帧必须用真实屏幕宽度,onAreaChange 晚到会导致 getRecItemWidth 首帧用默认 360 算错列宽
  // Flex{wrap} 子项超宽换行后 width('100%') 封面会塌缩成字母大小
  @State private screenWidthVp: number = px2vp(display.getDefaultDisplaySync().width);

  private libraryStore: LibraryStore = LibraryStore.shared();
  private unsubscribeLib: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeLib = this.libraryStore.subscribe((): void => {
      this.syncFromStore();
    });
    this.syncFromStore();
    // 首次进入:有缓存静默刷新,无缓存显示 loading(对齐 mobile useFocusEffect)
    if (!this.hasLoaded) {
      this.hasLoaded = true;
      void this.libraryStore.fetchBooks();
    }
    void this.loadRecommendations();
  }

  aboutToDisappear(): void {
    if (this.unsubscribeLib) {
      this.unsubscribeLib();
    }
  }

  private applyTheme(): void {
    const t: Theme = getTheme(false);
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themePrimary = t.colors.primary;
  }

  private syncFromStore(): void {
    this.books = this.libraryStore.books;
    this.isLoading = this.libraryStore.isLoading;
  }

  // ─── 推荐数据 ──────────────────────────────────────────────
  private async loadRecommendations(): Promise<void> {
    this.recLoading = true;
    try {
      const api: ApiClient = getApiClient();
      const res: ApiResponse<RecommendationsResponse> = await api.getRecommendations(REC_LIMIT);
      if (res.success && res.data) {
        this.recommended = res.data.books;
      }
    } catch (err) {
      // 静默失败,对齐 mobile console.error
    } finally {
      this.recLoading = false;
    }
  }

  // ─── 下拉刷新:books + 推荐 同时刷(对齐 mobile handleRefresh) ─
  private async handleRefresh(): Promise<void> {
    this.refreshing = true;
    try {
      await this.libraryStore.fetchBooks();
      const api: ApiClient = getApiClient();
      const res: ApiResponse<RecommendationsResponse> = await api.getRecommendations(REC_LIMIT);
      if (res.success && res.data) {
        this.recommended = res.data.books;
      }
    } finally {
      this.refreshing = false;
    }
  }

  // ─── 继续阅读:0 < progress < 100,按进度降序 ────────────────
  private getInProgress(): Book[] {
    const list: Book[] = this.books.filter((b: Book): boolean => {
      const p: number = b.readingProgress ?? 0;
      return p > 0 && p < 100;
    });
    list.sort((a: Book, b: Book): number => (b.readingProgress ?? 0) - (a.readingProgress ?? 0));
    return list;
  }

  // ─── 最近阅读:有 lastReadAt,按时间倒序,取前 5 ──────────────
  private getRecentlyRead(): Book[] {
    const list: Book[] = this.books.filter((b: Book): boolean => (b.lastReadAt ?? '').length > 0);
    list.sort((a: Book, b: Book): number => {
      const ta: number = new Date(a.lastReadAt ?? '').getTime();
      const tb: number = new Date(b.lastReadAt ?? '').getTime();
      return tb - ta;
    });
    return list.slice(0, 5);
  }

  private getRecItemWidth(): number {
    const cols: number = getRecColumns(this.screenWidthVp);
    const gap: number = 12;
    return (this.screenWidthVp - spacing.md * 2 - gap * (cols - 1)) / cols;
  }

  private hasContent(): boolean {
    return this.getInProgress().length > 0
      || this.getRecentlyRead().length > 0
      || this.recommended.length > 0;
  }

  private handleBookPress(book: Book): void {
    const params: BookParams = { book };
    pushRoute(RouteName.BOOK_DETAILS, params);
  }

  private handleSearchPress(): void {
    pushRoute(RouteName.SEARCH);
  }

  build() {
    Column() {
      // 头部:标题 + 动态搜索图标(滚动 >60vp 才显示,对齐 mobile headerRight)
      // 固定高度 56vp,搜索图标出现/消失不撑高 Row(对齐 mobile headerStyle.height)
      Row() {
        Text('推荐')
          .fontSize(fontSizes.xl)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themeText)
          .layoutWeight(1)
        if (this.showHeaderSearch) {
          Row() {
            AppIcon({ kind: AppIconKind.Search, iconSize: 22, iconColor: this.themeText })
          }
          .width(40)
          .height(40)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.handleSearchPress();
          })
        }
      }
      .width('100%')
      .height(56)
      .padding({ left: spacing.md, right: spacing.md })

      if (this.isLoading && this.books.length === 0) {
        // 首次无缓存数据时显示 loading
        Column() {
          LoadingProgress().width(48).height(48).color(this.themePrimary)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else {
        Refresh({ refreshing: this.refreshing }) {
          Scroll(this.scroller) {
            Column() {
              // 页面内搜索条
              // width('100%') 会抵消 margin,不写 width 让 margin 生效
              Row({ space: spacing.sm }) {
                AppIcon({ kind: AppIconKind.Search, iconSize: 18, iconColor: this.themeTextSec })
                Text('搜索书名、作者或简介...')
                  .fontSize(fontSizes.md)
                  .fontColor(this.themeTextSec)
                  .layoutWeight(1)
              }
              .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
              .backgroundColor(this.themeSurface)
              .borderRadius(borderRadius.lg)
              .margin({ left: spacing.md, right: spacing.md, top: spacing.md, bottom: spacing.sm })
              .onClick((): void => {
                this.handleSearchPress();
              })

              if (!this.hasContent()) {
                // 空态
                Column() {
                  AppIcon({ kind: AppIconKind.Book, iconSize: 64, iconColor: this.themeTextSec })
                  Text('开始阅读书籍后，这里会显示你的阅读推荐')
                    .fontSize(fontSizes.md)
                    .fontColor(this.themeTextSec)
                    .textAlign(TextAlign.Center)
                    .margin({ top: spacing.md })
                }
                .width('100%')
                .alignItems(HorizontalAlign.Center)
                .justifyContent(FlexAlign.Center)
                .padding({ top: 120, left: spacing.xl, right: spacing.xl })
              } else {
                Column() {
                  // 继续阅读
                  if (this.getInProgress().length > 0) {
                    this.SectionHeader('继续阅读', false)
                    Scroll() {
                      Row({ space: spacing.sm }) {
                        ForEach(this.getInProgress(), (book: Book) => {
                          this.ContinueCard(book)
                        }, (book: Book): string => book.id)
                      }
                      .padding({ left: spacing.md, right: spacing.md })
                    }
                    .scrollable(ScrollDirection.Horizontal)
                    .scrollBar(BarState.Off)
                    .align(Alignment.Start)
                    .width('100%')
                  }

                  // 为你推荐
                  if (this.recommended.length > 0 || this.recLoading) {
                    this.SectionHeader('为你推荐', true)
                    if (this.recLoading && this.recommended.length === 0) {
                      // 骨架:6 个 loading 占位
                      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
                        ForEach(this.buildSkeleton(), (_n: number) => {
                          Column() {
                            LoadingProgress().width(24).height(24).color(this.themePrimary)
                          }
                          .width(this.getRecItemWidth())
                          .height(this.getRecItemWidth() * 1.5)
                          .borderRadius(borderRadius.md)
                          .backgroundColor(this.themeSurface)
                          .justifyContent(FlexAlign.Center)
                          .alignItems(HorizontalAlign.Center)
                          .margin({ bottom: spacing.sm })
                        }, (n: number): string => n.toString())
                      }
                      .padding({ left: spacing.md, right: spacing.md })
                    } else {
                      Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
                        ForEach(this.recommended, (book: Book, idx: number) => {
                          // 每行最后一张不加 right margin,否则会贴到屏幕右边缘
                          this.RecCard(book, (idx + 1) % getRecColumns(this.screenWidthVp) === 0)
                        }, (book: Book): string => book.id)
                      }
                      .padding({ left: spacing.md, right: spacing.md })
                    }
                  }

                  // 最近阅读
                  if (this.getRecentlyRead().length > 0) {
                    this.SectionHeader('最近阅读', false)
                    Scroll() {
                      Row({ space: spacing.sm }) {
                        ForEach(this.getRecentlyRead(), (book: Book) => {
                          this.RecentCard(book)
                        }, (book: Book): string => book.id)
                      }
                      .padding({ left: spacing.md, right: spacing.md })
                    }
                    .scrollable(ScrollDirection.Horizontal)
                    .scrollBar(BarState.Off)
                    .align(Alignment.Start)
                    .width('100%')
                  }
                }
                .width('100%')
                .padding({ top: spacing.sm, bottom: spacing.xl })
              }
            }
            .width('100%')
          }
          .scrollBar(BarState.Off)
          .width('100%')
          .height('100%')
          .onScroll((): void => {
            // 对齐 mobile handleScroll: y > 60 时头部显示搜索图标
            const y: number = this.scroller.currentOffset().yOffset;
            this.showHeaderSearch = y > 60;
          })
        }
        .onRefreshing((): void => {
          void this.handleRefresh();
        })
        .layoutWeight(1)
        .width('100%')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
    // 不用 onAreaChange:首帧晚到会覆盖 display.getDefaultDisplaySync() 的正确值
    // display.getDefaultDisplaySync() 在首帧就是真实屏幕宽,已够响应式(折叠屏展开不实时跟,可接受)
  }

  // ─── 骨架序号数组(build() 内禁 const,抽方法) ─────────────
  private buildSkeleton(): number[] {
    const arr: number[] = [];
    for (let i = 0; i < SKELETON_COUNT; i++) {
      arr.push(i);
    }
    return arr;
  }

  @Builder
  SectionHeader(title: string, withRefresh: boolean) {
    Row() {
      Text(title)
        .fontSize(fontSizes.lg)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .layoutWeight(1)
      if (withRefresh) {
        AppIcon({ kind: AppIconKind.Refresh, iconSize: 18, iconColor: this.themePrimary })
          .opacity(this.recLoading ? 0.4 : 1)
          .onClick((): void => {
            if (!this.recLoading) {
              void this.handleRefresh();
            }
          })
      }
    }
    .width('100%')
    .padding({ left: spacing.md, right: spacing.md })
    .margin({ top: spacing.lg, bottom: spacing.sm })
  }

  // 继续阅读卡片:封面 + 进度条 + 已读百分比
  @Builder
  ContinueCard(book: Book) {
    Column() {
      Stack() {
        if (book.coverUrl) {
          Image(getApiClient().toAbsoluteUrl(book.coverUrl))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Cover)
        } else {
          Column() {
            Text(book.title.charAt(0))
              .fontSize(28)
              .fontWeight(FontWeight.Bold)
              .fontColor('#FFFFFF')
          }
          .width('100%')
          .height('100%')
          .backgroundColor(getBookGradientStart(book.title))
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        }
        // 进度条(封面底部,显式左对齐避免 Column 默认居中导致的"中间向两边"视觉)
        Column() {
          Column()
            .width(`${book.readingProgress ?? 0}%`)
            .height('100%')
            .backgroundColor(this.themePrimary)
        }
        .width('100%')
        .height(3)
        .backgroundColor('#4DFFFFFF')
        .alignItems(HorizontalAlign.Start)
        .position({ x: 0, y: '97%' })
      }
      .width(110)
      .height(110 * 1.5)
      .borderRadius(borderRadius.md)
      .clip(true)

      Text(book.title)
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: spacing.xs })
        .width('100%')
      Text(`已读 ${book.readingProgress ?? 0}%`)
        .fontSize(fontSizes.xs)
        .fontColor(this.themeTextSec)
        .margin({ top: 2 })
        .width('100%')
    }
    .width(110)
    .alignItems(HorizontalAlign.Start)
    .onClick((): void => {
      this.handleBookPress(book);
    })
  }

  // 为你推荐卡片:封面宽高写死(aspectRatio 不可靠,会塌缩成字母大小) + 标题 + 作者
  // isLastInRow: 每行最后一张不加 right margin,避免挤出右边界
  @Builder
  RecCard(book: Book, isLastInRow: boolean) {
    Column() {
      Stack() {
        if (book.coverUrl) {
          Image(getApiClient().toAbsoluteUrl(book.coverUrl))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Cover)
        } else {
          Column() {
            Text(book.title.charAt(0))
              .fontSize(28)
              .fontWeight(FontWeight.Bold)
              .fontColor('#FFFFFF')
          }
          .width('100%')
          .height('100%')
          .backgroundColor(getBookGradientStart(book.title))
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        }
      }
      .width(this.getRecItemWidth())
      .height(this.getRecItemWidth() * 1.5)
      .borderRadius(borderRadius.md)
      .clip(true)
      .backgroundColor(this.themeSurface)

      Text(book.title)
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: spacing.xs })
        .width('100%')
      Text(book.author || '未知作者')
        .fontSize(fontSizes.xs)
        .fontColor(this.themeTextSec)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: 2 })
        .width('100%')
    }
    .width(this.getRecItemWidth())
    .alignItems(HorizontalAlign.Start)
    .margin({ bottom: spacing.sm, right: isLastInRow ? 0 : 12 })
    .onClick((): void => {
      this.handleBookPress(book);
    })
  }

  // 最近阅读卡片:封面 + 标题 + 日期
  @Builder
  RecentCard(book: Book) {
    Column() {
      Stack() {
        if (book.coverUrl) {
          Image(getApiClient().toAbsoluteUrl(book.coverUrl))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Cover)
        } else {
          Column() {
            Text(book.title.charAt(0))
              .fontSize(28)
              .fontWeight(FontWeight.Bold)
              .fontColor('#FFFFFF')
          }
          .width('100%')
          .height('100%')
          .backgroundColor(getBookGradientStart(book.title))
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        }
      }
      .width(110)
      .height(110 * 1.5)
      .borderRadius(borderRadius.md)
      .clip(true)

      Text(book.title)
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: spacing.xs })
        .width('100%')
      Text(formatDate(book.lastReadAt))
        .fontSize(fontSizes.xs)
        .fontColor(this.themeTextSec)
        .margin({ top: 2 })
        .width('100%')
    }
    .width(110)
    .alignItems(HorizontalAlign.Start)
    .onClick((): void => {
      this.handleBookPress(book);
    })
  }
}
