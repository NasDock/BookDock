// [API 23+] screens/AuthorDetailScreen.ets — mobile 端无独立 screen(types.ts 声明了
// 路由但未实现),hm 按项目范式补齐:作者信息卡 + 作者书籍列表
// 设计参照:BookDetailScreen 的 getBookGradientStart 降级 + CollectionDetailScreen 的书籍行
import { promptAction } from '@kit.ArkUI';
import { ApiResponse, Author, Book } from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute, pushRoute, RouteName, BookParams } from '../router/AppRouter';

// 对齐 BookDetailScreen getBookGradientStart(取渐变第一色作纯色降级)
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

@Component
export struct AuthorDetailScreen {
  @Prop initialAuthor: Author = {} as Author;

  @State private author: Author = {} as Author;
  @State private books: Book[] = [];
  @State private isLoading: boolean = true;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themePrimary: string = '#4A90D9';

  aboutToAppear(): void {
    this.author = this.initialAuthor;
    this.applyTheme();
    void this.loadBooks();
  }

  private applyTheme(): void {
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themePrimary = t.colors.primary;
  }

  private async loadBooks(): Promise<void> {
    this.isLoading = true;
    try {
      const api = getApiClient();
      const res: ApiResponse<Book[]> = await api.getAuthorBooks(this.author.id);
      if (res.success && res.data) {
        this.books = res.data;
      }
    } catch {
      promptAction.showToast({ message: '加载作者书籍失败', duration: 1500 });
    } finally {
      this.isLoading = false;
    }
  }

  private handleBookPress(book: Book): void {
    const p: BookParams = { book: book };
    pushRoute(RouteName.BOOK_DETAILS, p);
  }

  build() {
    Column() {
      // ─── Header(对齐项目自绘 header 范式)─────────────────────────────
      Row() {
        Row() {
          AppIcon({ kind: AppIconKind.ArrowBack, iconSize: 24, iconColor: this.themeText })
        }
        .width(40)
        .height(40)
        .justifyContent(FlexAlign.Center)
        .onClick((): void => {
          popRoute();
        })

        Text(this.author.name || '作者')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })

        Column()
          .width(40)
          .height(40)
      }
      .width('100%')
      .padding({ left: spacing.md, right: spacing.md, top: spacing.xl + 8, bottom: spacing.md })
      .backgroundColor(this.themeSurface)
      .alignItems(VerticalAlign.Center)

      Scroll() {
        Column() {
          // ─── 作者信息卡 ────────────────────────────────────────────
          Column({ space: spacing.sm }) {
            Column() {
              Text((this.author.name || '?').charAt(0))
                .fontSize(28)
                .fontWeight(FontWeight.Bold)
                .fontColor('#FFFFFF')
            }
            .width(64)
            .height(64)
            .borderRadius(32)
            .justifyContent(FlexAlign.Center)
            .alignItems(HorizontalAlign.Center)
            .backgroundColor(getBookGradientStart(this.author.name || '?'))

            Text(this.author.name)
              .fontSize(fontSizes.xl)
              .fontWeight(FontWeight.Bold)
              .fontColor(this.themeText)

            if (this.author.bio) {
              Text(this.author.bio)
                .fontSize(fontSizes.sm)
                .fontColor(this.themeTextSec)
                .textAlign(TextAlign.Center)
                .maxLines(4)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
          }
          .width('100%')
          .padding(spacing.lg)
          .alignItems(HorizontalAlign.Center)
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)

          // ─── 书籍列表 ────────────────────────────────────────────
          Text(`作品 (${this.books.length})`)
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .width('100%')
            .margin({ top: spacing.lg, bottom: spacing.sm })

          if (this.isLoading) {
            Column() {
              LoadingProgress()
                .width(32)
                .height(32)
                .color(this.themePrimary)
            }
            .width('100%')
            .padding(spacing.xl)
            .justifyContent(FlexAlign.Center)
          } else if (this.books.length === 0) {
            Text('暂无书籍')
              .fontSize(fontSizes.md)
              .fontColor(this.themeTextSec)
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding(spacing.xl)
          } else {
            Column({ space: spacing.sm }) {
              ForEach(this.books, (book: Book) => {
                Row() {
                  Stack() {
                    if (book.coverUrl) {
                      Image(getApiClient().toAbsoluteUrl(book.coverUrl))
                        .width(48)
                        .height(72)
                        .objectFit(ImageFit.Cover)
                        .borderRadius(borderRadius.sm)
                    } else {
                      Column() {
                        Text(book.title.charAt(0))
                          .fontSize(20)
                          .fontWeight(FontWeight.Bold)
                          .fontColor('#FFFFFF')
                      }
                      .width(48)
                      .height(72)
                      .justifyContent(FlexAlign.Center)
                      .alignItems(HorizontalAlign.Center)
                      .backgroundColor(getBookGradientStart(book.title))
                      .borderRadius(borderRadius.sm)
                    }
                  }

                  Column({ space: 2 }) {
                    Text(book.title)
                      .fontSize(fontSizes.md)
                      .fontWeight(FontWeight.Medium)
                      .fontColor(this.themeText)
                      .maxLines(2)
                      .textOverflow({ overflow: TextOverflow.Ellipsis })
                      .width('100%')
                      .textAlign(TextAlign.Start)
                    Text(book.author || '未知作者')
                      .fontSize(fontSizes.sm)
                      .fontColor(this.themeTextSec)
                      .width('100%')
                      .textAlign(TextAlign.Start)
                  }
                  .layoutWeight(1)
                  .margin({ left: spacing.sm })
                  .alignItems(HorizontalAlign.Start)

                  AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 18, iconColor: this.themeTextSec })
                }
                .width('100%')
                .padding(spacing.sm)
                .alignItems(VerticalAlign.Center)
                .backgroundColor(this.themeSurface)
                .borderRadius(borderRadius.md)
                .onClick((): void => {
                  this.handleBookPress(book);
                })
              }, (book: Book): string => book.id)
            }
            .width('100%')
          }
        }
        .width('100%')
        .padding(spacing.md)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.Top)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }
}
