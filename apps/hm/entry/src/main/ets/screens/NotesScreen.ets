// [API 23+] screens/NotesScreen.ets — 1:1 对齐 mobile NotesScreen.tsx
// 书籍/作者笔记列表:header(返回 + 标题 + 搜索) / 笔记卡片(原文 + 想法 + 时间 + 删除) / 按作者搜索 modal
// mobile → hm 关键差异:
//   1. route.params.bookId/author → @Prop initialBookId/initialAuthor(NavDestination 注入)
//   2. RN Alert → promptAction.showDialog
//   3. Ionicons trash/create-outline → AppIcon(Close / DocText)
//   4. toLocaleString('zh-CN', options) → 手写 formatDate(ArkTS 严格模式兼容)
import { promptAction } from '@kit.ArkUI';
import { ApiResponse, Note, NotesListResponse, NotesQuery } from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { ThemeStore, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute, pushRoute, RouteName, NotesParams } from '../router/AppRouter';

@Component
export struct NotesScreen {
  @Prop initialBookId: string = '';
  @Prop initialAuthor: string = '';

  @State private notes: Note[] = [];
  @State private isLoading: boolean = true;
  @State private deletingId: string = '';
  @State private showSearchModal: boolean = false;
  @State private searchAuthor: string = '';

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  private unsubscribeTheme: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeTheme = ThemeStore.shared().subscribe((): void => {
      this.applyTheme();
    });
    void this.fetchNotes();
  }

  aboutToDisappear(): void {
    this.unsubscribeTheme?.();
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

  private titleText(): string {
    if (this.initialBookId) {
      return '书籍笔记';
    }
    if (this.initialAuthor) {
      return `作者: ${this.initialAuthor}`;
    }
    return '全部笔记';
  }

  private emptyText(): string {
    if (this.initialBookId) {
      return '这本书暂无笔记';
    }
    if (this.initialAuthor) {
      return '该作者暂无笔记';
    }
    return '暂无笔记';
  }

  private pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }

  // 对齐 mobile new Date(...).toLocaleString('zh-CN', { year/month/day/hour/minute })
  private formatDate(iso: string): string {
    try {
      const d: Date = new Date(iso);
      if (isNaN(d.getTime())) {
        return iso;
      }
      const y: string = `${d.getFullYear()}`;
      const m: string = this.pad2(d.getMonth() + 1);
      const day: string = this.pad2(d.getDate());
      const h: string = this.pad2(d.getHours());
      const min: string = this.pad2(d.getMinutes());
      return `${y}/${m}/${day} ${h}:${min}`;
    } catch {
      return iso;
    }
  }

  // ─── 拉取笔记(对齐 mobile fetchNotes)──────────────────────────────
  private async fetchNotes(): Promise<void> {
    this.isLoading = true;
    try {
      const q: NotesQuery = {};
      if (this.initialBookId) {
        q.bookId = this.initialBookId;
      }
      if (this.initialAuthor) {
        q.author = this.initialAuthor;
      }
      const res: ApiResponse<NotesListResponse> = await getApiClient().getNotes(q);
      if (res.success && res.data) {
        this.notes = res.data.items ?? [];
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '加载笔记失败', duration: 1500 });
      }
    } catch {
      promptAction.showToast({ message: '加载笔记失败', duration: 1500 });
    } finally {
      this.isLoading = false;
    }
  }

  // ─── 删除笔记(对齐 mobile handleDeleteNote + Alert.alert)───────────
  private handleDeleteNote(noteId: string): void {
    promptAction.showDialog({
      title: '删除笔记',
      message: '确定要删除这条笔记吗？',
      buttons: [
        { text: '取消', color: this.themeTextSec },
        { text: '删除', color: this.themeError }
      ]
    }).then((res: promptAction.ShowDialogSuccessResponse): void => {
      if (res.index === 1) {
        void this.doDeleteNote(noteId);
      }
    });
  }

  private async doDeleteNote(noteId: string): Promise<void> {
    this.deletingId = noteId;
    try {
      const res: ApiResponse<void> = await getApiClient().deleteNote(noteId);
      if (res.success) {
        this.notes = this.notes.filter((n: Note): boolean => n.id !== noteId);
      } else {
        promptAction.showToast({ message: res.error ?? res.message ?? '删除失败', duration: 1500 });
      }
    } catch {
      promptAction.showToast({ message: '删除失败', duration: 1500 });
    } finally {
      this.deletingId = '';
    }
  }

  // ─── 按作者搜索(mobile navigation.navigate('Notes', { author }))────
  private handleSearchByAuthor(): void {
    const author: string = this.searchAuthor.trim();
    if (!author) {
      promptAction.showToast({ message: '请输入作者名称', duration: 1500 });
      return;
    }
    this.showSearchModal = false;
    this.searchAuthor = '';
    const p: NotesParams = { author: author };
    pushRoute(RouteName.NOTES, p);
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
            popRoute();
          })

          Text(this.titleText())
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Row() {
            AppIcon({ kind: AppIconKind.Search, iconSize: 22, iconColor: this.themeText })
          }
          .width(40)
          .height(40)
          .justifyContent(FlexAlign.Center)
          .onClick((): void => {
            this.showSearchModal = true;
          })
        }
        .width('100%')
        .padding({ left: spacing.md, right: spacing.md, top: spacing.lg, bottom: spacing.sm })
        .backgroundColor(this.themeBg)
        .alignItems(VerticalAlign.Center)

        // ─── 列表 ───────────────────────────────────────────────
        if (this.isLoading && this.notes.length === 0) {
          Column() {
            LoadingProgress()
              .width(40)
              .height(40)
              .color(this.themePrimary)
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else if (this.notes.length === 0) {
          Column({ space: spacing.md }) {
            AppIcon({ kind: AppIconKind.DocText, iconSize: 48, iconColor: this.themeTextSec })
            Text(this.emptyText())
              .fontSize(fontSizes.md)
              .fontColor(this.themeTextSec)
              .textAlign(TextAlign.Center)
            Text('去阅读添加笔记')
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Medium)
              .fontColor('#FFFFFF')
              .padding({ left: spacing.lg, right: spacing.lg, top: spacing.sm, bottom: spacing.sm })
              .backgroundColor(this.themePrimary)
              .borderRadius(borderRadius.md)
              .onClick((): void => {
                popRoute();
              })
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .padding(spacing.xl)
        } else {
          Scroll() {
            Column({ space: spacing.md }) {
              ForEach(this.notes, (note: Note) => {
                this.NoteCard(note)
              }, (note: Note): string => note.id)
            }
            .width('100%')
            .padding(spacing.md)
          }
          .width('100%')
          .layoutWeight(1)
          .scrollBar(BarState.Off)
        }
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.themeBg)

      // ─── 按作者搜索 Modal(fade 居中)──────────────────────────────
      if (this.showSearchModal) {
        this.SearchAuthorModal()
      }
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  private NoteCard(note: Note) {
    Column({ space: spacing.sm }) {
      // 书名 + 作者
      Row() {
        Row({ space: spacing.xs }) {
          AppIcon({ kind: AppIconKind.Book, iconSize: 16, iconColor: this.themePrimary })
          Text(note.bookTitle ?? '未知书籍')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)

        Text(note.author ?? '未知作者')
          .fontSize(fontSizes.sm)
          .fontColor(this.themeTextSec)
          .margin({ left: spacing.sm })
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .alignItems(VerticalAlign.Center)

      // 选中的原文
      Column() {
        Text(note.text)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeText)
          .lineHeight(22)
          .fontStyle(FontStyle.Italic)
          .width('100%')
      }
      .width('100%')
      .padding(spacing.sm)
      .backgroundColor(this.themeBg)
      .border({ width: { left: 3 }, color: this.themePrimary })
      .borderRadius(borderRadius.sm)
      .margin({ top: spacing.xs })

      // 我的想法
      if (note.note) {
        Row({ space: spacing.xs }) {
          AppIcon({ kind: AppIconKind.DocText, iconSize: 14, iconColor: this.themeTextSec })
          Text(note.note)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .lineHeight(20)
            .layoutWeight(1)
        }
        .width('100%')
        .alignItems(VerticalAlign.Top)
        .margin({ top: spacing.xs })
      }

      // 时间 + 删除
      Row() {
        Text(this.formatDate(note.createdAt))
          .fontSize(fontSizes.xs)
          .fontColor(this.themeTextSec)
          .layoutWeight(1)
        Row({ space: spacing.xs }) {
          if (this.deletingId === note.id) {
            LoadingProgress()
              .width(18)
              .height(18)
              .color(this.themeError)
          } else {
            AppIcon({ kind: AppIconKind.Close, iconSize: 18, iconColor: this.themeError })
          }
          Text('删除')
            .fontSize(fontSizes.xs)
            .fontColor(this.themeError)
        }
        .enabled(this.deletingId !== note.id)
        .onClick((): void => {
          this.handleDeleteNote(note.id);
        })
      }
      .width('100%')
      .margin({ top: spacing.sm })
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .padding(spacing.md)
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.lg)
  }

  @Builder
  private SearchAuthorModal() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.5)')
        .onClick((): void => {
          this.showSearchModal = false;
        })

      Column({ space: spacing.md }) {
        Text('按作者搜索')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .width('100%')
          .textAlign(TextAlign.Center)

        TextInput({ placeholder: '输入作者名称', text: this.searchAuthor })
          .placeholderColor(this.themeTextSec)
          .fontColor(this.themeText)
          .height(48)
          .padding({ left: spacing.md, right: spacing.md })
          .border({ width: 1, color: this.themeBorder })
          .borderRadius(borderRadius.md)
          .backgroundColor(this.themeBg)
          .width('100%')
          .maxLength(50)
          .onChange((v: string): void => {
            this.searchAuthor = v;
          })

        Row({ space: spacing.sm }) {
          Text('取消')
            .fontSize(fontSizes.md)
            .fontColor(this.themeText)
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
            .height(44)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.md)
            .onClick((): void => {
              this.showSearchModal = false;
            })

          Text('搜索')
            .fontSize(fontSizes.md)
            .fontColor('#FFFFFF')
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
            .height(44)
            .backgroundColor(this.themePrimary)
            .borderRadius(borderRadius.md)
            .onClick((): void => {
              this.handleSearchByAuthor();
            })
        }
        .width('100%')
      }
      .width('80%')
      .padding(spacing.lg)
      .backgroundColor(this.themeSurface)
      .borderRadius(borderRadius.lg)
    }
    .width('100%')
    .height('100%')
  }
}
