// [API 23+] screens/CollectionDetailScreen.ets — 1:1 对齐 mobile CollectionDetailScreen.tsx
// 书单详情页:书单名 header / 描述 / 书籍列表(封面 60x90 + 标题 + 作者 + 移除按钮)
// mobile → hm 关键差异:
//   1. Ionicons → AppIcon(close-circle 无对应,用 ✕ 字符)
//   2. LinearGradient → 纯色 getBookGradientStart(与 BookDetailScreen 同一降级方案)
//   3. route.params.collectionId → @Prop collectionId(NavDestination 注入)
//   4. RN Alert → promptAction.showDialog
import { promptAction } from '@kit.ArkUI';
import { ApiResponse, Book, CollectionDetail } from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute, pushRoute, RouteName, BookParams } from '../router/AppRouter';

// 对齐 mobile getBookGradient(title)[0]
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
export struct CollectionDetailScreen {
  @Prop collectionId: string = '';

  @State private collection: CollectionDetail | null = null;
  @State private isLoading: boolean = true;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  aboutToAppear(): void {
    this.applyTheme();
    void this.fetchCollection();
  }

  private applyTheme(): void {
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
  }

  // ─── 拉取书单(对齐 mobile fetchCollection)──────────────────────────
  private async fetchCollection(): Promise<void> {
    this.isLoading = true;
    try {
      const api = getApiClient();
      const res: ApiResponse<CollectionDetail> = await api.getCollection(this.collectionId);
      if (res.success && res.data) {
        this.collection = res.data;
      }
    } catch {
      // 静默失败
    } finally {
      this.isLoading = false;
    }
  }

  // ─── 移除书籍(对齐 mobile handleRemoveBook)───────────────────────────
  private handleRemoveBook(bookId: string): void {
    promptAction.showDialog({
      title: '确认',
      message: '从书单中移除这本书？',
      buttons: [
        { text: '取消', color: this.themeTextSec },
        { text: '移除', color: this.themeError }
      ]
    }).then((res: promptAction.ShowDialogSuccessResponse): void => {
      if (res.index === 1) {
        void this.doRemoveBook(bookId);
      }
    });
  }

  private async doRemoveBook(bookId: string): Promise<void> {
    try {
      const api = getApiClient();
      await api.removeBookFromCollection(this.collectionId, bookId);
      await this.fetchCollection();
    } catch {
      promptAction.showDialog({
        title: '错误',
        message: '移除失败',
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
    }
  }

  // ─── 点击书籍(对齐 mobile handleBookPress)───────────────────────────
  private handleBookPress(book: Book): void {
    const p: BookParams = { book: book };
    pushRoute(RouteName.BOOK_DETAILS, p);
  }

  build() {
    Column() {
      if (this.isLoading) {
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
            .color(this.themePrimary)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else if (!this.collection) {
        Column() {
          Text('书单不存在')
            .fontSize(fontSizes.md)
            .fontColor(this.themeTextSec)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else {
        // ─── Header(对齐 mobile header)────────────────────────────────
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

          Text(this.collection.name)
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

        if (this.collection.description) {
          Text(this.collection.description)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .width('100%')
            .padding({ left: spacing.md, right: spacing.md, bottom: spacing.sm })
        }

        // ─── 书籍列表(对齐 mobile ScrollView + bookList)───────────────────
        Scroll() {
          if (this.collection.books.length === 0) {
            // 空状态(对齐 mobile emptyContainer)
            Column() {
              AppIcon({ kind: AppIconKind.Book, iconSize: 48, iconColor: this.themeTextSec })
              Text('书单暂无书籍')
                .fontSize(fontSizes.md)
                .fontColor(this.themeTextSec)
                .margin({ top: spacing.md })
            }
            .width('100%')
            .padding({ top: 100 })
            .alignItems(HorizontalAlign.Center)
          } else {
            Column({ space: spacing.sm }) {
              ForEach(this.collection.books, (book: Book) => {
                Row() {
                  // 封面(对齐 mobile coverContainer 60x90)
                  Stack() {
                    if (book.coverUrl) {
                      Image(getApiClient().toAbsoluteUrl(book.coverUrl))
                        .width(60)
                        .height(90)
                        .objectFit(ImageFit.Cover)
                        .borderRadius(borderRadius.sm)
                    } else {
                      Column() {
                        Text(book.title.charAt(0))
                          .fontSize(24)
                          .fontWeight(FontWeight.Bold)
                          .fontColor('#FFFFFF')
                      }
                      .width(60)
                      .height(90)
                      .justifyContent(FlexAlign.Center)
                      .alignItems(HorizontalAlign.Center)
                      .backgroundColor(getBookGradientStart(book.title))
                      .borderRadius(borderRadius.sm)
                    }
                  }

                  // 信息(对齐 mobile bookInfo)
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

                  // 移除按钮(对齐 mobile removeButton)
                  Column() {
                    Text('✕')
                      .fontSize(20)
                      .fontColor(this.themeError)
                  }
                  .width(36)
                  .height(36)
                  .justifyContent(FlexAlign.Center)
                  .alignItems(HorizontalAlign.Center)
                  .onClick((): void => {
                    this.handleRemoveBook(book.id);
                  })
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
            .padding(spacing.md)
          }
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .align(Alignment.Top)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }
}
