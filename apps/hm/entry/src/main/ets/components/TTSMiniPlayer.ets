// [API 23+] components/TTSMiniPlayer.ets — P4 阶段实装 AVPlayer 联动
// P1 阶段渲染全局占位浮层,确保 MainTabNavigator 三 Tab 切换不被遮挡。
import { getTheme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from './AppIcon';

@Component
export struct TTSMiniPlayer {
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themePrimary: string = '#4A90D9';

  aboutToAppear(): void {
    const t = getTheme(false);
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themePrimary = t.colors.primary;
  }

  build() {
    Row() {
      AppIcon({ kind: AppIconKind.Play, iconSize: 20, iconColor: this.themePrimary })
        .margin({ right: spacing.sm })
      Column() {
        Text('TTS 听书').fontSize(fontSizes.s).fontColor(this.themeText).fontWeight(FontWeight.Medium)
        Text('P4 阶段实装').fontSize(fontSizes.xs).fontColor(this.themeTextSec)
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      SymbolGlyph($r('sys.symbol.play_fill')).fontSize(20).fontColor([this.themeText])
    }
    .padding({ left: spacing.md, right: spacing.md })
    .height(48)
    .backgroundColor(this.themeSurface)
    .borderRadius(borderRadius.lg)
    .border({ width: 1, color: '#E5E7EB' })
    .margin({ left: spacing.md, right: spacing.md, bottom: 56 + spacing.sm })
    .shadow({ radius: 8, color: 'rgba(0,0,0,0.1)', offsetY: 2 })
  }
}