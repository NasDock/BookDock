// [API 23+] screens/LibraryScreen.ets — P2 阶段实现
// 1:1 对齐 mobile LibraryScreen.tsx:搜索条 + 格式筛选 + 状态筛选 + 网格 + 回顶按钮
// 视觉/布局/筛选逻辑全部照搬,ArkUI 重写。
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { Book } from '../model/ApiModels';
import { LibraryStore } from '../store/LibraryStore';
import { getApiClient } from '../network/ApiClient';
import { pushRoute, RouteName, BookParams } from '../router/AppRouter';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { promptAction } from '@kit.ArkUI';

const FORMATS: string[] = ['all', 'txt', 'epub', 'pdf', 'mobi'];
const STATUSES: string[] = ['all', 'unread', 'reading', 'completed'];

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

function getStatusLabel(progress: number): string {
  if (progress === 0) return '未读';
  if (progress >= 100) return '已读完';
  return '在读';
}

// 统计返回结构(替代 inline 类型注解, ArkTS 严格模式)
export interface LibraryStats {
  total: number;
  completed: number;
  reading: number;
  unread: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k: number = 1024;
  const sizes: string[] = ['B', 'KB', 'MB', 'GB'];
  const i: number = Math.floor(Math.log(bytes) / Math.log(k));
  const val: number = bytes / Math.pow(k, i);
  return val.toFixed(1) + ' ' + sizes[i];
}

@Component
export struct LibraryScreen {
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';

  @State private books: Book[] = [];
  @State private isLoading: boolean = false;
  @State private error: string | null = null;
  @State private refreshing: boolean = false;

  @State private filterFormat: string = 'all';
  @State private filterStatus: string = 'all';

  @State private showScrollTop: boolean = false;
  // 滚动 >60vp 时头部显示搜索图标(对齐 mobile headerRight 动态显示)
  @State private showHeaderSearch: boolean = false;

