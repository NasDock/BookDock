// [API 23+] screens/SettingsScreen.ets — 1:1 对齐 mobile SettingsScreen.tsx
// 设置页:账户(用户名/会员类型) / 偏好设置(外观/阅读设置/语音朗读设置) /
// 安全(修改密码) / 内测计划 / 关于(存储空间/检查更新/版本) + 退出登录/注销会员账号
// mobile → hm 关键差异:
//   1. useCheckUpdate / UpdateModal → hm 暂占位(toast「暂不支持」),hm 版本分发不
//      走应用内下载更新(与 mobile unsupported 分支一致)
//   2. notificationService / fileSystemService → hm 端无对应模块,清缓存/通知行不展示
//      (mobile 实际渲染的行里本就没有通知开关,对齐 mobile 最终 UI)
//   3. Ionicons → AppIcon(crown 无对应用 Diamond,flask 用「⚗」几何字符)
//   4. RN Modal(主题选择) → Stack 全屏 overlay
//   5. AsyncStorage plus key → PreferencesStore PrefKey.PLus_USER_ID
import { promptAction } from '@kit.ArkUI';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore, ThemeMode } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { pushRoute, RouteName } from '../router/AppRouter';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { AuthStore } from '../store/AuthStore';
import { ReaderStore } from '../store/ReaderStore';
import { getApiClient } from '../network/ApiClient';
import { participateInternalTest, ISuccessResponse, ParticipateInternalTestResponse } from '../network/PlusClient';

// ─── 主题选项(对齐 mobile theme modal 三项)────────────────────────────
interface ThemeOption {
  key: ThemeMode;
  label: string;
  icon: string; // 几何字符(sunny/moon/phone-portrait 无 sys.symbol 对应)
}

const THEME_OPTIONS: ThemeOption[] = [
  { key: 'light', label: '浅色', icon: '☀' },
  { key: 'dark', label: '深色', icon: '☾' },
  { key: 'system', label: '跟随系统', icon: '▣' }
];

// ─── 行数据(对齐 mobile renderRow 参数)─────────────────────────────
interface RowData {
  icon: AppIconKind;
  iconText: string;      // 无 AppIconKind 对应时的几何字符,空串表示用 icon
  label: string;
  value: string;
  showChevron: boolean;
  onTap?: () => void;
}

@Component
export struct SettingsScreen {
  @State private username: string = '-';
  @State private isVip: boolean = false;
  @State private vipTier: string = '';
  @State private themeMode: ThemeMode = 'system';
  @State private themeModalVisible: boolean = false;
  @State private redeemingInternalTest: boolean = false;
  @State private isLoading: boolean = false;
  @State private readerFontSize: number = 18;
  @State private readerLineHeight: number = 1.8;
  @State private ttsRate: number = 1.0;
  @State private appVersion: string = '1.0.0';

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  aboutToAppear(): void {
    this.refreshAll();
  }

