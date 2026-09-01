// [API 23+] screens/MemberPaymentSuccessScreen.ets — 1:1 对齐 mobile MemberPaymentSuccessScreen.tsx
// 支付成功页:3 秒倒计时 + 自动返回,显示会员等级 + 有效期
// mobile → hm 关键差异:
//   1. AsyncStorage.getItem('bookdock_plus_user') → PreferencesStore.readString(PLus_USER)
//   2. navigation.getParent()?.goBack() → popToRoot()(hm 没有嵌套导航,直接回根)
//   3. gestureEnabled: false + headerLeft: null → NavDestination 无返回键,只能点按钮跳走
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { replaceRoute, popToRoot, RouteName } from '../router/AppRouter';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';

// ─── Plus 用户信息(对齐 mobile bookdock_plus_user 存储结构)───────────────
interface PlusUser {
  level: string; // 'lifetime' | 'year' | 'free'
}

@Component
export struct MemberPaymentSuccessScreen {
  @State private countdown: number = 3;
  @State private vipUser: PlusUser | null = null;
  private timerId: number = -1;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';

  aboutToAppear(): void {
    this.applyTheme();
    void this.loadUser();
    this.startCountdown();
  }

  aboutToDisappear(): void {
    if (this.timerId >= 0) {
      clearInterval(this.timerId);
      this.timerId = -1;
    }
  }

  private applyTheme(): void {
    const t: Theme = getTheme(false);
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
  }

  // ─── 加载会员信息(对齐 mobile loadUser)─────────────────────────────
  private async loadUser(): Promise<void> {
    try {
      const stored: string = await PreferencesStore.readString(PrefKey.PLus_USER, '');
      if (stored) {
        this.vipUser = JSON.parse(stored) as PlusUser;
      }
    } catch {
      // 静默失败
    }
  }

  // ─── 3 秒倒计时(对齐 mobile useEffect setInterval)────────────────────
  private startCountdown(): void {
    this.timerId = setInterval((): void => {
      this.countdown = this.countdown - 1;
      if (this.countdown <= 0) {
        clearInterval(this.timerId);
        this.timerId = -1;
        // 倒计时结束自动返回(对齐 mobile countdown === 0)
        this.handleGoBack();
      }
    }, 1000);
  }

  // ─── 会员等级名称(对齐 mobile levelName)─────────────────────────────
  private levelName(): string {
    if (!this.vipUser) {
      return '会员';
    }
    if (this.vipUser.level === 'lifetime') {
      return '永久卡';
    }
    if (this.vipUser.level === 'year') {
      return '年卡';
    }
    return '会员';
  }

  // ─── 有效期文本(对齐 mobile cardExpiry)───────────────────────────────
  private expiryText(): string {
    if (this.vipUser?.level === 'lifetime') {
      return '永久有效';
    }
    return '1年有效期';
  }

  // ─── 查看会员详情(对齐 mobile navigation.replace('MemberDetail'))──────
  private handleViewDetail(): void {
    replaceRoute(RouteName.MEMBER_DETAIL);
  }

  // ─── 返回书架(对齐 mobile navigation.getParent()?.goBack())────────────
  private handleGoBack(): void {
    popToRoot();
  }

  build() {
    Column() {
      Column() {
        // ─── 成功图标(对齐 mobile successIcon)───────────────────────────
        Column() {
          Text('✅')
            .fontSize(40)
        }
        .width(80)
        .height(80)
        .borderRadius(40)
        .backgroundColor('#10b981')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .margin({ bottom: spacing.lg })

        // ─── 标题(对齐 mobile title)────────────────────────────────────
        Text('支付成功！')
          .fontSize(fontSizes.xxl)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.themeText)
          .margin({ bottom: spacing.xs })

        // ─── 副标题(对齐 mobile subtitle)────────────────────────────────
        Text(`恭喜您已成为 BookDock ${this.levelName()} 🎉`)
          .fontSize(fontSizes.md)
          .fontColor(this.themeTextSec)
          .margin({ bottom: spacing.xl })

        // ─── 会员卡(对齐 mobile card)────────────────────────────────────
        Column() {
          Row() {
            Text('👑')
              .fontSize(28)
            Column() {
              Text(this.levelName())
                .fontSize(fontSizes.lg)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.themeText)
              Text(this.expiryText())
                .fontSize(fontSizes.sm)
                .fontColor('#16a34a')
                .margin({ top: 2 })
            }
            .alignItems(HorizontalAlign.Start)
            .margin({ left: spacing.md })
          }
          .width('100%')
          .padding(spacing.md)
          .backgroundColor('#dcfce7')
          .borderRadius(borderRadius.lg)
          .alignItems(VerticalAlign.Center)
          .margin({ bottom: spacing.md })

          Text('会员特权已开通，可随时在"我的会员"中查看')
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .textAlign(TextAlign.Center)
            .width('100%')
        }
        .width('100%')
        .padding(spacing.lg)
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.xl)
        .margin({ bottom: spacing.xl })

        // ─── 按钮组(对齐 mobile actions)─────────────────────────────────
        Column() {
          Text('👑 查看会员详情')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor('#FFFFFF')
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding({ top: spacing.md, bottom: spacing.md })
            .backgroundColor('#10b981')
            .borderRadius(borderRadius.lg)
            .onClick((): void => {
              this.handleViewDetail();
            })

          Text('📚 返回书架')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding({ top: spacing.md, bottom: spacing.md })
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.lg)
            .margin({ top: spacing.sm })
            .onClick((): void => {
              this.handleGoBack();
            })
        }
        .width('100%')

        // ─── 倒计时(对齐 mobile countdown)───────────────────────────────
        if (this.countdown > 0) {
          Text(`${this.countdown} 秒后自动返回`)
            .fontSize(fontSizes.xs)
            .fontColor(this.themeTextSec)
            .margin({ top: spacing.lg })
        }
      }
      .width('100%')
      .layoutWeight(1)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .padding(spacing.lg)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }
}
