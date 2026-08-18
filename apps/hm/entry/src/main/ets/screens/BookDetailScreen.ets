// [API 23+] screens/BookDetailScreen.ets — 1:1 对齐 mobile BookDetailScreen.tsx
// 6 区块:Header / 书籍信息 / 阅读进度 / 内容简介 / 作者简介 / 目录
// 3 modal:添加到书单(slide) / 新建书单(fade) / 更多菜单(fade 顶部下拉)
//
// mobile → hm 关键差异:
//   1. LinearGradient 封面降级为纯色(getBookGradient 取第一色)
//   2. Ionicons → AppIcon(emoji 全部禁用,未验证 sys.symbol 走几何字符)
//   3. RN Modal → @Builder + Stack 全屏 overlay(参考 ProfileScreen 范式)
//   4. Linking.openURL(豆瓣) → openUrl(@kit.AbilityKit)未在 P3 引入,先 toast 占位
//   5. 横竖屏 isLandscape → 媒体查询,P3 阶段先用固定竖屏布局(P4 再补横屏)
//   6. 阅读 / 听书按钮 → 跳 Reader/TTSScreen(P4 实现),P3 先 pushRoute 占位
import { promptAction } from '@kit.ArkUI';
import {
  ApiResponse,
  Author,
  Book,
  BookMetadata,
  ChapterListItem,
  Collection,
  CreateCollectionDto,
  FavoriteCheckResponse
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { pushRoute, popRoute, RouteName, BookParams, AuthorParams, NotesParams } from '../router/AppRouter';

// ─── 封面渐变底色(取双色渐变的第一色)─────────────────────────────────
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

// ─── metadata JSON 解析(对齐 mobile parseMetadata)────────────────────
function parseMetadata(raw?: string): BookMetadata {
  const empty: BookMetadata = {};
  if (!raw) {
    return empty;
  }
  try {
    const parsed: BookMetadata = JSON.parse(raw) as BookMetadata;
    return parsed;
  } catch {
    return empty;
  }
}

// ─── 路由入参(cast NavPathInfo.param 用)─────────────────────────────
interface RouteBookParams {
  book: Book;
}

@Component
export struct BookDetailScreen {
  // 路由参数在 onPageShow 里通过 NavPathInfo.param 注入前,@Prop 兜底为空书
  @Prop initialBook: Book = {} as Book;

  @State private book: Book = {} as Book;
  @State private chapters: ChapterListItem[] = [];
  @State private isLoading: boolean = true;
  @State private isFavorite: boolean = false;
  @State private descExpanded: boolean = false;
  @State private showAllChapters: boolean = false;
  @State private collections: Collection[] = [];
  @State private showCollectionModal: boolean = false;
  @State private showCreateCollectionModal: boolean = false;
  @State private newCollectionName: string = '';
  @State private addingCollectionId: string | null = null;
  @State private showMoreMenu: boolean = false;

  // 主题(@State 镜像,getTheme 每次重算避免缓存旧值)
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';
  @State private themeSuccess: string = '#10B981';
  @State private themeWarning: string = '#F59E0B';

  aboutToAppear(): void {
    this.applyTheme();
    this.book = this.initialBook;
    void this.loadDetails();
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
    this.themeSuccess = t.colors.success;
    this.themeWarning = t.colors.warning;
  }

  // ─── 数据加载(Promise.all 并发,对齐 mobile)─────────────────────────
  private async loadDetails(): Promise<void> {
    if (!this.book.id) {
      this.isLoading = false;
      return;
    }
    this.isLoading = true;
    try {
      const api = getApiClient();
      const bookRes: ApiResponse<Book> = await api.getBook(this.book.id);
      const chapterRes: ApiResponse<ChapterListItem[]> = await api.getChapters(this.book.id);
      let favRes: ApiResponse<FavoriteCheckResponse>;
      try {
        favRes = await api.checkFavorite(this.book.id);
      } catch {
        const favFail: ApiResponse<FavoriteCheckResponse> = { success: false };
        favRes = favFail;
      }
      if (bookRes.success && bookRes.data) {
        this.book = bookRes.data;
      }
      if (chapterRes.success && chapterRes.data) {
        this.chapters = chapterRes.data;
      }
      if (favRes.success && favRes.data) {
        this.isFavorite = favRes.data.isFavorite;
      }
    } catch {
      // 静默失败,保持 initialBook 渲染
    } finally {
      this.isLoading = false;
    }
  }

  private handleBack(): void {
    popRoute();
  }

  private handleRead(): void {
    const p: BookParams = { book: this.book };
    pushRoute(RouteName.READER, p);
  }

  private handleTTS(): void {
    const p: BookParams = { book: this.book };
    pushRoute(RouteName.TTS_SCREEN, p);
  }

  private async handleToggleFavorite(): Promise<void> {
    try {
      const api = getApiClient();
      if (this.isFavorite) {
        await api.removeFavorite(this.book.id);
        this.isFavorite = false;
      } else {
        await api.addFavorite(this.book.id);
        this.isFavorite = true;
      }
    } catch {
      promptAction.showToast({ message: '操作失败', duration: 1500 });
    }
  }

  private async handleOpenCollectionModal(): Promise<void> {
    try {
      const api = getApiClient();
      const res: ApiResponse<Collection[]> = await api.getCollections();
      if (res.success && res.data) {
        this.collections = res.data;
      }
      this.showCollectionModal = true;
    } catch {
      promptAction.showToast({ message: '获取书单失败', duration: 1500 });
    }
  }

  private async handleAddToCollection(collectionId: string): Promise<void> {
    this.addingCollectionId = collectionId;
    try {
      const api = getApiClient();
      const res: ApiResponse<void> = await api.addBookToCollection(collectionId, this.book.id);
      if (res.success) {
        promptAction.showToast({ message: '已添加到书单', duration: 1500 });
        this.showCollectionModal = false;
      } else {
        promptAction.showToast({ message: res.message ?? '添加失败', duration: 1500 });
      }
    } catch {
      promptAction.showToast({ message: '添加失败', duration: 1500 });
    } finally {
      this.addingCollectionId = null;
    }
  }

  private async handleCreateCollection(): Promise<void> {
    const name: string = this.newCollectionName.trim();
    if (!name) {
      promptAction.showToast({ message: '请输入书单名称', duration: 1500 });
      return;
    }
    try {
      const api = getApiClient();
      const dto: CreateCollectionDto = { name };
      const createRes: ApiResponse<Collection> = await api.createCollection(dto);
      if (createRes.success && createRes.data) {
        const addRes: ApiResponse<void> = await api.addBookToCollection(createRes.data.id, this.book.id);
        if (addRes.success) {
          promptAction.showToast({ message: '已创建书单并添加书籍', duration: 1500 });
          this.showCreateCollectionModal = false;
          this.showCollectionModal = false;
          this.newCollectionName = '';
        } else {
          promptAction.showToast({ message: addRes.message ?? '添加失败', duration: 1500 });
        }
      } else {
        promptAction.showToast({ message: createRes.message ?? '创建失败', duration: 1500 });
      }
    } catch {
      promptAction.showToast({ message: '操作失败', duration: 1500 });
    }
  }

  // ─── 封面(竖屏 160x240,横屏 180x270;P3 固定竖屏)────────────────────
  @Builder
  private Cover(width: number, height: number) {
    if (this.book.coverUrl) {
      Image(getApiClient().toAbsoluteUrl(this.book.coverUrl))
        .width(width)
        .height(height)
        .objectFit(ImageFit.Cover)
        .borderRadius(borderRadius.lg)
    } else {
      Column() {
        Text(this.book.title.charAt(0))
          .fontSize(width * 0.3)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
      }
      .width(width)
      .height(height)
      .backgroundColor(getBookGradientStart(this.book.title))
      .borderRadius(borderRadius.lg)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
  }

  // ─── 元数据行(label + value,空值不渲染)────────────────────────────
  @Builder
  private MetaRow(label: string, value: string) {
    // 对齐 mobile metaRow: label width=72, value flex=1, lineHeight=20
    Row() {
      Text(label)
        .fontSize(fontSizes.sm)
        .fontColor(this.themeTextSec)
        .lineHeight(20)
        .width(72)
      Text(value)
        .fontSize(fontSizes.sm)
        .fontColor(this.themeText)
        .lineHeight(20)
        .layoutWeight(1)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
  }

  // ─── 出版日期格式化(对齐 mobile IIFE)─────────────────────────────
  private formatPublishedDate(): string {
    const meta: BookMetadata = parseMetadata(this.book.metadata);
    const dateStr: string = this.book.publishedDate
      ?? meta.publishedDate ?? meta.published ?? meta.pub_date ?? '';
    if (!dateStr) {
      return '';
    }
    try {
      const d: Date = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch {
      // ignore
    }
    return dateStr;
  }

  // ─── 页数文本(@Builder 里不能 const,抽成方法)─────────────────────
  private pagesText(): string {
    const meta: BookMetadata = parseMetadata(this.book.metadata);
    const pages: number = this.book.totalPages ?? (meta.pages as number) ?? 0;
    return `${pages} 页`;
  }

  private descText(): string {
    const meta: BookMetadata = parseMetadata(this.book.metadata);
    return this.book.description ?? meta.summary ?? '';
  }

  private authorIntroText(): string {
    const meta: BookMetadata = parseMetadata(this.book.metadata);
    return meta.authorIntro ?? '';
  }

  build() {
    Stack() {
      Column() {
        // ─── Header ─────────────────────────────────────────────
        Row() {
          Row() {
            AppIcon({ kind: AppIconKind.ArrowBack, iconSize: 24, iconColor: this.themeText })
          }
          .width(40)
          .height(40)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.handleBack();
          })
          Text(this.book.title)
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .margin({ left: spacing.sm })
          Row() {
            AppIcon({ kind: AppIconKind.MoreVertical, iconSize: 22, iconColor: this.themeText })
          }
          .width(40)
          .height(40)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.showMoreMenu = true;
          })
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
        .backgroundColor(this.themeBg)
        .alignItems(VerticalAlign.Center)

        // ─── 主体滚动区 ─────────────────────────────────────────
        Scroll() {
          Column() {
            this.BookInfoSection()
            this.ProgressCard()
            this.DescCard()
            this.AuthorIntroCard()
            this.ChapterCard()
            // 底部留白
            Column().height(spacing.xl)
          }
          .width('100%')
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.themeBg)

      // ─── 3 个 modal(全屏 Stack overlay)───────────────────────────
      if (this.showCollectionModal) {
        this.CollectionModal()
      }
      if (this.showCreateCollectionModal) {
        this.CreateCollectionModal()
      }
      if (this.showMoreMenu) {
        this.MoreMenuModal()
      }
    }
    .width('100%')
    .height('100%')
  }

  // ─── 区块 1:书籍信息(封面 + 12 行元数据 + 阅读/听书按钮)────────────
  @Builder
  private BookInfoSection() {
    Column() {
      // 封面(居中)
      this.Cover(160, 240)

      // 元数据列表
      // 对齐 mobile bookMetaList: gap=spacing.sm(8), metaLabel/metaValue lineHeight=20
      Column({ space: spacing.sm }) {
        // 作者(优先 authors 数组,可点击跳 AuthorDetail)
        if (this.book.authors && this.book.authors.length > 0) {
          Row() {
            Text('作者')
              .fontSize(fontSizes.sm)
              .fontColor(this.themeTextSec)
              .width(72)
            Flex({ wrap: FlexWrap.Wrap }) {
              ForEach(this.book.authors, (a: Author) => {
                Text(a.name)
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themePrimary)
                  .margin({ right: spacing.sm })
                  .onClick((): void => {
                    const p: AuthorParams = { author: a };
                    pushRoute(RouteName.AUTHOR_DETAIL, p);
                  })
              }, (a: Author): string => a.id)
            }
            .layoutWeight(1)
          }
          .width('100%')
          .alignItems(VerticalAlign.Top)
        } else if (this.book.author) {
          this.MetaRow('作者', this.book.author)
        }

        // 标签
        if (parseMetadata(this.book.metadata).tags && (parseMetadata(this.book.metadata).tags as string[]).length > 0) {
          this.MetaRow('标签', (parseMetadata(this.book.metadata).tags as string[]).join('、'))
        }

        // 分类
        if (parseMetadata(this.book.metadata).category) {
          this.MetaRow('分类', (parseMetadata(this.book.metadata).category as string[]).join(' > '))
        }

        // 丛书
        if (parseMetadata(this.book.metadata).series) {
          this.MetaRow('丛书', parseMetadata(this.book.metadata).series as string)
        }

        // 出版社
        if (this.book.publisher) {
          this.MetaRow('出版社', this.book.publisher)
        }

        // 出版日期
        if (this.formatPublishedDate()) {
          this.MetaRow('出版日期', this.formatPublishedDate())
        }

        // 页数
        if (this.book.totalPages || parseMetadata(this.book.metadata).pages) {
          this.MetaRow('页数', this.pagesText())
        }

        // ISBN
        if (this.book.isbn) {
          this.MetaRow('ISBN', this.book.isbn)
        }

        // 语言(非 zh 才显示)
        if (this.book.language && this.book.language !== 'zh') {
          this.MetaRow('语言', this.book.language)
        }

        // 格式
        if (this.book.format) {
          this.MetaRow('格式', this.book.format.toUpperCase())
        }

        // 豆瓣评分
        if (parseMetadata(this.book.metadata).rating) {
          Row() {
            Text('豆瓣评分')
              .fontSize(fontSizes.sm)
              .fontColor(this.themeTextSec)
              .width(72)
            Text(`★ ${parseMetadata(this.book.metadata).rating as string}`)
              .fontSize(fontSizes.sm)
              .fontColor(this.themeWarning)
              .layoutWeight(1)
          }
          .width('100%')
          .alignItems(VerticalAlign.Top)
        }

        // 文件大小
        if (this.book.fileSize) {
          this.MetaRow('文件大小', `${(this.book.fileSize / 1024 / 1024).toFixed(1)} MB`)
        }

        // 信息源(豆瓣)
        Row() {
          Text('信息源')
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .width(72)
          if (parseMetadata(this.book.metadata).doubanUrl) {
            Text('豆瓣 ↗')
              .fontSize(fontSizes.sm)
              .fontColor(this.themePrimary)
              .layoutWeight(1)
              .onClick((): void => {
                // P3 先 toast 占位,P4 再接 openUrl
                promptAction.showToast({ message: '跳转豆瓣链接(P4 实现)', duration: 1500 });
              })
          } else {
            Text('豆瓣')
              .fontSize(fontSizes.sm)
              .fontColor(this.themeText)
              .layoutWeight(1)
          }
        }
        .width('100%')
        .alignItems(VerticalAlign.Top)
      }
      .width('100%')
      .margin({ top: spacing.md })
      .alignItems(HorizontalAlign.Start)

      // 操作按钮
      Row({ space: spacing.sm }) {
        Row({ space: spacing.xs }) {
          AppIcon({ kind: AppIconKind.Book, iconSize: 18, iconColor: '#FFFFFF' })
          Text('阅读')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Bold)
            .fontColor('#FFFFFF')
        }
        .layoutWeight(1)
        .height(44)
        .backgroundColor(this.themePrimary)
        .borderRadius(borderRadius.md)
        .justifyContent(FlexAlign.Center)
        .onClick((): void => {
          this.handleRead();
        })

        Row() {
          AppIcon({ kind: AppIconKind.Headset, iconSize: 18, iconColor: this.themeText })
        }
        .width(48)
        .height(44)
        .backgroundColor(this.themeSurface)
        .border({ width: 1, color: this.themeBorder })
        .borderRadius(borderRadius.md)
        .justifyContent(FlexAlign.Center)
        .onClick((): void => {
          this.handleTTS();
        })
      }
      .width('100%')
      .margin({ top: spacing.md })
    }
    .width('100%')
    .padding({ left: spacing.md, right: spacing.md, top: spacing.md, bottom: spacing.md })
  }

  // ─── 区块 2:阅读进度卡片 ─────────────────────────────────────────
  @Builder
  private ProgressCard() {
    if (this.book.readingProgress !== undefined && this.book.readingProgress > 0) {
      Column({ space: spacing.sm }) {
        Row() {
          Text('阅读进度')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeText)
            .layoutWeight(1)
          Text('继续阅读')
            .fontSize(fontSizes.sm)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themePrimary)
            .padding({ left: spacing.sm, right: spacing.sm, top: spacing.xs, bottom: spacing.xs })
            .border({ width: 1, color: this.themePrimary })
            .borderRadius(borderRadius.md)
            .onClick((): void => {
              this.handleRead();
            })
        }
        .width('100%')

        Text(`${Math.round(this.book.readingProgress)}%`)
          .fontSize(fontSizes.xxxl)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themePrimary)
          .width('100%')
          .textAlign(TextAlign.Start)

        // 进度条
        Stack({ alignContent: Alignment.Start }) {
          Column()
            .width('100%')
            .height(4)
            .backgroundColor(this.themeBorder)
            .borderRadius(borderRadius.full)
          Column()
            .width(`${this.book.readingProgress}%`)
            .height(4)
            .backgroundColor(this.themePrimary)
            .borderRadius(borderRadius.full)
        }
        .width('100%')

        if (this.book.currentPage !== undefined) {
          Text(`上次阅读到:第 ${this.book.currentPage} 页`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .width('100%')
            .textAlign(TextAlign.Start)
        }
      }
      .padding(spacing.md)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
      .margin({ left: spacing.md, right: spacing.md, bottom: spacing.md })
    }
  }

  // ─── 区块 3:内容简介卡片 ─────────────────────────────────────────
  @Builder
  private DescCard() {
    if (this.descText()) {
      Column({ space: spacing.sm }) {
        Text('内容简介')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themeText)
          .width('100%')
          .textAlign(TextAlign.Start)

        Text(this.descText())
          .fontSize(fontSizes.md)
          .fontColor(this.themeText)
          .lineHeight(24)
          .maxLines(this.descExpanded ? undefined : 5)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')
          .textAlign(TextAlign.Start)

        Row({ space: 2 }) {
          Text(this.descExpanded ? '收起' : '展开')
            .fontSize(fontSizes.sm)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themePrimary)
          AppIcon({
            kind: this.descExpanded ? AppIconKind.ChevronUp : AppIconKind.ChevronDown,
            iconSize: 14,
            iconColor: this.themePrimary
          })
        }
        .width('100%')
        .justifyContent(FlexAlign.End)
        .onClick((): void => {
          this.descExpanded = !this.descExpanded;
        })
      }
      .padding(spacing.md)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
      .margin({ left: spacing.md, right: spacing.md, bottom: spacing.md })
    }
  }

  // ─── 区块 4:作者简介卡片 ─────────────────────────────────────────
  @Builder
  private AuthorIntroCard() {
    if (this.authorIntroText()) {
      Column({ space: spacing.sm }) {
        Text('作者简介')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themeText)
          .width('100%')
          .textAlign(TextAlign.Start)

        Row({ space: spacing.sm }) {
          Column() {
            Text((this.book.author ?? '?').charAt(0))
              .fontSize(fontSizes.xl)
              .fontWeight(FontWeight.Bold)
              .fontColor('#FFFFFF')
          }
          .width(48)
          .height(48)
          .borderRadius(24)
          .backgroundColor(this.themePrimary)
          .justifyContent(FlexAlign.Center)

          Column({ space: 2 }) {
            Text(this.book.author)
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Bold)
              .fontColor(this.themeText)
            Text(this.authorIntroText())
              .fontSize(fontSizes.sm)
              .fontColor(this.themeTextSec)
              .lineHeight(20)
              .maxLines(3)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
        .alignItems(VerticalAlign.Top)
      }
      .padding(spacing.md)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
      .margin({ left: spacing.md, right: spacing.md, bottom: spacing.md })
    }
  }

  // ─── 区块 5:目录卡片 ─────────────────────────────────────────────
  @Builder
  private ChapterCard() {
    if (this.chapters.length > 0) {
      Column({ space: spacing.sm }) {
        Row() {
          Text('目录')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeText)
            .layoutWeight(1)
          Text(`共 ${this.chapters.length} 章`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
        }
        .width('100%')

        ForEach(
          this.showAllChapters ? this.chapters : this.chapters.slice(0, 5),
          (chapter: ChapterListItem, idx: number) => {
            Row({ space: spacing.xs }) {
              Text(`${idx + 1}.`)
                .fontSize(fontSizes.sm)
                .fontColor(this.themeTextSec)
                .width(28)
              Text(chapter.title)
                .fontSize(fontSizes.md)
                .fontColor(this.themeText)
                .layoutWeight(1)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
              if (idx < (this.book.currentPage ?? 0)) {
                Text('已读')
                  .fontSize(fontSizes.xs)
                  .fontColor(this.themeSuccess)
                  .margin({ right: spacing.xs })
              }
              AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 14, iconColor: this.themeTextSec })
            }
            .width('100%')
            .padding({ top: spacing.sm, bottom: spacing.sm })
            .border({ width: { bottom: 1 }, color: this.themeBorder })
            .onClick((): void => {
              this.handleRead();
            })
          },
          (chapter: ChapterListItem, idx: number): string => `${chapter.index}-${idx}`
        )

        if (this.chapters.length > 5) {
          Text(this.showAllChapters ? '收起目录' : '查看全部目录')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themePrimary)
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding({ top: spacing.sm, bottom: spacing.sm })
            .margin({ top: spacing.xs })
            .onClick((): void => {
              this.showAllChapters = !this.showAllChapters;
            })
        }
      }
      .padding(spacing.md)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
      .margin({ left: spacing.md, right: spacing.md, bottom: spacing.md })
    }
  }

  // ─── Modal 1:添加到书单(slide 从底部)──────────────────────────────
  @Builder
  private CollectionModal() {
    Stack({ alignContent: Alignment.Bottom }) {
      // 遮罩
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showCollectionModal = false;
        })

      // 底部弹层
      Column() {
        // header
        Row() {
          Text('添加到书单')
            .fontSize(fontSizes.xl)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeText)
            .layoutWeight(1)
          AppIcon({ kind: AppIconKind.Close, iconSize: 24, iconColor: this.themeTextSec })
            .onClick((): void => {
              this.showCollectionModal = false;
            })
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md })

        // 书单列表
        Scroll() {
          Column() {
            if (this.collections.length === 0) {
              Text('暂无书单,点击下方创建')
                .fontSize(fontSizes.md)
                .fontColor(this.themeTextSec)
                .width('100%')
                .textAlign(TextAlign.Center)
                .padding({ top: spacing.xl, bottom: spacing.xl })
            } else {
              ForEach(this.collections, (col: Collection) => {
                Row() {
                  Row({ space: spacing.sm }) {
                    AppIcon({ kind: AppIconKind.FolderOpen, iconSize: 20, iconColor: this.themePrimary })
                    Text(col.name)
                      .fontSize(fontSizes.md)
                      .fontWeight(FontWeight.Medium)
                      .fontColor(this.themeText)
                  }
                  .layoutWeight(1)

                  if (this.addingCollectionId === col.id) {
                    LoadingProgress()
                      .width(20)
                      .height(20)
                      .color(this.themePrimary)
                  } else {
                    Text(`${col.bookCount ?? 0} 本`)
                      .fontSize(fontSizes.sm)
                      .fontColor(this.themeTextSec)
                  }
                }
                .width('100%')
                .padding({ top: spacing.md, bottom: spacing.md })
                .border({ width: { bottom: 1 }, color: this.themeBorder })
                .enabled(this.addingCollectionId !== col.id)
                .onClick((): void => {
                  void this.handleAddToCollection(col.id);
                })
              }, (col: Collection): string => col.id)
            }
          }
          .width('100%')
        }
        .scrollBar(BarState.Off)
        .constraintSize({ maxHeight: 300 })

        // 新建书单按钮
        Row({ space: spacing.xs }) {
          AppIcon({ kind: AppIconKind.Plus, iconSize: 20, iconColor: '#FFFFFF' })
          Text('新建书单')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Bold)
            .fontColor('#FFFFFF')
        }
        .width('100%')
        .height(48)
        .backgroundColor(this.themePrimary)
        .borderRadius(borderRadius.md)
        .justifyContent(FlexAlign.Center)
        .margin({ top: spacing.md })
        .onClick((): void => {
          this.showCollectionModal = false;
          this.showCreateCollectionModal = true;
        })
      }
      .width('100%')
      .padding({ left: spacing.md, right: spacing.md, bottom: spacing.xl })
      .backgroundColor(this.themeBg)
      .borderRadius({ topLeft: borderRadius.xl, topRight: borderRadius.xl })
      .constraintSize({ maxHeight: '70%' })
    }
    .width('100%')
    .height('100%')
  }

  // ─── Modal 2:新建书单(fade 居中)───────────────────────────────────
  @Builder
  private CreateCollectionModal() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showCreateCollectionModal = false;
        })

      Column() {
        Row() {
          Text('新建书单')
            .fontSize(fontSizes.xl)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeText)
            .layoutWeight(1)
          AppIcon({ kind: AppIconKind.Close, iconSize: 24, iconColor: this.themeTextSec })
            .onClick((): void => {
              this.showCreateCollectionModal = false;
            })
        }
        .width('100%')
        .padding({ bottom: spacing.md })

        TextInput({ placeholder: '书单名称', text: this.newCollectionName })
          .placeholderColor(this.themeTextSec)
          .fontColor(this.themeText)
          .height(48)
          .padding({ left: spacing.md, right: spacing.md })
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .backgroundColor(this.themeSurface)
          .width('100%')
          .maxLength(50)
          .onChange((v: string): void => {
            this.newCollectionName = v;
          })

        Text('创建并添加')
          .fontSize(fontSizes.md)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
          .width('100%')
          .textAlign(TextAlign.Center)
          .height(48)
          .backgroundColor(this.themePrimary)
          .borderRadius(borderRadius.md)
          .margin({ top: spacing.md })
          .onClick((): void => {
            void this.handleCreateCollection();
          })
      }
      .width('85%')
      .padding(spacing.lg)
      .backgroundColor(this.themeBg)
      .borderRadius(borderRadius.xl)
      .shadow({ radius: 16, color: 'rgba(0,0,0,0.25)', offsetY: 8 })
    }
    .width('100%')
    .height('100%')
  }

  // ─── Modal 3:更多菜单(fade 顶部下拉)────────────────────────────────
  @Builder
  private MoreMenuModal() {
    Stack({ alignContent: Alignment.TopEnd }) {
      // 遮罩(点击关闭)
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.3)')
        .onClick((): void => {
          this.showMoreMenu = false;
        })

      // 顶部下拉菜单
      Column() {
        // 收藏
        Row({ space: spacing.md }) {
          AppIcon({
            kind: this.isFavorite ? AppIconKind.Heart : AppIconKind.HeartOutline,
            iconSize: 20,
            iconColor: this.isFavorite ? this.themeError : this.themeText
          })
          Text(this.isFavorite ? '取消收藏' : '收藏')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md, left: spacing.lg, right: spacing.lg })
        .onClick((): void => {
          this.showMoreMenu = false;
          void this.handleToggleFavorite();
        })

        Divider().color(this.themeBorder).margin({ left: spacing.lg, right: spacing.lg })

        // 查看笔记
        Row({ space: spacing.md }) {
          AppIcon({ kind: AppIconKind.DocText, iconSize: 20, iconColor: this.themeText })
          Text('查看笔记')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md, left: spacing.lg, right: spacing.lg })
        .onClick((): void => {
          this.showMoreMenu = false;
          const p: NotesParams = { bookId: this.book.id };
          pushRoute(RouteName.NOTES, p);
        })

        Divider().color(this.themeBorder).margin({ left: spacing.lg, right: spacing.lg })

        // 添加到书单
        Row({ space: spacing.md }) {
          AppIcon({ kind: AppIconKind.FolderOpen, iconSize: 20, iconColor: this.themeText })
          Text('添加到书单')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
        }
        .width('100%')
        .padding({ top: spacing.md, bottom: spacing.md, left: spacing.lg, right: spacing.lg })
        .onClick((): void => {
          this.showMoreMenu = false;
          void this.handleOpenCollectionModal();
        })
      }
      .width(180)
      .backgroundColor(this.themeBg)
      .borderRadius(borderRadius.lg)
      .padding({ top: spacing.sm, bottom: spacing.sm })
      .margin({ top: 80, right: spacing.md })
      .shadow({ radius: 8, color: 'rgba(0,0,0,0.15)', offsetY: 2 })
    }
    .width('100%')
    .height('100%')
  }
}