  /** 每次进入页面都重取(主题切换后重建也会走这里) */
  private refreshAll(): void {
    this.applyTheme();
    const auth: AuthStore = AuthStore.shared();
    this.username = auth.user?.username ?? '-';
    this.isVip = auth.isVip;
    this.vipTier = auth.vipTier ?? '';
    this.themeMode = ThemeStore.shared().mode;
    const reader: ReaderStore = ReaderStore.shared();
    this.readerFontSize = reader.fontSize;
    this.readerLineHeight = reader.lineHeight;
    void this.loadTtsRate();
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

  // TTS 语速从 TTS_PREFS 读(TTSScreen 持久化的同一 key)
  private async loadTtsRate(): Promise<void> {
    try {
      const raw: string = await PreferencesStore.readString(PrefKey.TTS_PREFS, '');
      if (raw.length > 0) {
        const prefs: Record<string, Object> = JSON.parse(raw) as Record<string, Object>;
        const rate: Object | undefined = prefs['playbackRate'];
        if (typeof rate === 'number') {
          this.ttsRate = rate as number;
        }
      }
    } catch {
      // 静默失败,保持默认 1.0
    }
  }

  // ─── 主题切换(对齐 mobile handleThemeChange)────────────────────────
  private handleThemeChange(mode: ThemeMode): void {
    ThemeStore.shared().setMode(mode).then((): void => {
      this.themeMode = mode;
      this.applyTheme();
      this.themeModalVisible = false;
    });
  }

  private themeModeLabel(): string {
    if (this.themeMode === 'light') {
      return '浅色';
    }
    if (this.themeMode === 'dark') {
      return '深色';
    }
    return '跟随系统';
  }

  private vipTierLabel(): string {
    if (this.vipTier === 'LIFETIME') {
      return '永久卡';
    }
    if (this.vipTier === 'BASIC') {
      return '年卡';
    }
    return '免费版';
  }

  // ─── 会员类型入口(对齐 mobile handleMembershipPress)──────────────────
  // hm 无 iOS 购买限制判断,直接按 mobile Android 链路:
  // 无 plus token → MemberLogin;已 VIP → MemberDetail;否则 MemberBenefits
  private async handleMembershipPress(): Promise<void> {
    const plusToken: string = await PreferencesStore.readString(PrefKey.PLus_TOKEN, '');
    if (plusToken.length === 0) {
      pushRoute(RouteName.MEMBER_LOGIN);
      return;
    }
    if (this.isVip) {
      pushRoute(RouteName.MEMBER_DETAIL);
      return;
    }
    pushRoute(RouteName.MEMBER_BENEFITS);
  }

  // ─── 参与内测(对齐 mobile handleJoinInternalTest)─────────────────────
  private async handleJoinInternalTest(): Promise<void> {
    if (this.isVip) {
      promptAction.showDialog({
        title: '已是内测用户',
        message: '您已经参与内测,无需重复申请',
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
      return;
    }

    const plusUserId: string = await PreferencesStore.readString(PrefKey.PLus_USER_ID, '');
    if (plusUserId.length === 0) {
      promptAction.showDialog({
        title: '需要登录',
        message: '请先登录会员账号',
        buttons: [
          { text: '取消', color: this.themeTextSec },
          { text: '去登录', color: this.themePrimary }
        ]
      }).then((res: promptAction.ShowDialogSuccessResponse): void => {
        if (res.index === 1) {
          pushRoute(RouteName.MEMBER_LOGIN);
        }
      });
      return;
    }

    try {
      this.redeemingInternalTest = true;
      const vipStartsAt: Date = new Date();
      const vipEndsAt: Date = new Date(vipStartsAt.getTime());
      vipEndsAt.setMonth(vipEndsAt.getMonth() + 1);

      const res: ISuccessResponse<ParticipateInternalTestResponse> = await participateInternalTest({
        vipStartsAt: vipStartsAt.toISOString(),
        vipEndsAt: vipEndsAt.toISOString()
      });

      const payload: ParticipateInternalTestResponse | undefined = res.data;
      if (res.code !== 200 || !payload || !payload.ok) {
        throw new Error(res.message || '参与内测失败');
      }

      await PreferencesStore.writeString(PrefKey.VIP_TIER, payload.vipTier || 'BASIC');
      await PreferencesStore.writeString(PrefKey.VIP_EXPIRES, payload.vipEndsAt);

      // 更新全局状态(对齐 mobile useAuthStore.setState)
      const auth: AuthStore = AuthStore.shared();
      auth.isVip = true;
      auth.vipTier = payload.vipTier || 'BASIC';
      this.isVip = true;
      this.vipTier = payload.vipTier || 'BASIC';

      promptAction.showDialog({
        title: '成功',
        message: '恭喜!您已成功参与内测,获得1个月会员体验',
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
    } catch (err) {
      const msg: string = err instanceof Error ? err.message : '参与内测失败,请稍后重试';
      promptAction.showDialog({
        title: '失败',
        message: msg,
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
    } finally {
      this.redeemingInternalTest = false;
    }
  }

  // ─── 检查更新(hm 暂不支持应用内更新,对齐 mobile unsupported 分支)──────
  private handleCheckUpdatePress(): void {
    promptAction.showDialog({
      title: '暂不支持',
      message: '当前平台暂不支持检查更新',
      buttons: [{ text: '好的', color: this.themePrimary }]
    });
  }

  // ─── 删除账户(对齐 mobile handleDeleteAccount)────────────────────────
  private handleDeleteAccount(): void {
    promptAction.showDialog({
      title: '删除账户',
      message: '此操作不可逆,您的所有数据将被永久删除。',
      buttons: [
        { text: '取消', color: this.themeTextSec },
        { text: '删除', color: this.themeError }
      ]
    }).then((res: promptAction.ShowDialogSuccessResponse): void => {
      if (res.index === 1) {
        void this.doDeleteAccount();
      }
    });
  }

  private async doDeleteAccount(): Promise<void> {
    this.isLoading = true;
    try {
      const api = getApiClient();
      const uid: string = AuthStore.shared().user?.id ?? '';
      await api.deleteUser(uid);
      await AuthStore.shared().logout();
    } catch {
      promptAction.showDialog({
        title: '错误',
        message: '删除账户失败,请联系客服',
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
    } finally {
      this.isLoading = false;
    }
  }

  // ─── 退出登录(对齐 mobile useAuthStore.getState().logout)─────────────
  private handleLogout(): void {
    AuthStore.shared().logout().then((): void => {
      // auth 变化订阅会自动 replacePath(Login),这里无需手动跳
    });
  }

  // ─── 通用行(对齐 mobile renderRow)───────────────────────────────────
  @Builder
  SettingRow(data: RowData) {
    Row() {
      if (data.iconText.length > 0) {
        Text(data.iconText)
          .fontSize(18)
          .fontColor(this.themePrimary)
      } else {
        AppIcon({ kind: data.icon, iconSize: 20, iconColor: this.themePrimary })
      }

      Text(data.label)
        .fontSize(fontSizes.md)
        .fontColor(this.themeText)
        .layoutWeight(1)
        .margin({ left: spacing.md })

      Row({ space: spacing.xs }) {
        if (data.value.length > 0) {
          Text(data.value)
            .fontSize(fontSizes.md)
            .fontColor(this.themeTextSec)
        }
        if (data.showChevron) {
          AppIcon({ kind: AppIconKind.ChevronRight, iconSize: 18, iconColor: this.themeTextSec })
        }
      }
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .padding(spacing.md)
    .alignItems(VerticalAlign.Center)
    .onClick((): void => {
      if (data.onTap) {
        data.onTap();
      }
    })
  }

  @Builder
  RowDivider() {
    Divider()
      .color(this.themeBorder)
      .margin({ left: spacing.md + 28 })
  }

  build() {
    Stack() {
      Scroll() {
        Column() {
          // ─── 账户 ─────────────────────────────────────────────────
          this.SectionTitle('账户')
          Column() {
            this.SettingRow({
              icon: AppIconKind.Person,
              iconText: '',
              label: '用户名',
              value: this.username,
              showChevron: false
            })
            this.RowDivider()
            this.SettingRow({
              icon: AppIconKind.Diamond,
              iconText: '',
              label: '会员类型',
              value: this.vipTierLabel(),
              showChevron: true,
              onTap: (): void => {
                void this.handleMembershipPress();
              }
            })
          }
          .width('100%')
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)
          .clip(true)

          // ─── 偏好设置 ─────────────────────────────────────────────
          this.SectionTitle('偏好设置')
          Column() {
            this.SettingRow({
              icon: AppIconKind.Settings,
              iconText: '',
              label: '外观',
              value: this.themeModeLabel(),
              showChevron: true,
              onTap: (): void => {
                this.themeModalVisible = true;
              }
            })
            this.RowDivider()
            this.SettingRow({
              icon: AppIconKind.Book,
              iconText: '',
              label: '阅读设置',
              value: `字体 ${this.readerFontSize}px · 行距 ${this.readerLineHeight}x`,
              showChevron: true,
              onTap: (): void => {
                // mobile 端同样为空实现(() => {}),对齐保留
              }
            })
            this.RowDivider()
            this.SettingRow({
              icon: AppIconKind.Headset,
              iconText: '',
              label: '语音朗读设置',
              value: `语速 ${this.ttsRate}x`,
              showChevron: true,
              onTap: (): void => {
                // mobile 端同样为空实现,对齐保留
              }
            })
          }
          .width('100%')
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)
          .clip(true)

          // ─── 安全 ─────────────────────────────────────────────────
          this.SectionTitle('安全')
          Column() {
            this.SettingRow({
              icon: AppIconKind.Lock,
              iconText: '',
              label: '修改密码',
              value: '',
              showChevron: true,
              onTap: (): void => {
                // mobile 端同样为空实现,对齐保留
              }
            })
          }
          .width('100%')
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)
          .clip(true)

          // ─── 内测计划 ─────────────────────────────────────────────
          this.SectionTitle('内测计划')
          Column() {
            this.SettingRow({
              icon: AppIconKind.Book,
              iconText: '⚗',
              label: '参与内测',
              value: this.isVip ? '已参与' : (this.redeemingInternalTest ? '申请中...' : '点击参与'),
              showChevron: true,
              onTap: (): void => {
                void this.handleJoinInternalTest();
              }
            })
          }
          .width('100%')
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)
          .clip(true)

          // ─── 关于 ─────────────────────────────────────────────────
          this.SectionTitle('关于')
          Column() {
            this.SettingRow({
              icon: AppIconKind.FolderOpen,
              iconText: '',
              label: '存储空间',
              value: '0 GB',
              showChevron: false
            })
            this.RowDivider()
            this.SettingRow({
              icon: AppIconKind.Refresh,
              iconText: '',
              label: '检查更新',
              value: '',
              showChevron: true,
              onTap: (): void => {
                this.handleCheckUpdatePress();
              }
            })
            this.RowDivider()
            this.SettingRow({
              icon: AppIconKind.Book,
              iconText: '',
              label: '关于 BookDock',
              value: this.appVersion,
              showChevron: false
            })
          }
          .width('100%')
          .backgroundColor(this.themeSurface)
          .borderRadius(borderRadius.lg)
          .clip(true)

          // ─── 操作按钮(对齐 mobile actionButtonsContainer)───────────────
          Column({ space: spacing.md }) {
            Button('退出登录')
              .width('100%')
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Medium)
              .fontColor('#FFFFFF')
              .backgroundColor(this.themeError)
              .borderRadius(borderRadius.lg)
              .padding({ top: spacing.md, bottom: spacing.md })
              .onClick((): void => {
                this.handleLogout();
              })

            Button('注销会员账号')
              .width('100%')
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeError)
              .backgroundColor(this.themeError + '20')
              .border({ width: 1, color: this.themeError })
              .borderRadius(borderRadius.lg)
              .padding({ top: spacing.md, bottom: spacing.md })
              .onClick((): void => {
                this.handleDeleteAccount();
              })
          }
          .width('100%')
          .margin({ top: spacing.lg })
          .padding({ left: spacing.md, right: spacing.md })
        }
        .width('100%')
        .padding(spacing.md)
        .padding({ bottom: spacing.xl })
      }
      .width('100%')
      .height('100%')
      .scrollBar(BarState.Off)
      .align(Alignment.Top)

      // ─── 主题选择 Modal(对齐 mobile theme Modal)────────────────────────
      if (this.themeModalVisible) {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('#66000000')
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .onClick((): void => {
            this.themeModalVisible = false;
          })

        Column({ space: spacing.sm }) {
          Text('选择外观')
            .fontSize(fontSizes.lg)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.themeText)
            .textAlign(TextAlign.Center)
            .width('100%')
            .margin({ bottom: spacing.md })

          ForEach(THEME_OPTIONS, (item: ThemeOption) => {
            Row({ space: spacing.md }) {
              Text(item.icon)
                .fontSize(20)
                .fontColor(this.themeMode === item.key ? this.themePrimary : this.themeText)
              Text(item.label)
                .fontSize(fontSizes.md)
                .fontColor(this.themeMode === item.key ? this.themePrimary : this.themeText)
                .layoutWeight(1)
              if (this.themeMode === item.key) {
                Text('✓')
                  .fontSize(20)
                  .fontColor(this.themePrimary)
              }
            }
            .width('100%')
            .padding(spacing.md)
            .alignItems(VerticalAlign.Center)
            .backgroundColor(this.themeMode === item.key ? this.themePrimary + '20' : '#00000000')
            .borderRadius(borderRadius.md)
            .onClick((): void => {
              this.handleThemeChange(item.key);
            })
          }, (item: ThemeOption): string => item.key)
        }
        .width('80%')
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.lg)
        .padding(spacing.lg)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }

  @Builder
  SectionTitle(title: string) {
    Text(title)
      .fontSize(fontSizes.sm)
      .fontWeight(FontWeight.Medium)
      .fontColor(this.themeTextSec)
      .width('100%')
      .margin({ left: spacing.sm, bottom: spacing.sm, top: spacing.md })
      .textAlign(TextAlign.Start)
  }
}
