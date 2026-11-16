// [API 23+] screens/TTSReaderScreen.ets — 1:1 对齐 mobile TTSTabScreen.tsx
// TTS 主页(tab):正在播放卡 / 快速收听 4 书 grid / 播放设置(语速/音量条) / 自动播放开关
// mobile → hm 关键差异:
//   1. useTTSStore → @State 镜像(TTSStore 未建,字段先落本页;TTS_PREFS 持久化读语速)
//      - state('playing'/'paused') → @State isPlaying
//      - volume → @State volume(0-1,音量条展示用,不做滑动交互,对齐 mobile 只读展示)
//      - isAutoPlay → @State autoPlay
//   2. useOrientation → 固定双列(宽屏 3 列后续做)
//   3. Ionicons headset/volume-low/volume-high → AppIcon.Headset / 几何字符
import { Book } from '../model/ApiModels';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { pushRoute, RouteName, TTSParams } from '../router/AppRouter';
import { LibraryStore } from '../store/LibraryStore';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';

@Component
export struct TTSReaderScreen {
  @State private books: Book[] = [];
  @State private currentBookId: string = '';
  @State private isPlaying: boolean = false;
  @State private playbackRate: number = 1.0;
  @State private volume: number = 1.0;
  @State private autoPlay: boolean = true;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';

  aboutToAppear(): void {
    this.applyTheme();
    this.books = LibraryStore.shared().books;
    void this.loadPrefs();
  }

  private applyTheme(): void {
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
  }

  // 读 TTS_PREFS 语速(与 TTSScreen/SettingsScreen 同一 key)
  private async loadPrefs(): Promise<void> {
    try {
      const raw: string = await PreferencesStore.readString(PrefKey.TTS_PREFS, '');
      if (raw.length > 0) {
        const prefs: Record<string, Object> = JSON.parse(raw) as Record<string, Object>;
        const rate: Object | undefined = prefs['playbackRate'];
        if (typeof rate === 'number') {
          this.playbackRate = rate as number;
        }
      }
    } catch {
      // 静默失败
    }
  }

  private findBook(bookId: string): Book | undefined {
    return this.books.find((b: Book): boolean => b.id === bookId);
  }

  private handleBookPress(book: Book): void {
    const p: TTSParams = { book: book };
    pushRoute(RouteName.TTS_SCREEN, p);
  }

  private handlePlayPause(): void {
    this.isPlaying = !this.isPlaying;
  }

