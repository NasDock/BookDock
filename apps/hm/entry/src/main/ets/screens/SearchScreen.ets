// [API 23+] screens/SearchScreen.ets — 1:1 对齐 mobile SearchScreen.tsx(占位版)
// mobile 端也是占位(58 行),保证点搜索框不 crash。完整搜索功能待后续 1:1 移植。
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';

@Component
export struct SearchScreen {
  @State private query: string = '';

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';

  aboutToAppear(): void {
    this.applyTheme();
  }

  private applyTheme(): void {
    const t: Theme = getTheme(false);
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
  }

  build() {
    Column() {
      // 搜索框(对齐 mobile searchBar)
      Row() {
        AppIcon({ kind: AppIconKind.Search, iconSize: 20, iconColor: this.themeTextSec })
          .margin({ right: spacing.sm })
        TextInput({ placeholder: '搜索书名、作者...', text: this.query })
          .fontSize(fontSizes.md)
          .fontColor(this.themeText)
          .placeholderColor(this.themeTextSec)
          .layoutWeight(1)
          .onChange((value: string): void => {
            this.query = value;
          })
      }
      .width('100%')
      .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
      .backgroundColor(this.themeSurface)
      .border({ width: 1, color: this.themeBorder })
      .borderRadius(borderRadius.lg)
      .alignItems(VerticalAlign.Center)

      // 占位提示
      Text('搜索结果占位 — 完整 SearchScreen 待后续 1:1 移植。')
        .fontSize(fontSizes.sm)
        .fontColor(this.themeTextSec)
        .fontStyle(FontStyle.Italic)
        .textAlign(TextAlign.Center)
        .margin({ top: spacing.md })
    }
    .width('100%')
    .height('100%')
    .padding(spacing.md)
    .backgroundColor(this.themeBg)
  }
}
