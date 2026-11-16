// [API 23+] screens/AdminUsersScreen.ets — 1:1 对齐 mobile AdminUsersScreen.tsx(占位版)
// mobile 端也是占位(26 行),用户管理页后续 1:1 移植。
import { getTheme, Theme, spacing, fontSizes } from '../theme/Theme';

@Component
export struct AdminUsersScreen {
  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeTextSec: string = '#6B7280';

  aboutToAppear(): void {
    this.applyTheme();
  }

  private applyTheme(): void {
    const t: Theme = getTheme(false);
    this.themeBg = t.colors.background;
    this.themeTextSec = t.colors.textSecondary;
  }

  build() {
    Column() {
      Text('用户管理占位（仅 admin 角色可见）')
        .fontSize(fontSizes.md)
        .fontColor(this.themeTextSec)
        .fontStyle(FontStyle.Italic)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding(spacing.lg)
    .backgroundColor(this.themeBg)
  }
}