  private libraryStore: LibraryStore = LibraryStore.shared();
  private unsubscribeLib: (() => void) | null = null;
  private scroller: Scroller = new Scroller();

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeLib = this.libraryStore.subscribe((): void => {
      this.syncFromStore();
    });
    this.syncFromStore();
    void this.libraryStore.load();
    void this.libraryStore.fetchBooks();
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
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
  }

  private syncFromStore(): void {
    this.books = this.libraryStore.books;
    this.isLoading = this.libraryStore.isLoading;
    this.error = this.libraryStore.error;
  }

  // ─── 筛选 ──────────────────────────────────────────────────
  private getFilteredBooks(): Book[] {
    let result: Book[] = [...this.books];
    if (this.filterFormat !== 'all') {
      result = result.filter((b: Book): boolean => b.fileType === this.filterFormat);
    }
    if (this.filterStatus !== 'all') {
      result = result.filter((b: Book): boolean => {
        const p: number = b.readingProgress ?? 0;
        if (this.filterStatus === 'unread') return p === 0;
        if (this.filterStatus === 'reading') return p > 0 && p < 100;
        if (this.filterStatus === 'completed') return p >= 100;
        return true;
      });
    }
    // 排序
    const sortBy: string = this.libraryStore.sortBy;
    const sortOrder: string = this.libraryStore.sortOrder;
    result.sort((a: Book, b: Book): number => {
      let cmp: number = 0;
      if (sortBy === 'title') {
        cmp = (a.title ?? '').localeCompare(b.title ?? '');
      } else if (sortBy === 'author') {
        cmp = (a.author ?? '').localeCompare(b.author ?? '');
      } else if (sortBy === 'lastReadAt') {
        cmp = (a.lastReadAt ?? '').localeCompare(b.lastReadAt ?? '');
      } else {
        cmp = (a.addedAt ?? '').localeCompare(b.addedAt ?? '');
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return result;
  }

  private getStats(): LibraryStats {
    const total: number = this.books.length;
    let completed: number = 0;
    let reading: number = 0;
    for (const b of this.books) {
      const p: number = b.readingProgress ?? 0;
      if (p >= 100) {
        completed++;
      } else if (p > 0) {
        reading++;
      }
    }
    const stats: LibraryStats = { total, completed, reading, unread: total - completed - reading };
    return stats;
  }

  private handleBookPress(book: Book): void {
    const params: BookParams = { book };
    pushRoute(RouteName.BOOK_DETAILS, params);
  }

  private handleSearchPress(): void {
    pushRoute(RouteName.SEARCH);
  }

  private async handleRefresh(): Promise<void> {
    this.refreshing = true;
    await this.libraryStore.fetchBooks();
    this.refreshing = false;
    promptAction.showToast({ message: '已刷新', duration: 1500 });
  }

  private scrollToTop(): void {
    this.scroller.scrollTo({ xOffset: 0, yOffset: 0, animation: true });
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Column() {
        // 头部:标题 + 动态搜索图标(滚动 >60vp 才显示,对齐 mobile headerRight)
        // 固定高度 56vp,搜索图标出现/消失不撑高 Row(对齐 mobile headerStyle.height)
        Row() {
          Text('我的书仓')
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

        // 搜索条(点击跳搜索页)
        Row() {
          AppIcon({ kind: AppIconKind.Search, iconSize: 16, iconColor: this.themeTextSec })
            .margin({ right: spacing.sm })
          Text('搜索书名、作者或简介...')
            .fontSize(fontSizes.md)
            .fontColor(this.themeTextSec)
            .layoutWeight(1)
        }
        .width('90%')
        .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.lg)
        .margin({ top: spacing.md })
        .onClick((): void => {
          this.handleSearchPress();
        })

        // 格式筛选
        // ArkUI Scroll 默认内容居中(align: Center),筛选行必须显式 Start 左对齐
        Scroll() {
          Row({ space: spacing.sm }) {
            ForEach(FORMATS, (fmt: string) => {
              Text(fmt === 'all' ? '全部' : fmt.toUpperCase())
                .fontSize(fontSizes.xs)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.filterFormat === fmt ? '#FFFFFF' : this.themeTextSec)
                .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
                .backgroundColor(this.filterFormat === fmt ? this.themePrimary : this.themeSurface)
                .borderRadius(borderRadius.full)
                .onClick((): void => {
                  this.filterFormat = fmt;
                })
            }, (fmt: string): string => fmt)
          }
          .padding({ left: spacing.md, right: spacing.md })
        }
        .scrollable(ScrollDirection.Horizontal)
        .scrollBar(BarState.Off)
        .align(Alignment.Start)
        .margin({ top: spacing.sm })
        .width('100%')

        // 状态筛选(同格式筛选,Scroll 默认居中要显式 Start)
        Scroll() {
          Row({ space: spacing.sm }) {
            ForEach(STATUSES, (st: string) => {
              Text(st === 'all' ? '全部' : st === 'unread' ? '未读' : st === 'reading' ? '在读' : '已读完')
                .fontSize(fontSizes.xs)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.filterStatus === st ? '#FFFFFF' : this.themeTextSec)
                .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
                .backgroundColor(this.filterStatus === st ? this.themePrimary : this.themeSurface)
                .borderRadius(borderRadius.full)
                .onClick((): void => {
                  this.filterStatus = st;
                })
            }, (st: string): string => st)
          }
          .padding({ left: spacing.md, right: spacing.md })
        }
        .scrollable(ScrollDirection.Horizontal)
        .scrollBar(BarState.Off)
        .align(Alignment.Start)
        .margin({ top: spacing.sm })
        .width('100%')

        // 统计行
        Row() {
          Text(`共 ${this.getFilteredBooks().length} 本书`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .layoutWeight(1)
          Text(`${this.getStats().unread} 未读 · ${this.getStats().completed} 已读完 · `)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
          Text(`${this.getStats().reading} 在读`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themePrimary)
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, top: spacing.md, bottom: spacing.sm })

        // 主体:网格
        if (this.isLoading && this.books.length === 0) {
          Column() {
            LoadingProgress()
              .width(48)
              .height(48)
              .color(this.themePrimary)
            Text('Loading books...')
              .fontSize(fontSizes.md)
              .fontColor(this.themeTextSec)
              .margin({ top: spacing.md })
          }
          .layoutWeight(1)
          .width('100%')
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else if (this.getFilteredBooks().length === 0) {
          Column() {
            AppIcon({ kind: AppIconKind.Library, iconSize: 64, iconColor: this.themeTextSec })
            Text(this.error ?? '书库为空')
              .fontSize(fontSizes.lg)
              .fontWeight(FontWeight.Bold)
              .fontColor(this.themeText)
              .margin({ top: spacing.md })
            Text('下拉刷新')
              .fontSize(fontSizes.md)
              .fontColor(this.themeTextSec)
              .margin({ top: spacing.xs })
          }
          .layoutWeight(1)
          .width('100%')
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else {
          Refresh({ refreshing: this.refreshing }) {
            Grid(this.scroller) {
              ForEach(this.getFilteredBooks(), (book: Book) => {
                GridItem() {
                  this.BookGridItem(book)
                }
              }, (book: Book): string => book.id)
            }
            .columnsTemplate('1fr 1fr 1fr')
            .columnsGap(12)
            .rowsGap(12)
            .padding({ left: spacing.md, right: spacing.md, bottom: spacing.xl })
            .onScroll((): void => {
              const y: number = this.scroller.currentOffset().yOffset;
              this.showScrollTop = y > 400;
              // 对齐 mobile: 滚动 >60vp 时头部显示搜索图标
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

      // 回顶按钮
      if (this.showScrollTop) {
        Column() {
          AppIcon({ kind: AppIconKind.ArrowUp, iconSize: 20, iconColor: '#FFFFFF' })
        }
        .width(44)
        .height(44)
        .borderRadius(borderRadius.full)
        .backgroundColor(this.themePrimary)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .margin({ right: spacing.md, bottom: spacing.xl })
        .shadow({ radius: 4, color: '#33000000', offsetX: 0, offsetY: 2 })
        .onClick((): void => {
          this.scrollToTop();
        })
      }
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  BookGridItem(book: Book) {
    Column() {
      // 封面
      Stack() {
        if (book.coverUrl) {
          Image(getApiClient().toAbsoluteUrl(book.coverUrl))
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Cover)
            .borderRadius(borderRadius.lg)
        } else {
          Column() {
            Text(book.title.charAt(0))
              .fontSize(fontSizes.xxxl)
              .fontWeight(FontWeight.Bold)
              .fontColor('#FFFFFF')
          }
          .width('100%')
          .height('100%')
          .backgroundColor(getBookGradientStart(book.title))
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .borderRadius(borderRadius.lg)
        }

        // 格式徽标
        Text(((book.fileType as string) ?? (book.format as string) ?? 'unknown').toUpperCase())
          .fontSize(10)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
          .padding({ left: 6, right: 6, top: 2, bottom: 2 })
          .backgroundColor('#40FFFFFF')
          .borderRadius(borderRadius.sm)
          .margin({ top: spacing.xs, right: spacing.xs })
          .position({ x: '60%', y: 0 })

        // 进度条(0 < p < 100 才显示,显式左对齐避免 Column 默认居中导致的"中间向两边"视觉)
        if ((book.readingProgress ?? 0) > 0 && (book.readingProgress ?? 0) < 100) {
          Column() {
            Column()
              .width(`${book.readingProgress ?? 0}%`)
              .height('100%')
              .backgroundColor(this.themePrimary)
          }
          .width('100%')
          .height(4)
          .backgroundColor('#4DFFFFFF')
          .alignItems(HorizontalAlign.Start)
          .position({ x: 0, y: '92%' })
        }
      }
      .width('100%')
      .aspectRatio(0.75)
      .borderRadius(borderRadius.lg)

      // 信息
      Text(book.title)
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Bold)
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
      Row() {
        Text(getStatusLabel(book.readingProgress ?? 0))
          .fontSize(11)
          .fontColor(this.themeTextSec)
        Blank()
        Text(formatFileSize(book.fileSize ?? 0))
          .fontSize(11)
          .fontColor(this.themeTextSec)
      }
      .width('100%')
      .margin({ top: 4 })
    }
    .width('100%')
    .padding({ bottom: spacing.md })
    .onClick((): void => {
      this.handleBookPress(book);
    })
  }
}
