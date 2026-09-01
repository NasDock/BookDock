// [API 23+] screens/MemberDetailScreen.ets — 1:1 对齐 mobile MemberDetailScreen.tsx
// 会员详情页:会员等级 / 到期时间 / 4 项特权 grid / 续费升级 / 账户信息 / 退出会员账号
// mobile → hm 关键差异:
//   1. AsyncStorage.getItem('bookdock_plus_user') → PreferencesStore.readString(PLus_USER)
//   2. Ionicons → AppIcon(log-out-outline 无对应,用几何字符)
//   3. LinearGradient 会员卡降级为纯色(取第一色)
//   4. isMembershipPurchaseAvailable() iOS 判断 → hm 暂不区分平台,默认 true
import { promptAction } from '@kit.ArkUI';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { replaceRoute, RouteName } from '../router/AppRouter';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { AuthStore } from '../store/AuthStore';

// ─── Plus 用户信息(对齐 mobile bookdock_plus_user 存储结构)───────────────
interface PlusUser {
  isVip: boolean;
  level: string; // 'lifetime' | 'year' | 'free'
  expiredAt?: string;
  phone?: string;
}

@Component
export struct MemberDetailScreen {
  @State private vipUser: PlusUser | null = null;
  @State private isLoading: boolean = true;

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';

