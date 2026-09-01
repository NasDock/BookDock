// [API 23+] screens/MemberLoginScreen.ets — 1:1 对齐 mobile MemberLoginScreen.tsx
// 会员登录页:手机号 + 验证码登录 / 60s 倒计时 / 登录后 refreshVipStatus 同步 VIP 状态
// mobile → hm 关键差异:
//   1. KeyboardAvoidingView → ArkUI 默认键盘避让,无需处理
//   2. assets/logo.webp → AppIcon Book + 标题文字(对齐 mobile2 降级方案)
//   3. AsyncStorage → PreferencesStore(PLus_TOKEN / PLus_USER_ID / PLus_USER)
//   4. RN Alert.alert('登录成功') → promptAction.showToast
//   5. TextInput keyboardType → ArkUI InputType.PhoneNumber / InputType.Number
import { promptAction } from '@kit.ArkUI';
import { getTheme, Theme, spacing, fontSizes, borderRadius, ThemeStore } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute } from '../router/AppRouter';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { AuthStore } from '../store/AuthStore';
import { plusLogin, plusSendCode, setPlusToken, ISuccessResponse, PlusLoginResponse } from '../network/PlusClient';

@Component
export struct MemberLoginScreen {
  @State private phone: string = '';
  @State private code: string = '';
  @State private countdown: number = 0;
  @State private isLoading: boolean = false;
  @State private isSending: boolean = false;
  @State private errorMsg: string = '';

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  private countdownTimer: number = -1;

  aboutToAppear(): void {
    this.applyTheme();
  }

  aboutToDisappear(): void {
    this.clearCountdown();
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

  private clearCountdown(): void {
    if (this.countdownTimer >= 0) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = -1;
    }
  }

  // ─── 启动 60s 倒计时(对齐 mobile countdown useEffect)──────────────────
  private startCountdown(): void {
    this.clearCountdown();
    this.countdown = 60;
    this.countdownTimer = setInterval((): void => {
      if (this.countdown > 0) {
        this.countdown = this.countdown - 1;
      } else {
        this.clearCountdown();
      }
    }, 1000);
  }

  // ─── 发送验证码(对齐 mobile handleSendCode)─────────────────────────────
  private async handleSendCode(): Promise<void> {
    if (this.phone.length === 0) {
      this.errorMsg = '请输入手机号';
      return;
    }
    this.isSending = true;
    this.errorMsg = '';
    try {
      const res: ISuccessResponse<object> = await plusSendCode({ phone: this.phone });
      if (res.code === 200 || res.code === 201) {
        this.startCountdown();
      } else {
        this.errorMsg = res.message || '获取验证码失败';
      }
    } catch (err) {
      this.errorMsg = err instanceof Error ? err.message : '网络请求失败';
    } finally {
      this.isSending = false;
    }
  }

  // ─── 登录(对齐 mobile handleLogin)─────────────────────────────────────
  private async handleLogin(): Promise<void> {
    if (this.phone.length === 0 || this.code.length === 0) {
      this.errorMsg = '请输入手机号和验证码';
      return;
    }
    this.isLoading = true;
    this.errorMsg = '';
    try {
      const res: ISuccessResponse<PlusLoginResponse> = await plusLogin({
        phone: this.phone,
        code: this.code
      });
      if ((res.code === 200 || res.code === 201) && res.data) {
        const plusToken: string = res.data.token;
        const userId: string = res.data.userId;
        await PreferencesStore.writeString(PrefKey.PLus_TOKEN, plusToken);
        await PreferencesStore.writeString(PrefKey.PLus_USER_ID, JSON.stringify(userId));
        await PreferencesStore.writeString(PrefKey.PLus_USER, JSON.stringify({ id: userId }));
        setPlusToken(plusToken);
        // 立即同步 VIP 状态(对齐 mobile refreshVipStatus)
        await AuthStore.shared().refreshVipStatus();
        promptAction.showToast({ message: '会员登录成功', duration: 1500 });
        popRoute();
      } else {
        this.errorMsg = res.message || '登录失败';
      }
    } catch (err) {
      this.errorMsg = err instanceof Error ? err.message : '登录失败，请重试';
    } finally {
      this.isLoading = false;
    }
  }