  build() {
    Scroll() {
      Column() {
        // ─── 正在播放(对齐 mobile Currently Playing)─────────────────────────
        if (this.currentBookId.length > 0) {
          Column() {
            Text('正在播放')
              .fontSize(fontSizes.lg)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeText)
              .width('100%')
              .margin({ bottom: spacing.xs })

            Row() {
              Column() {
                Text(this.findBook(this.currentBookId)?.title.charAt(0) || '?')
                  .fontSize(fontSizes.xl)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.themeTextSec)
              }
              .width(50)
              .height(50)
              .borderRadius(borderRadius.md)
              .justifyContent(FlexAlign.Center)
              .alignItems(HorizontalAlign.Center)
              .backgroundColor(this.themeBorder)

              Column({ space: 2 }) {
                Text(this.findBook(this.currentBookId)?.title || '未知')
                  .fontSize(fontSizes.md)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themeText)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                  .width('100%')
                  .textAlign(TextAlign.Start)
                Text(this.findBook(this.currentBookId)?.author || '未知')
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeTextSec)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                  .width('100%')
                  .textAlign(TextAlign.Start)
              }
              .layoutWeight(1)
              .margin({ left: spacing.md })
              .alignItems(HorizontalAlign.Start)

              // 播放/暂停按钮(对齐 mobile playButton 44x44 圆形)
              Column() {
                AppIcon({ kind: AppIconKind.Play, iconSize: 24, iconColor: '#FFFFFF' })
              }
              .width(44)
              .height(44)
              .borderRadius(22)
              .justifyContent(FlexAlign.Center)
              .alignItems(HorizontalAlign.Center)
              .backgroundColor(this.themePrimary)
              .onClick((): void => {
                this.handlePlayPause();
              })
            }
            .width('100%')
            .padding(spacing.md)
            .alignItems(VerticalAlign.Center)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.lg)
          }
          .width('100%')
          .margin({ bottom: spacing.xl })
        }

        // ─── 快速收听(对齐 mobile Quick Start,前 4 本)──────────────────────
        Column() {
          Text('快速收听')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .width('100%')
            .margin({ bottom: spacing.xs })
          Text('选择一本书开始收听')
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .width('100%')
            .margin({ bottom: spacing.md })

          Flex({ wrap: FlexWrap.Wrap }) {
            ForEach(this.books.slice(0, 4), (book: Book) => {
              Column() {
                Column() {
                  AppIcon({ kind: AppIconKind.Headset, iconSize: 24, iconColor: this.themeTextSec })
                }
                .width(60)
                .height(60)
                .borderRadius(borderRadius.md)
                .justifyContent(FlexAlign.Center)
                .alignItems(HorizontalAlign.Center)
                .backgroundColor(this.themeBorder)
                .margin({ bottom: spacing.sm })

                Text(book.title)
                  .fontSize(fontSizes.sm)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themeText)
                  .textAlign(TextAlign.Center)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
              }
              .width('48%')
              .padding(spacing.md)
              .alignItems(HorizontalAlign.Center)
              .backgroundColor(this.themeSurface)
              .borderRadius(borderRadius.lg)
              .margin({ right: spacing.sm, bottom: spacing.sm })
              .onClick((): void => {
                this.handleBookPress(book);
              })
            }, (book: Book): string => book.id)
          }
          .width('100%')
        }
        .width('100%')
        .margin({ bottom: spacing.xl })

        // ─── 播放设置(对齐 mobile Playback Settings)────────────────────────
        Column() {
          Text('播放设置')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .width('100%')
            .margin({ bottom: spacing.xs })

          Column() {
            Row() {
              Text('语速')
                .fontSize(fontSizes.md)
                .fontColor(this.themeText)
                .layoutWeight(1)
              Text(`${this.playbackRate}x`)
                .fontSize(fontSizes.md)
                .fontColor(this.themePrimary)
                .fontWeight(FontWeight.Medium)
            }
            .width('100%')
            .padding({ top: spacing.sm, bottom: spacing.sm })

            Row() {
              Text('音量')
                .fontSize(fontSizes.md)
                .fontColor(this.themeText)
                .layoutWeight(1)

              Row({ space: spacing.sm }) {
                Text('🔈')
                  .fontSize(14)
                // 音量条(对齐 mobile volumeSlider 100x4)
                Stack() {
                  Column()
                    .width(100)
                    .height(4)
                    .backgroundColor(this.themeBorder)
                    .borderRadius(2)
                  Column()
                    .width(this.volume * 100)
                    .height(4)
                    .backgroundColor(this.themePrimary)
                    .borderRadius(2)
                }
                Text('🔊')
                  .fontSize(14)
              }
              .alignItems(VerticalAlign.Center)
            }
            .width('100%')
            .padding({ top: spacing.sm, bottom: spacing.sm })
          }
          .width('100%')
          .padding(spacing.md)
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)
        }
        .width('100%')
        .margin({ bottom: spacing.xl })

        // ─── 自动播放开关(对齐 mobile Auto-play Toggle)──────────────────────
        Row() {
          Column({ space: 2 }) {
            Text('自动播放')
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeText)
            Text('自动播放下一个章节')
              .fontSize(fontSizes.sm)
              .fontColor(this.themeTextSec)
          }
          .layoutWeight(1)
          .alignItems(HorizontalAlign.Start)

          Toggle({ type: ToggleType.Switch, isOn: this.autoPlay })
            .selectedColor(this.themePrimary)
            .onChange((isOn: boolean): void => {
              this.autoPlay = isOn;
            })
        }
        .width('100%')
        .padding(spacing.md)
        .alignItems(VerticalAlign.Center)
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.lg)
      }
      .width('100%')
      .padding(spacing.md)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
    .scrollBar(BarState.Off)
    .align(Alignment.Top)
  }
}
