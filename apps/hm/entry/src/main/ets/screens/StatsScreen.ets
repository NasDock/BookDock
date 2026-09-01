// [API 23+] screens/StatsScreen.ets — 1:1 对齐 mobile StatsScreen.tsx
// 阅读统计页:累计时长 / 周期切换(日/周/月/年) / 柱状图 / 阅读明细
// mobile → hm 关键差异:
//   1. useWindowDimensions → 固定宽度布局(P3 阶段先不做响应式图表)
//   2. ScrollView horizontal → Scroll().scrollable(ScrollDirection.Horizontal)
//   3. Ionicons time-outline/book-outline → AppIcon
//   4. 非 VIP 重定向 → 暂不判断(hm 端会员体系待 Plus API 对接)
import { promptAction } from '@kit.ArkUI';
import {
  ApiResponse,
  DailyHourItem,
  DailyHourStats,
  PeriodBreakdownItem,
  PeriodReadingStats,
  ReadingPeriod,
  ReadingTimeSummary
} from '../model/ApiModels';
import { getApiClient } from '../network/ApiClient';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute } from '../router/AppRouter';

// ─── 周期标签(对齐 mobile PERIOD_LABELS)─────────────────────────────
const PERIOD_LABELS: string[] = ['日', '周', '月', '年'];
const PERIOD_VALUES: ReadingPeriod[] = ['day', 'week', 'month', 'year'];