  build() {
    Scroll() {
      Column() {
        // ─── Header(对齐 mobile header)───────────────────────────────
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
        }
        .width('100%')
        .padding({ top: spacing.xl, bottom: spacing.sm })
        .alignItems(VerticalAlign.Center)

        // ─── Logo(对齐 mobile logoSection,mobile2 降级为图标+文字)─────────
        Column({ space: spacing.xs }) {
          Column() {
            AppIcon({ kind: AppIconKind.Book, iconSize: 40, iconColor: '#FFFFFF' })
          }
          .width(72)
          .height(72)
          .borderRadius(12)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
          .backgroundColor(this.themePrimary)
          .margin({ bottom: spacing.sm })

          Text('BookDock')
            .fontSize(24)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.themeText)
          Text('书仓会员登录')
            .fontSize(fontSizes.md)
            .fontColor(this.themeTextSec)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
        .margin({ top: spacing.xl, bottom: spacing.xl })

        // ─── 表单(对齐 mobile formCard)─────────────────────────────────
        Column({ space: spacing.md }) {
          // 手机号
          Column({ space: spacing.xs }) {
            Text('手机号')
              .fontSize(fontSizes.sm)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeText)
              .width('100%')
              .textAlign(TextAlign.Start)

            Row({ space: spacing.sm }) {
              TextInput({ placeholder: '请输入手机号', text: this.phone })
                .layoutWeight(1)
                .height(48)
                .fontSize(fontSizes.md)
                .fontColor(this.themeText)
                .placeholderColor(this.themeTextSec)
                .backgroundColor(this.themeSurface)
                .border({ width: 1, color: this.themeBorder })
                .borderRadius(borderRadius.md)
                .padding({ left: spacing.md, right: spacing.md })
                .type(InputType.PhoneNumber)
                .maxLength(11)
                .onChange((value: string): void => {
                  this.phone = value;
                })

              // 验证码按钮(对齐 mobile codeBtn 100x48)
              Button(this.isSending ? '' : (this.countdown > 0 ? `${this.countdown}s` : '验证码'))
                .width(100)
                .height(48)
                .fontSize(fontSizes.sm)
                .fontWeight(FontWeight.Medium)
                .fontColor('#FFFFFF')
                .backgroundColor(this.countdown > 0 || this.isSending ? this.themeBorder : this.themePrimary)
                .borderRadius(borderRadius.md)
                .enabled(!(this.countdown > 0 || this.isSending))
                .onClick((): void => {
                  void this.handleSendCode();
                })
            }
            .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          // 验证码
          Column({ space: spacing.xs }) {
            Text('验证码')
              .fontSize(fontSizes.sm)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeText)
              .width('100%')
              .textAlign(TextAlign.Start)

            TextInput({ placeholder: '6位验证码', text: this.code })
              .width('100%')
              .height(48)
              .fontSize(20)
              .fontColor(this.themeText)
              .placeholderColor(this.themeTextSec)
              .backgroundColor(this.themeSurface)
              .border({ width: 1, color: this.themeBorder })
              .borderRadius(borderRadius.md)
              .textAlign(TextAlign.Center)
              .type(InputType.Number)
              .maxLength(6)
              .onChange((value: string): void => {
                // 对齐 mobile:t.replace(/\D/g, '').slice(0, 6)
                this.code = value.replace(/\D/g, '').slice(0, 6);
              })
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          // 错误提示(对齐 mobile errorBox)
          if (this.errorMsg.length > 0) {
            Row() {
              Text(this.errorMsg)
                .fontSize(fontSizes.sm)
                .fontColor(this.themeError)
            }
            .width('100%')
            .padding(spacing.md)
            .backgroundColor(this.themeError + '15')
            .border({ width: 1, color: this.themeError + '40' })
            .borderRadius(borderRadius.md)
          }

          // 登录按钮(对齐 mobile loginBtn)
          Button(this.isLoading ? '' : '登录 / 注册')
            .width('100%')
            .height(48)
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Medium)
            .fontColor('#FFFFFF')
            .backgroundColor(this.themePrimary)
            .borderRadius(borderRadius.md)
            .margin({ top: spacing.sm })
            .enabled(!this.isLoading)
            .onClick((): void => {
              void this.handleLogin();
            })
        }
        .width('100%')

        // ─── Footer(对齐 mobile footer)─────────────────────────────────
        Column() {
          Text() {
            Span('登录即代表同意')
              .fontColor(this.themeTextSec)
            Span('《隐私政策》')
              .fontColor(this.themePrimary)
            Span('和')
              .fontColor(this.themeTextSec)
            Span('《用户协议》')
              .fontColor(this.themePrimary)
          }
          .fontSize(fontSizes.xs)
          .textAlign(TextAlign.Center)
          .lineHeight(20)
        }
        .width('100%')
        .margin({ top: spacing.xl })
        .alignItems(HorizontalAlign.Center)
      }
      .width('100%')
      .padding({ left: spacing.lg, right: spacing.lg, bottom: spacing.xl })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
    .scrollBar(BarState.Off)
    .align(Alignment.Top)
  }
}
