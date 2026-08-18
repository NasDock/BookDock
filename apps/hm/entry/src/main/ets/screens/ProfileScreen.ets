// [API 23+] screens/ProfileScreen.ets — 1:1 对齐 mobile src/screens/ProfileScreen.tsx
// 功能:用户头像 + VIP 标识 + 阅读时长卡片 + 5 Tab(书单/在读/收藏/下载/笔记)
//      + 加号菜单 modal + 创建书单 modal + 设置/扫码入口。
// LibraryStore 在 P2 阶段实装,P1 阶段 inProgressBooks/downloadedBooks 用空数据。
import { promptAction } from '@kit.ArkUI';
import {
  ApiResponse,
  Book,
  Collection,
  CreateCollectionDto,
  Note,
  NotesListResponse,
  ReadingTimeSummary,
  SyncBooksResponse
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { AuthStore } from '../store/AuthStore';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { pushRoute, RouteName } from '../router/AppRouter';
import { AppIcon, AppIconKind } from '../components/AppIcon';

const DIAMOND_GOLD = '#FFD700';

function emptyCollections(): ApiResponse<Collection[]> {
  return { success: false, error: '' };
}

function emptyBooks(): ApiResponse<Book[]> {
  return { success: false, error: '' };
}

function emptyNotes(): ApiResponse<NotesListResponse> {
  return { success: false, error: '' };
}

function getBookGradient(title: string): string {
  const gradients: string[] = [
    '#3B82F6', '#8B5CF6', '#06B6D4', '#10B981',
    '#F59E0B', '#EF4444', '#EC4899', '#6366F1',
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx: number = Math.abs(hash) % gradients.length;
  return gradients[idx];
}

type TabKey = 'collections' | 'reading' | 'favorites' | 'downloads' | 'notes';

interface RouteBookParams {
  book: Book;
}

interface RouteCollectionParams {
  collectionId: string;
}

@Component
export struct ProfileScreen {
  @State private activeTab: TabKey = 'collections';
  @State private collections: Collection[] = [];
  @State private favorites: Book[] = [];
  @State private notes: Note[] = [];
  @State private inProgressBooks: Book[] = [];
  @State private downloadedBooks: Book[] = [];
  @State private isLoading: boolean = false;
  @State private menuVisible: boolean = false;
  @State private showCreateModal: boolean = false;
  @State private newCollectionName: string = '';
  @State private syncing: string | null = null;
  @State private readingSummary: ReadingTimeSummary | null = null;
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeText2: string = '#6B7280';

  private authStore: AuthStore = AuthStore.shared();
  private unsubscribeAuth: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeAuth = this.authStore.subscribe((): void => {
      this.applyTheme();
    });
    void this.fetchAll();
    void this.fetchReadingSummary();
    void this.authStore.refreshVipStatus();
  }

  aboutToDisappear(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
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
    this.themeText2 = t.colors.secondary;
  }

  private async fetchAll(): Promise<void> {
    this.isLoading = true;
    try {
      const api = getApiClient();
      const colRes: ApiResponse<Collection[]> =
        await api.getCollections().catch(emptyCollections);
      const favRes: ApiResponse<Book[]> =
        await api.getFavorites().catch(emptyBooks);
      const notesRes: ApiResponse<NotesListResponse> =
        await api.getNotes().catch(emptyNotes);
      if (colRes.success && colRes.data) {
        this.collections = colRes.data;
      }
      if (favRes.success && favRes.data) {
        this.favorites = favRes.data;
      }
      if (notesRes.success && notesRes.data) {
        this.notes = notesRes.data.items || [];
      }
    } catch {
      // 静默
    } finally {
      this.isLoading = false;
    }
  }

  private async fetchReadingSummary(): Promise<void> {
    try {
      const api = getApiClient();
      const res: ApiResponse<ReadingTimeSummary> = await api.getReadingTimeSummary();
      if (res.success && res.data) {
        this.readingSummary = res.data;
      }
    } catch {
      // ignore
    }
  }

  private async handleCreateCollection(): Promise<void> {
    if (!this.newCollectionName.trim()) {
      promptAction.showToast({ message: '请输入书单名称', duration: 1500 });
      return;
    }
    try {
      const api = getApiClient();
      const dto: CreateCollectionDto = { name: this.newCollectionName.trim() };
      await api.createCollection(dto);
      this.newCollectionName = '';
      this.showCreateModal = false;
      void this.fetchAll();
    } catch {
      promptAction.showToast({ message: '创建书单失败', duration: 1500 });
    }
  }

  private handleSync(type: 'full' | 'incremental'): void {
    const title: string = type === 'full' ? '全量更新' : '增量更新';
    const message: string = type === 'full' ? '扫描所有本地书籍...' : '仅扫描新数据...';
    const themeSec = this.themeTextSec;
    const themePri = this.themePrimary;
    promptAction.showDialog({
      title,
      message,
      buttons: [
        { text: '取消', color: themeSec },
        { text: '确认', color: themePri },
      ],
    }).then((result): void => {
      void this.doSync(type, result.index);
    }).catch((): void => undefined);
  }

  private async doSync(type: 'full' | 'incremental', index: number): Promise<void> {
    if (index !== 1) {
      return;
    }
    this.syncing = type;
    try {
      const api = getApiClient();
      const res: ApiResponse<SyncBooksResponse> = await api.syncBooks(type);
      const msg: string = (res.data && res.data.message) || '更新成功';
      promptAction.showToast({ message: `同步完成: ${msg}`, duration: 2000 });
    } catch {
      promptAction.showToast({ message: '同步失败', duration: 2000 });
    } finally {
      this.syncing = null;
      this.menuVisible = false;
    }
  }

  @Builder
  private MenuModal() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.3)')
        .onClick((): void => {
          this.menuVisible = false;
        })
      Column() {
          Row() {
            SymbolGlyph($r('sys.symbol.folder_badge_plus')).fontSize(18).fontColor([this.themeText]).margin({ right: spacing.sm })
            Text('新建书单').fontSize(fontSizes.md).fontColor(this.themeText)
          }
          .padding(spacing.md)
          .width('100%')
          .onClick((): void => {
            this.menuVisible = false;
            this.showCreateModal = true;
          })
          Divider().color(this.themeBorder).margin({ left: spacing.md, right: spacing.md })
          Row() {
            SymbolGlyph($r('sys.symbol.arrow_clockwise')).fontSize(18).fontColor([this.themeText]).margin({ right: spacing.sm })
            Text(this.syncing === 'incremental' ? '增量更新中...' : '增量更新').fontSize(fontSizes.md).fontColor(this.themeText)
          }
          .padding(spacing.md)
          .width('100%')
          .enabled(this.syncing === null)
          .onClick((): void => {
            this.handleSync('incremental');
          })
          Row() {
            AppIcon({ kind: AppIconKind.Refresh, iconSize: 18, iconColor: this.themeText })
              .margin({ right: spacing.sm })
            Text(this.syncing === 'full' ? '全量更新中...' : '全量更新').fontSize(fontSizes.md).fontColor(this.themeText)
          }
          .padding(spacing.md)
          .width('100%')
          .enabled(this.syncing === null)
          .onClick((): void => {
            this.handleSync('full');
          })
          if (this.authStore.user && this.authStore.user.role === 'admin') {
            Divider().color(this.themeBorder).margin({ left: spacing.md, right: spacing.md })
            Row() {
              SymbolGlyph($r('sys.symbol.person_2_fill')).fontSize(18).fontColor([this.themeText]).margin({ right: spacing.sm })
              Text('用户管理').fontSize(fontSizes.md).fontColor(this.themeText)
            }
            .padding(spacing.md)
            .width('100%')
            .onClick((): void => {
              this.menuVisible = false;
              pushRoute(RouteName.ADMIN_USERS);
            })
          }
        }
        .width(180)
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.lg)
        .border({ width: 1, color: this.themeBorder })
        .position({ x: spacing.md, y: 60 })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private CreateCollectionModal() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showCreateModal = false;
        })
      Column({ space: spacing.md }) {
        Text('新建书单').fontSize(fontSizes.lg).fontWeight(FontWeight.Bold).fontColor(this.themeText)
          .width('100%')
          .textAlign(TextAlign.Center)
        TextInput({ placeholder: '书单名称', text: this.newCollectionName })
          .placeholderColor(this.themeTextSec)
          .fontColor(this.themeText)
          .height(48)
          .padding({ left: spacing.md, right: spacing.md })
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .width('100%')
          .onChange((v: string): void => {
            this.newCollectionName = v;
          })
        Row({ space: spacing.sm }) {
          Button('取消')
            .backgroundColor(this.themeBorder)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .onClick((): void => {
              this.showCreateModal = false;
            })
          Button('创建')
            .backgroundColor(this.themePrimary)
            .fontColor(Color.White)
            .layoutWeight(1)
            .onClick((): void => {
              void this.handleCreateCollection();
            })
        }
        .width('100%')
      }
      .width('80%')
      .padding(spacing.lg)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
      .shadow({ radius: 16, color: 'rgba(0,0,0,0.25)', offsetY: 8 })
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private HeaderActions() {
    Row() {
      // 左侧:加号(对齐 mobile headerLeft)
      Row() {
        SymbolGlyph($r('sys.symbol.plus'))
          .fontSize(26)
          .fontColor([this.themeText])
      }
      .width(40).height(40)
      .justifyContent(FlexAlign.Center)
      .onClick((): void => {
        this.menuVisible = true;
      })
      Blank()
      // 右侧:扫码 + 设置(对齐 mobile headerRight)
      Row() {
        AppIcon({ kind: AppIconKind.QrCode, iconSize: 22, iconColor: this.themeText })
      }
      .width(40).height(40)
      .justifyContent(FlexAlign.Center)
      .onClick((): void => {
        pushRoute(RouteName.SCAN_LOGIN);
      })
      Row() {
        AppIcon({ kind: AppIconKind.Settings, iconSize: 22, iconColor: this.themeText })
      }
      .width(40).height(40)
      .margin({ left: spacing.sm })
      .justifyContent(FlexAlign.Center)
      .onClick((): void => {
        pushRoute(RouteName.SETTINGS);
      })
    }
    .width('100%')
    .padding({ left: spacing.md, right: spacing.md })
  }

  @Builder
  private ReadingTimeCard() {
    if (this.authStore.isVip && this.readingSummary) {
      Row() {
        SymbolGlyph($r('sys.symbol.clock')).fontSize(24).fontColor([Color.White])
        Column() {
          Text('阅读时长').fontSize(fontSizes.s).fontColor('#FFFFFF').opacity(0.8)
          Text(this.formatReading())
            .fontSize(fontSizes.md)
            .fontColor(Color.White)
            .fontWeight(FontWeight.Bold)
        }
        .alignItems(HorizontalAlign.Start)
        .margin({ left: spacing.md })
        .layoutWeight(1)
        SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(20).fontColor([Color.White])
      }
      .padding(spacing.lg)
      .backgroundColor(this.themePrimary)
      .borderRadius(borderRadius.lg)
      .width('100%')
      .onClick((): void => {
        pushRoute(RouteName.STATS);
      })
    } else {
      Row() {
        AppIcon({ kind: AppIconKind.Diamond, iconSize: 24, iconColor: '#FFFFFF' })
        Column() {
          Text('阅读时长').fontSize(fontSizes.s).fontColor('#FFFFFF').opacity(0.8)
          Text('开通会员解锁阅读时长统计')
            .fontSize(fontSizes.md)
            .fontColor(Color.White)
            .fontWeight(FontWeight.Bold)
        }
        .alignItems(HorizontalAlign.Start)
        .margin({ left: spacing.md })
        .layoutWeight(1)
        SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(20).fontColor([Color.White])
      }
      .padding(spacing.lg)
      .backgroundColor(this.themeText2)
      .borderRadius(borderRadius.lg)
      .width('100%')
      .onClick((): void => {
        pushRoute(RouteName.MEMBER_BENEFITS);
      })
    }
  }

  private formatReading(): string {
    const r: ReadingTimeSummary | null = this.readingSummary;
    if (!r) {
      return '今日还没有阅读';
    }
    const fmt = (secs: number): string => {
      if (secs < 60) {
        return `${secs}秒`;
      }
      if (secs < 3600) {
        return `${Math.floor(secs / 60)}分钟`;
      }
      const h: number = Math.floor(secs / 3600);
      const m: number = Math.floor((secs % 3600) / 60);
      return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
    };
    if (r.todaySecs > 0) {
      return `今日阅读 ${fmt(r.todaySecs)}`;
    }
    if (r.weekSecs > 0) {
      return `本周阅读 ${fmt(r.weekSecs)}`;
    }
    if (r.monthSecs > 0) {
      return `本月阅读 ${fmt(r.monthSecs)}`;
    }
    if (r.yearSecs > 0) {
      return `今年阅读 ${fmt(r.yearSecs)}`;
    }
    return '今日还没有阅读';
  }

  @Builder
  private TabsBar() {
    Row() {
      this.TabItem('collections', '书单')
      this.TabItem('reading', '在读')
      this.TabItem('favorites', '收藏')
      this.TabItem('downloads', '下载')
      this.TabItem('notes', '笔记')
    }
    .width('100%')
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.lg)
  }

  @Builder
  private TabItem(key: TabKey, label: string) {
    Column() {
      Text(label)
        .fontSize(fontSizes.md)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.activeTab === key ? this.themePrimary : this.themeTextSec)
    }
    .layoutWeight(1)
    .padding({ top: spacing.md, bottom: spacing.md })
    .border({
      width: { bottom: 2 },
      color: this.activeTab === key ? this.themePrimary : Color.Transparent,
    })
    .onClick((): void => {
      this.activeTab = key;
    })
  }

  @Builder
  private BookCard(book: Book) {
    Row() {
      if (book.coverUrl) {
        Image(book.coverUrl)
          .width(60).height(90)
          .borderRadius(borderRadius.sm)
          .objectFit(ImageFit.Cover)
      } else {
        Column() {
          Text(book.title.charAt(0))
            .fontSize(24)
            .fontWeight(FontWeight.Bold)
            .fontColor(Color.White)
        }
        .width(60).height(90)
        .backgroundColor(getBookGradient(book.title))
        .borderRadius(borderRadius.sm)
        .justifyContent(FlexAlign.Center)
      }
      Column() {
        Text(book.title).fontSize(fontSizes.md).fontColor(this.themeText).fontWeight(FontWeight.Medium)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(book.author || '未知作者').fontSize(fontSizes.s).fontColor(this.themeTextSec).margin({ top: 2 })
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)
      .margin({ left: spacing.sm })
    }
    .padding(spacing.sm)
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.md)
    .width('100%')
    .onClick((): void => {
      const p: RouteBookParams = { book };
      pushRoute(RouteName.BOOK_DETAILS, p);
    })
  }

  @Builder
  private CollectionCard(col: Collection) {
    Row() {
      SymbolGlyph($r('sys.symbol.folder_fill')).fontSize(32).fontColor([this.themePrimary])
      Column() {
        Text(col.name).fontSize(fontSizes.md).fontColor(this.themeText).fontWeight(FontWeight.Medium)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(`${col.bookCount || 0} 本书`).fontSize(fontSizes.s).fontColor(this.themeTextSec).margin({ top: 2 })
      }
      .layoutWeight(1)
      .margin({ left: spacing.sm })
      .alignItems(HorizontalAlign.Start)
      SymbolGlyph($r('sys.symbol.chevron_right')).fontSize(20).fontColor([this.themeTextSec])
    }
    .padding(spacing.md)
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.md)
    .width('100%')
    .onClick((): void => {
      const p: RouteCollectionParams = { collectionId: col.id };
      pushRoute(RouteName.COLLECTION_DETAIL, p);
    })
  }

  @Builder
  private NoteCard(note: Note) {
    Column({ space: spacing.sm }) {
      Row() {
        Text(note.bookTitle || '未知书籍').fontSize(fontSizes.md).fontColor(this.themeText).fontWeight(FontWeight.Bold)
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(note.author || '未知作者').fontSize(fontSizes.s).fontColor(this.themeTextSec)
      }
      .width('100%')
      Column() {
        Text(note.text || '').fontSize(fontSizes.s).fontColor(this.themeText).fontStyle(FontStyle.Italic)
      }
      .padding(spacing.sm)
      .border({ width: { left: 3 }, color: this.themePrimary })
      .borderRadius(borderRadius.sm)
      .backgroundColor(this.themeBg)
      .alignItems(HorizontalAlign.Start)
      .width('100%')
      if (note.note) {
        Text(note.note).fontSize(fontSizes.s).fontColor(this.themeTextSec).width('100%')
      }
      Text(this.formatDate(note.createdAt)).fontSize(fontSizes.xs).fontColor(this.themeTextSec).width('100%')
    }
    .padding(spacing.md)
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.md)
    .width('100%')
  }

  private formatDate(iso: string): string {
    try {
      const d: Date = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return iso;
    }
  }

  build() {
    Stack() {
      Column() {
        this.HeaderActions()
        // ArkUI Scroll 默认 align: Center,内容短时会垂直居中(头像掉下来)
        Scroll() {
          Column({ space: spacing.md }) {
            // 用户头像 + 用户名 + VIP(上下布局,对齐 mobile profileHeader)
            Column() {
              Column() {
                Text(this.authStore.user?.username?.charAt(0).toUpperCase() || 'U')
                  .fontSize(fontSizes.xxxxl)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(Color.White)
              }
              .width(80).height(80)
              .borderRadius(40)
              .backgroundColor(this.themePrimary)
              .justifyContent(FlexAlign.Center)
              Row() {
                Text(this.authStore.user?.username || '用户')
                  .fontSize(fontSizes.xl)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.themeText)
                AppIcon({
                  kind: AppIconKind.Diamond,
                  iconSize: 20,
                  iconColor: this.authStore.isVip ? DIAMOND_GOLD : this.themeText2
                })
                  .margin({ left: spacing.xs })
                  .onClick((): void => {
                    if (this.authStore.isVip) {
                      pushRoute(RouteName.MEMBER_DETAIL);
                    } else {
                      pushRoute(RouteName.MEMBER_BENEFITS);
                    }
                  })
              }
              .margin({ top: spacing.md })
            }
            .alignItems(HorizontalAlign.Center)
            .width('100%')
            .padding({ left: spacing.sm, right: spacing.sm })

            this.ReadingTimeCard()

            this.TabsBar()

            if (this.isLoading) {
              LoadingProgress().color(this.themePrimary).margin({ top: spacing.xl }).width(40)
            } else if (this.activeTab === 'collections') {
              Column({ space: spacing.sm }) {
                if (this.collections.length === 0) {
                  Text('暂无书单').fontSize(fontSizes.md).fontColor(this.themeTextSec).padding(spacing.xl).width('100%').textAlign(TextAlign.Center)
                } else {
                  ForEach(this.collections, (col: Collection): void => {
                    this.CollectionCard(col)
                  }, (col: Collection): string => col.id)
                }
              }
            } else if (this.activeTab === 'reading') {
              Column({ space: spacing.sm }) {
                if (this.inProgressBooks.length === 0) {
                  Text('暂无在读书籍').fontSize(fontSizes.md).fontColor(this.themeTextSec).padding(spacing.xl).width('100%').textAlign(TextAlign.Center)
                } else {
                  ForEach(this.inProgressBooks, (b: Book): void => {
                    this.BookCard(b)
                  }, (b: Book): string => b.id)
                }
              }
            } else if (this.activeTab === 'favorites') {
              Column({ space: spacing.sm }) {
                if (this.favorites.length === 0) {
                  Text('暂无收藏').fontSize(fontSizes.md).fontColor(this.themeTextSec).padding(spacing.xl).width('100%').textAlign(TextAlign.Center)
                } else {
                  ForEach(this.favorites, (b: Book): void => {
                    this.BookCard(b)
                  }, (b: Book): string => b.id)
                }
              }
            } else if (this.activeTab === 'downloads') {
              Column({ space: spacing.sm }) {
                if (this.downloadedBooks.length === 0) {
                  Text('暂无下载').fontSize(fontSizes.md).fontColor(this.themeTextSec).padding(spacing.xl).width('100%').textAlign(TextAlign.Center)
                } else {
                  ForEach(this.downloadedBooks, (b: Book): void => {
                    this.BookCard(b)
                  }, (b: Book): string => b.id)
                }
              }
            } else if (this.activeTab === 'notes') {
              Column({ space: spacing.sm }) {
                if (this.notes.length === 0) {
                  Text('暂无笔记').fontSize(fontSizes.md).fontColor(this.themeTextSec).padding(spacing.xl).width('100%').textAlign(TextAlign.Center)
                } else {
                  ForEach(this.notes, (n: Note): void => {
                    this.NoteCard(n)
                  }, (n: Note): string => n.id)
                }
              }
            }
          }
          .width('100%')
          .padding(spacing.md)
        }
        .align(Alignment.Top)
        .layoutWeight(1)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.themeBg)

      if (this.menuVisible) {
        this.MenuModal()
      }
      if (this.showCreateModal) {
        this.CreateCollectionModal()
      }
    }
    .width('100%')
    .height('100%')
  }
}