  aboutToAppear(): void {
    this.applyTheme();
    void this.loadUser();
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
      if (!stored) {
        replaceRoute(RouteName.MEMBER_LOGIN);
        return;
      }
      const user: PlusUser = JSON.parse(stored) as PlusUser;
      if (!user.isVip) {
        // 非 VIP 用户进到此屏时,跳 MemberBenefits(对齐 mobile)
        replaceRoute(RouteName.MEMBER_BENEFITS);
        return;
      }
      this.vipUser = user;
    } catch {
      replaceRoute(RouteName.MEMBER_LOGIN);
    } finally {
      this.isLoading = false;
    }
  }

  // ─── 退出会员账号(对齐 mobile handleLogout)──────────────────────────
  private async handleLogout(): Promise<void> {
    await PreferencesStore.delete(PrefKey.PLus_TOKEN);
    await PreferencesStore.delete(PrefKey.PLus_USER);
    await PreferencesStore.delete(PrefKey.PLus_USER_ID);
    AuthStore.shared().clearPlusAuth();
    replaceRoute(RouteName.MEMBER_LOGIN);
  }

  // ─── 会员等级名称(对齐 mobile levelName)─────────────────────────────
  private levelName(): string {
    if (!this.vipUser) {
      return '免费版';
    }
    if (this.vipUser.level === 'lifetime') {
      return '永久卡';
    }
    if (this.vipUser.level === 'year') {
      return '年卡';
    }
    return '免费版';
  }

  // ─── 会员卡渐变色(对齐 mobile levelGradient)─────────────────────────
  private levelColor(): string {
    if (!this.vipUser) {
      return '#9ca3af';
    }
    if (this.vipUser.level === 'lifetime') {
      return '#a855f7';
    }
    if (this.vipUser.level === 'year') {
      return '#f59e0b';
    }
    return '#9ca3af';
  }

  // ─── 到期时间文本(对齐 mobile expiredAt)─────────────────────────────
  private expiryText(): string {
    if (!this.vipUser) {
      return '—';
    }
    if (this.vipUser.level === 'lifetime') {
      return '永久有效';
    }
    if (this.vipUser.expiredAt) {
      try {
        const d: Date = new Date(this.vipUser.expiredAt);
        return d.toLocaleDateString('zh-CN');
      } catch {
        return '—';
      }
    }
    return '—';
  }

  // ─── 剩余天数(对齐 mobile daysLeft)─────────────────────────────────
  private daysLeft(): number | null {
    if (!this.vipUser || this.vipUser.level !== 'year' || !this.vipUser.expiredAt) {
      return null;
    }
    try {
      const expiredAt: Date = new Date(this.vipUser.expiredAt);
      const diff: number = expiredAt.getTime() - Date.now();
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  // ─── 手机号脱敏(对齐 mobile phone.slice)─────────────────────────────
  private maskedPhone(): string {
    if (!this.vipUser?.phone) {
      return '未绑定';
    }
    const phone: string = this.vipUser.phone;
    if (phone.length >= 7) {
      return `${phone.substring(0, 3)}****${phone.substring(phone.length - 4)}`;
    }
    return phone;
  }

  build() {
    Column() {
      if (this.isLoading) {
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else if (this.vipUser) {
        Scroll() {
          Column() {
            // ─── 会员卡(对齐 mobile memberCard)─────────────────────────
            Row() {
              Column() {
                Text('会员等级')
                  .fontSize(fontSizes.xs)
                  .fontColor('rgba(255,255,255,0.8)')
                Text(this.levelName())
                  .fontSize(fontSizes.xxl)
                  .fontWeight(FontWeight.Bold)
                  .fontColor('#FFFFFF')
                  .margin({ top: 4 })
              }
              .alignItems(HorizontalAlign.Start)

              Column() {
                Text(this.vipUser.level === 'lifetime' ? '有效期' : '到期时间')
                  .fontSize(fontSizes.xs)
                  .fontColor('rgba(255,255,255,0.8)')
                Text(this.expiryText())
                  .fontSize(fontSizes.md)
                  .fontWeight(FontWeight.Bold)
                  .fontColor('#FFFFFF')
                  .margin({ top: 4 })
                if (this.daysLeft() !== null && (this.daysLeft() as number) > 0) {
                  Text(`还有 ${this.daysLeft()} 天`)
                    .fontSize(fontSizes.xs)
                    .fontColor('rgba(255,255,255,0.8)')
                    .margin({ top: 4 })
                }
              }
              .alignItems(HorizontalAlign.End)
            }
            .width('100%')
            .padding(spacing.lg)
            .backgroundColor(this.levelColor())
            .borderRadius(borderRadius.xl)
            .justifyContent(FlexAlign.SpaceBetween)
            .margin({ bottom: spacing.lg })

            // ─── 会员特权(对齐 mobile privilegeGrid)─────────────────────
            Column() {
              Text('🎁 会员特权')
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
                .margin({ bottom: spacing.md })
                .width('100%')

              Flex({ wrap: FlexWrap.Wrap }) {
                ForEach(['📷 扫码登录', '🪟 桌面小组件', '💬 优先客服', '🎧 声仓会员'], (item: string) => {
                  Text(item)
                    .fontSize(fontSizes.sm)
                    .fontColor(this.themeText)
                    .padding(spacing.sm)
                    .backgroundColor(this.themeBg)
                    .borderRadius(borderRadius.lg)
                    .width('48%')
                    .margin({ right: spacing.sm, bottom: spacing.sm })
                }, (item: string): string => item)
              }
              .width('100%')
            }
            .width('100%')
            .padding(spacing.lg)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.xl)
            .margin({ bottom: spacing.md })

            // ─── 续费/升级(对齐 mobile renewRow,非 lifetime 才显示)─────────
            if (this.vipUser.level !== 'lifetime') {
              Row() {
                Column() {
                  Text(this.vipUser.level === 'year' ? '升级永久卡' : '续费年卡')
                    .fontSize(fontSizes.md)
                    .fontWeight(FontWeight.Medium)
                    .fontColor(this.themeText)
                  Text(this.vipUser.level === 'year' ? '永久有效' : '¥20/年')
                    .fontSize(fontSizes.sm)
                    .fontColor(this.themeTextSec)
                    .margin({ top: 2 })
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Start)

                Text(this.vipUser.level === 'year' ? '升级 ¥60' : '续费 ¥20')
                  .fontSize(fontSizes.sm)
                  .fontWeight(FontWeight.Medium)
                  .fontColor('#FFFFFF')
                  .padding({ left: spacing.md, right: spacing.md, top: spacing.sm, bottom: spacing.sm })
                  .backgroundColor('#f59e0b')
                  .borderRadius(borderRadius.lg)
                  .onClick((): void => {
                    replaceRoute(RouteName.MEMBER_BENEFITS);
                  })
              }
              .width('100%')
              .padding(spacing.lg)
              .backgroundColor(this.themeSurface)
              .borderRadius(borderRadius.xl)
              .alignItems(VerticalAlign.Center)
              .margin({ bottom: spacing.md })
            }

            // ─── 账户信息(对齐 mobile infoRow)───────────────────────────
            Column() {
              Text('📱 账户信息')
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.themeText)
                .margin({ bottom: spacing.md })
                .width('100%')

              // 手机号
              Row() {
                Text('手机号')
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeTextSec)
                Text(this.maskedPhone())
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeText)
              }
              .width('100%')
              .justifyContent(FlexAlign.SpaceBetween)
              .padding({ top: spacing.sm, bottom: spacing.sm })
              .border({ width: { bottom: 1 }, color: 'rgba(0,0,0,0.1)' })

              // 会员等级
              Row() {
                Text('会员等级')
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeTextSec)
                Text(this.levelName())
                  .fontSize(fontSizes.sm)
                  .fontColor('#f59e0b')
                  .fontWeight(FontWeight.Medium)
              }
              .width('100%')
              .justifyContent(FlexAlign.SpaceBetween)
              .padding({ top: spacing.sm, bottom: spacing.sm })
              .border({ width: { bottom: 1 }, color: 'rgba(0,0,0,0.1)' })

              // 状态
              Row() {
                Text('状态')
                  .fontSize(fontSizes.sm)
                  .fontColor(this.themeTextSec)
                Text('● 正常')
                  .fontSize(fontSizes.sm)
                  .fontColor('#10b981')
                  .fontWeight(FontWeight.Medium)
              }
              .width('100%')
              .justifyContent(FlexAlign.SpaceBetween)
              .padding({ top: spacing.sm, bottom: spacing.sm })
            }
            .width('100%')
            .padding(spacing.lg)
            .backgroundColor(this.themeSurface)
            .borderRadius(borderRadius.xl)
            .margin({ bottom: spacing.md })

            // ─── 退出会员账号(对齐 mobile logoutBtn)───────────────────────
            Row() {
              Text('⊏')
                .fontSize(18)
                .fontColor('#FFFFFF')
              Text('退出会员账号')
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Medium)
                .fontColor('#FFFFFF')
                .margin({ left: spacing.sm })
            }
            .width('100%')
            .padding({ top: spacing.md, bottom: spacing.md })
            .backgroundColor('#ef4444')
            .borderRadius(borderRadius.lg)
            .justifyContent(FlexAlign.Center)
            .alignItems(VerticalAlign.Center)
            .margin({ top: spacing.sm })
            .onClick((): void => {
              void this.handleLogout();
            })
          }
          .width('100%')
          .padding(spacing.lg)
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