// ─── 时长格式化(对齐 mobile formatDuration)───────────────────────────
function formatDuration(secs: number): string {
  if (secs < 60) {
    return `${secs}秒`;
  }
  if (secs < 3600) {
    return `${Math.floor(secs / 60)}分钟`;
  }
  const hours: number = Math.floor(secs / 3600);
  const mins: number = Math.floor((secs % 3600) / 60);
  if (mins === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${mins}分钟`;
}

// ─── 图表数据项(统一 period breakdown 和 daily hours)─────────────────
interface ChartItem {
  label: string;
  durationSecs: number;
}

@Component
export struct StatsScreen {
  @State private period: ReadingPeriod = 'week';
  @State private stats: PeriodReadingStats | null = null;
  @State private dailyHours: DailyHourStats | null = null;
  @State private isLoading: boolean = false;
  @State private totalTime: number = 0;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';

  aboutToAppear(): void {
    this.applyTheme();
    void this.fetchSummary();
    void this.fetchStats();
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

  // ─── 累计时长(对齐 mobile fetchSummary)─────────────────────────────
  private async fetchSummary(): Promise<void> {
    try {
      const api = getApiClient();
      const res: ApiResponse<ReadingTimeSummary> = await api.getReadingTimeSummary();
      if (res.success && res.data) {
        this.totalTime = res.data.totalSecs;
      }
    } catch {
      // 静默失败
    }
  }

  // ─── 周期统计(对齐 mobile fetchStats)───────────────────────────────
  private async fetchStats(): Promise<void> {
    this.isLoading = true;
    try {
      const api = getApiClient();
      const res: ApiResponse<PeriodReadingStats> = await api.getPeriodReadingStats(this.period);
      if (res.success && res.data) {
        this.stats = res.data;
      }
    } catch {
      promptAction.showToast({ message: '加载统计失败', duration: 1500 });
    } finally {
      this.isLoading = false;
    }

    // 日视图额外拉 24 小时分布(对齐 mobile fetchDaily)
    if (this.period === 'day') {
      try {
        const api = getApiClient();
        const res: ApiResponse<DailyHourStats> = await api.getDailyReadingHours();
        if (res.success && res.data) {
          this.dailyHours = res.data;
        }
      } catch {
        // 静默失败
      }
    } else {
      this.dailyHours = null;
    }
  }

  // ─── 图表数据(对齐 mobile chartData)─────────────────────────────────
  private chartData(): ChartItem[] {
    if (this.period === 'day' && this.dailyHours) {
      return this.dailyHours.hours.map((h: DailyHourItem): ChartItem => {
        return { label: `${h.hour}时`, durationSecs: h.durationSecs };
      });
    }
    if (this.stats) {
      return this.stats.breakdown.map((b: PeriodBreakdownItem): ChartItem => {
        return { label: b.label, durationSecs: b.durationSecs };
      });
    }
    return [];
  }

  // ─── 最大值(对齐 mobile maxValue)────────────────────────────────────
  private maxValue(): number {
    const data: ChartItem[] = this.chartData();
    if (data.length === 0) {
      return 1;
    }
    return Math.max(...data.map((d: ChartItem) => d.durationSecs), 1);
  }

  // ─── 图表标题(对齐 mobile chartTitle)────────────────────────────────
  private chartTitle(): string {
    if (this.period === 'day') {
      return '24小时分布';
    }
    const idx: number = PERIOD_VALUES.indexOf(this.period);
    return `${PERIOD_LABELS[idx]}阅读分布`;
  }

  // ─── 周期索引(对齐 mobile period)────────────────────────────────────
  private periodIndex(): number {
    return PERIOD_VALUES.indexOf(this.period);
  }

  build() {
    Column() {
      // ─── Header(对齐 mobile header)───────────────────────────────────
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

        Text('阅读统计')
          .fontSize(fontSizes.lg)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)

        Column()
          .width(40)
          .height(40)
      }
      .width('100%')
      .padding({ left: spacing.md, right: spacing.md, top: spacing.xl + 8, bottom: spacing.md })
      .backgroundColor(this.themeSurface)
      .alignItems(VerticalAlign.Center)

      Scroll() {
        Column({ space: spacing.md }) {
          // ─── 汇总卡片(对齐 mobile summaryCards)─────────────────────────
          Row({ space: spacing.md }) {
            Column({ space: spacing.xs }) {
              AppIcon({ kind: AppIconKind.Refresh, iconSize: 20, iconColor: this.themePrimary })
              Text('累计阅读')
                .fontSize(fontSizes.sm)
                .fontColor(this.themeTextSec)
              Text(formatDuration(this.totalTime))
                .fontSize(fontSizes.lg)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
            }
            .layoutWeight(1)
            .padding(spacing.lg)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.lg)
            .alignItems(HorizontalAlign.Center)

            Column({ space: spacing.xs }) {
              AppIcon({ kind: AppIconKind.Book, iconSize: 20, iconColor: this.themePrimary })
              Text('本周期')
                .fontSize(fontSizes.sm)
                .fontColor(this.themeTextSec)
              Text(this.stats ? formatDuration(this.stats.totalDurationSecs) : '0分钟')
                .fontSize(fontSizes.lg)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
            }
            .layoutWeight(1)
            .padding(spacing.lg)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.lg)
            .alignItems(HorizontalAlign.Center)
          }
          .width('100%')

          // ─── 周期切换 Tab(对齐 mobile tabBar)───────────────────────────
          Row({ space: spacing.xs }) {
            ForEach(PERIOD_LABELS, (label: string, index: number) => {
              Text(label)
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.periodIndex() === index ? '#FFFFFF' : this.themeTextSec)
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
                .padding({ top: spacing.sm, bottom: spacing.sm })
                .backgroundColor(this.periodIndex() === index ? this.themePrimary : this.themeSurface)
                .borderRadius(borderRadius.md)
                .onClick((): void => {
                  this.period = PERIOD_VALUES[index];
                  void this.fetchStats();
                })
            }, (label: string): string => label)
          }
          .width('100%')
          .padding(spacing.xs)
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)

          // ─── 图表(对齐 mobile chartCard)───────────────────────────────
          Column() {
            Text(this.chartTitle())
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeText)
              .margin({ bottom: spacing.lg })
              .width('100%')

            if (this.isLoading) {
              Column() {
                LoadingProgress()
                  .width(32)
                  .height(32)
                  .color(this.themePrimary)
              }
              .width('100%')
              .height(200)
              .justifyContent(FlexAlign.Center)
              .alignItems(HorizontalAlign.Center)
            } else if (this.stats && this.stats.totalDurationSecs > 0) {
              // 柱状图(对齐 mobile chartContainer)
              Scroll() {
                Row({ space: 6 }) {
                  ForEach(this.chartData(), (item: ChartItem, index: number) => {
                    Column({ space: spacing.xs }) {
                      // 柱子
                      Column() {
                        Column()
                          .width('100%')
                          .height(`${Math.max((item.durationSecs / this.maxValue()) * 100, 2)}%`)
                          .backgroundColor(this.themePrimary)
                          .borderRadius(4)
                      }
                      .width(this.period === 'week' ? 40 : 28)
                      .height(180)
                      .justifyContent(FlexAlign.End)

                      // 标签
                      Text(item.label)
                        .fontSize(10)
                        .fontColor(this.themeTextSec)
                        .maxLines(1)
                    }
                    .alignItems(HorizontalAlign.Center)
                  }, (item: ChartItem, index: number): string => `bar_${index}`)
                }
                .alignItems(VerticalAlign.Bottom)
                .padding({ left: spacing.xs, right: spacing.xs })
              }
              .width('100%')
              .height(220)
              .scrollable(ScrollDirection.Horizontal)
              .scrollBar(BarState.Off)
            } else {
              // 空状态(对齐 mobile emptyContainer)
              Column() {
                AppIcon({ kind: AppIconKind.Book, iconSize: 48, iconColor: this.themeTextSec })
                  .opacity(0.3)
                  .margin({ bottom: 12 })
                Text('暂无阅读数据')
                  .fontSize(fontSizes.md)
                  .fontColor(this.themeTextSec)
                Text(`${PERIOD_LABELS[this.periodIndex()]}内还没有阅读记录`)
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeTextSec)
                  .opacity(0.7)
                  .margin({ top: 4 })
              }
              .width('100%')
              .height(200)
              .justifyContent(FlexAlign.Center)
              .alignItems(HorizontalAlign.Center)
            }
          }
          .width('100%')
          .padding(spacing.lg)
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)

          // ─── 阅读明细(对齐 mobile breakdownCard)─────────────────────────
          if (this.stats && this.stats.totalDurationSecs > 0) {
            Column({ space: spacing.sm }) {
              Text('阅读明细')
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
                .margin({ bottom: spacing.sm })
                .width('100%')

              ForEach(
                this.stats.breakdown.filter((b: PeriodBreakdownItem) => b.durationSecs > 0),
                (b: PeriodBreakdownItem, index: number) => {
                  Row() {
                    Text(b.label)
                      .fontSize(fontSizes.md)
                      .fontColor(this.themeText)
                    Text(formatDuration(b.durationSecs))
                      .fontSize(fontSizes.md)
                      .fontWeight(FontWeight.Medium)
                      .fontColor(this.themePrimary)
                  }
                  .width('100%')
                  .justifyContent(FlexAlign.SpaceBetween)
                  .alignItems(VerticalAlign.Center)
                  .padding({ top: spacing.sm, bottom: spacing.sm })
                  .border({ width: { bottom: 1 }, color: this.themeBorder })
                },
                (b: PeriodBreakdownItem, index: number): string => `breakdown_${index}`
              )
            }
            .width('100%')
            .padding(spacing.lg)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.lg)
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
