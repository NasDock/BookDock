// [API 23+] screens/LoginScreen.ets — 1:1 对齐 mobile src/screens/LoginScreen.tsx
// 功能:内/外网地址输入 + 用户名密码登录 + 注册切换 + 横屏扫码面板 + 错误态。
// mobile 的 vector-icons 在鸿蒙用字符串 emoji / SymbolGlyph 占位;
// mobile 的 react-native-qrcode-svg 在 P5 阶段接鸿蒙 QRCode 库生成真码。
import { mediaquery } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { ApiResponse, LoginResponse, User } from '../model/ApiModels';
import { getApiClient, initApiClient } from '../network/ApiClient';
import { AuthStore } from '../store/AuthStore';
import {
  createScanLoginSession,
  getScanLoginSession,
  subscribeScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  ScanLoginSession,
} from '../network/PlusClient';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import {
  saveServerConfig,
  selectBestServer,
  setActiveServerAddress,
  toApiBaseUrl,
} from '../utils/NetworkHelper';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
import { replaceRoute, RouteName } from '../router/AppRouter';
import { AppIcon, AppIconKind } from '../components/AppIcon';

const SOURCE_TYPE = 'BookDock';

interface CredRecord {
  username: string;
  password: string;
}

interface LoginEmptyResponse {
  success: boolean;
  error: string;
}

interface ServerConfigRecord {
  internal: string;
  external: string;
}

interface ErrorLike {
  message: string;
}

function emptyLoginResponse(): LoginEmptyResponse {
  return { success: false, error: '' };
}

function errToString(err: object | string): string {
  if (typeof err === 'string') {
    return err;
  }
  if (err && typeof err === 'object') {
    const e = err as ErrorLike;
    if (typeof e.message === 'string') {
      return e.message;
    }
  }
  return '';
}

@Component
export struct LoginScreen {
  @State private isLogin: boolean = true;
  @State private loading: boolean = false;
  @State private error: string | null = null;
  @State private internalAddress: string = '';
  @State private externalAddress: string = '';
  @State private username: string = '';
  @State private password: string = '';
  @State private confirmPassword: string = '';
  @State private showPassword: boolean = false;
  @State private scanSession: ScanLoginSession | null = null;
  @State private scanBusy: boolean = false;
  @State private scanProgress: string = '';
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';
  @State private isTabletOrPC: boolean = false;

  private authStore: AuthStore = AuthStore.shared();
  private orientationListener: mediaquery.MediaQueryListener | null = null;
  private unsubscribeScan: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    void this.loadSavedConfig();
    // 只在平板 / 2in1 上展示扫码登录面板;手机端整个隐藏
    const dt: string = deviceInfo.deviceType;
    this.isTabletOrPC = dt === 'tablet' || dt === '2in1';
    if (this.isTabletOrPC) {
      void this.createTargetSession();
    }
  }

  aboutToDisappear(): void {
    if (this.orientationListener) {
      this.orientationListener.off('change');
      this.orientationListener = null;
    }
    this.cleanupScan();
  }

  private cleanupScan(): void {
    if (this.unsubscribeScan) {
      this.unsubscribeScan();
      this.unsubscribeScan = null;
    }
  }

  private applyTheme(): void {
    const t: Theme = getTheme(false);
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themeBorder = t.colors.border;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
  }

  private async loadSavedConfig(): Promise<void> {
    const cfgRaw: string = await PreferencesStore.readString(PrefKey.SERVER_CONFIG, '');
    if (cfgRaw) {
      try {
        const cfg: ServerConfigRecord = JSON.parse(cfgRaw) as ServerConfigRecord;
        this.internalAddress = cfg.internal;
        this.externalAddress = cfg.external;
      } catch {
        // ignore
      }
    }
    const active: string = await PreferencesStore.readString(PrefKey.ACTIVE_API_BASE_URL, '');
    if (active) {
      void this.restoreCredentials(active);
    } else if (this.externalAddress) {
      void this.restoreCredentials(this.externalAddress);
    } else if (this.internalAddress) {
      void this.restoreCredentials(this.internalAddress);
    }
  }

  private async restoreCredentials(address: string): Promise<void> {
    if (!address) {
      return;
    }
    const key = `${PrefKey.CRED_PREFIX}${SOURCE_TYPE}_${address}`;
    const saved: string = await PreferencesStore.readString(key, '');
    if (saved) {
      try {
        const creds: CredRecord = JSON.parse(saved) as CredRecord;
        if (creds.username) {
          this.username = creds.username;
        }
        if (creds.password) {
          this.password = creds.password;
        }
      } catch {
        // ignore
      }
    }
  }

  private async createTargetSession(): Promise<void> {
    try {
      const res = await createScanLoginSession();
      if (res.data) {
        this.scanSession = res.data;
        this.subscribeSession();
      }
    } catch {
      // ignore
    }
  }

  private subscribeSession(): void {
    this.cleanupScan();
    if (!this.scanSession) {
      return;
    }
    const sid: string = this.scanSession.id;
    void getScanLoginSession(sid).catch((): void => undefined);
    const unsub: () => void = subscribeScanLoginSession(sid, (session: ScanLoginSession): void => {
      this.scanSession = session;
      if (session.status === 'CONFIRMED') {
        void this.consumeConfirmedScan();
      }
    });
    this.unsubscribeScan = unsub;
  }

  private async consumeConfirmedScan(): Promise<void> {
    if (!this.scanSession) {
      return;
    }
    const sid: string = this.scanSession.id;
    this.scanBusy = true;
    try {
      const res = await consumeScanLoginSession(sid);
      if (!res.data) {
        throw new Error('No data returned');
      }
      const token: string | undefined = res.data.token;
      const userId: string | undefined = res.data.userId;
      if (token && userId) {
        try {
          const api = getApiClient();
          const me: ApiResponse<User> = await api.getCurrentUser();
          if (me.success && me.data) {
            await this.authStore.login(me.data, token);
          } else {
            const fallback: User = { id: String(userId), username: String(userId), role: 'user', membership: 'free', createdAt: '' };
            await this.authStore.login(fallback, token);
          }
        } catch {
          const fallback: User = { id: String(userId), username: String(userId), role: 'user', membership: 'free', createdAt: '' };
          await this.authStore.login(fallback, token);
        }
      }
      await reportScanLoginResult(sid, { success: true });
      this.scanProgress = '登录成功';
      this.scanBusy = false;
      replaceRoute(RouteName.MAIN);
    } catch (err) {
      const msg: string = errToString(err) || '确认扫码登录失败';
      await reportScanLoginResult(sid, { success: false, error: msg }).catch((): void => undefined);
      this.error = msg;
      this.scanBusy = false;
    }
  }

  private async handleSubmit(): Promise<void> {
    if (!this.externalAddress && !this.internalAddress) {
      this.error = '请至少输入一个服务器地址(内网或外网)';
      return;
    }
    if (!this.username || !this.password) {
      this.error = '请填写用户名和密码';
      return;
    }
    if (!this.isLogin && this.password !== this.confirmPassword) {
      this.error = '两次输入的密码不一致';
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      const bestAddress = await selectBestServer(this.internalAddress, this.externalAddress);
      if (!bestAddress) {
        this.error = '无法连接到任一服务器地址,请检查网络或地址输入';
        this.loading = false;
        return;
      }
      const apiBaseUrl: string = toApiBaseUrl(bestAddress);
      await setActiveServerAddress(apiBaseUrl);
      initApiClient({
        baseURL: apiBaseUrl,
        getAuthToken: (): string | null => this.authStore.token,
        onAuthError: (): void => {
          void this.authStore.logout();
        },
      });
      await saveServerConfig({ internal: this.internalAddress, external: this.externalAddress });

      const api = getApiClient();
      if (this.isLogin) {
        const key = `${PrefKey.CRED_PREFIX}${SOURCE_TYPE}_${apiBaseUrl}`;
        const cred: CredRecord = { username: this.username, password: this.password };
        await PreferencesStore.writeString(key, JSON.stringify(cred));
        const response: ApiResponse<LoginResponse> =
          await api.login(this.username.trim(), this.password);
        if (response.success && response.data) {
          await this.authStore.login(response.data.user, response.data.token);
          this.loading = false;
          replaceRoute(RouteName.MAIN);
        } else {
          this.error = response.error || '登录失败';
          this.loading = false;
        }
      } else {
        const response: ApiResponse<LoginResponse> =
          await api.register(this.username.trim(), this.password, this.confirmPassword);
        if (response.success && response.data) {
          await this.authStore.login(response.data.user, response.data.token);
          this.loading = false;
          replaceRoute(RouteName.MAIN);
        } else {
          this.error = response.error || '注册失败';
          this.loading = false;
        }
      }
    } catch (err) {
      const msg: string = errToString(err);
      this.error = msg || (this.isLogin ? '登录失败' : '注册失败');
      this.loading = false;
    }
  }

  @Builder
  private ScanPanelLandscape() {
    if (this.scanSession && this.scanSession.status === 'CLAIMED') {
      Column() {
        Text('等待确认').fontSize(fontSizes.lg).fontWeight(FontWeight.Bold).fontColor(this.themeText)
        Text('手机已扫码。请在手机屏幕上确认登录...')
          .fontSize(fontSizes.sm)
          .fontColor(this.themeTextSec)
          .margin({ top: spacing.sm })
        if (this.scanBusy) {
          LoadingProgress().color(this.themePrimary).margin({ top: spacing.lg })
        }
      }
      .padding(spacing.lg)
      .backgroundColor(this.themeSurface)
      .border({ width: 1, color: this.themeBorder })
      .borderRadius(borderRadius.lg)
      .width(260)
    } else {
      Column() {
        Text('扫码登录').fontSize(fontSizes.sm).fontColor(this.themeTextSec).margin({ bottom: spacing.md })
        Column() {
          Text('QR').fontSize(64).fontWeight(FontWeight.Bold).fontColor(this.themePrimary)
          Text('二维码占位').fontSize(12).fontColor(this.themeTextSec).margin({ top: 4 })
        }
        .width(160).height(160)
        .justifyContent(FlexAlign.Center)
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.lg)
        Button('刷新二维码')
          .width('100%')
          .margin({ top: spacing.md })
          .onClick((): void => {
            void this.createTargetSession();
          })
      }
      .padding(0)
      .width(260)
    }
  }

  @Builder
  private FormPanel() {
    Column({ space: spacing.sm }) {
      Text('外网地址 (External)')
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .width('100%')
        .textAlign(TextAlign.Start)
      Row() {
        AppIcon({ kind: AppIconKind.Globe, iconSize: 16, iconColor: this.themeTextSec })
          .margin({ right: spacing.sm })
        TextInput({ placeholder: 'https://nas.example.com/api', text: this.externalAddress })
            .placeholderColor(this.themeTextSec)
            .fontColor(this.themeText)
            .backgroundColor(Color.Transparent)
            .layoutWeight(1)
            .height(40)
            .onChange((v: string): void => {
              this.externalAddress = v;
            })
      }
      .width('100%').height(48)
      .padding({ left: spacing.md, right: spacing.md })
      .border({ width: 1, color: this.themeBorder })
      .borderRadius(borderRadius.md)

      Text('内网地址 (Internal)')
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .margin({ top: spacing.sm })
        .width('100%')
        .textAlign(TextAlign.Start)
      Row() {
        AppIcon({ kind: AppIconKind.Wifi, iconSize: 16, iconColor: this.themeTextSec })
          .margin({ right: spacing.sm })
        TextInput({ placeholder: 'http://192.168.x.x:8088/api', text: this.internalAddress })
            .placeholderColor(this.themeTextSec)
            .fontColor(this.themeText)
            .backgroundColor(Color.Transparent)
            .layoutWeight(1)
            .height(40)
            .onChange((v: string): void => {
              this.internalAddress = v;
            })
      }
      .width('100%').height(48)
      .padding({ left: spacing.md, right: spacing.md })
      .border({ width: 1, color: this.themeBorder })
      .borderRadius(borderRadius.md)

      Text('用户名')
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .margin({ top: spacing.sm })
        .width('100%')
        .textAlign(TextAlign.Start)
      Row() {
        AppIcon({ kind: AppIconKind.Person, iconSize: 16, iconColor: this.themeTextSec })
          .margin({ right: spacing.sm })
        TextInput({ placeholder: '请输入用户名', text: this.username })
            .placeholderColor(this.themeTextSec)
            .fontColor(this.themeText)
            .backgroundColor(Color.Transparent)
            .layoutWeight(1)
            .height(40)
            .onChange((v: string): void => {
              this.username = v;
            })
      }
      .width('100%').height(48)
      .padding({ left: spacing.md, right: spacing.md })
      .border({ width: 1, color: this.themeBorder })
      .borderRadius(borderRadius.md)

      Text('密码')
        .fontSize(fontSizes.sm)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.themeText)
        .margin({ top: spacing.sm })
        .width('100%')
        .textAlign(TextAlign.Start)
      Row() {
        AppIcon({ kind: AppIconKind.Lock, iconSize: 16, iconColor: this.themeTextSec })
          .margin({ right: spacing.sm })
        TextInput({ placeholder: '请输入密码', text: this.password })
            .placeholderColor(this.themeTextSec)
            .fontColor(this.themeText)
            .type(this.showPassword ? InputType.Normal : InputType.Password)
            .backgroundColor(Color.Transparent)
            .layoutWeight(1)
            .height(40)
            .onChange((v: string): void => {
              this.password = v;
            })
        AppIcon({
          kind: this.showPassword ? AppIconKind.EyeOff : AppIconKind.Eye,
          iconSize: 16,
          iconColor: this.themeTextSec
        })
          .onClick((): void => {
            this.showPassword = !this.showPassword;
          })
      }
      .width('100%').height(48)
      .padding({ left: spacing.md, right: spacing.md })
      .border({ width: 1, color: this.themeBorder })
      .borderRadius(borderRadius.md)

      if (!this.isLogin) {
        Text('确认密码')
          .fontSize(fontSizes.sm)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.themeText)
          .margin({ top: spacing.sm })
          .width('100%')
          .textAlign(TextAlign.Start)
        Row() {
          AppIcon({ kind: AppIconKind.Lock, iconSize: 16, iconColor: this.themeTextSec })
            .margin({ right: spacing.sm })
          TextInput({ placeholder: '请再次输入密码', text: this.confirmPassword })
              .placeholderColor(this.themeTextSec)
              .fontColor(this.themeText)
              .type(this.showPassword ? InputType.Normal : InputType.Password)
              .backgroundColor(Color.Transparent)
              .layoutWeight(1)
              .height(40)
              .onChange((v: string): void => {
                this.confirmPassword = v;
              })
        }
        .width('100%').height(48)
        .padding({ left: spacing.md, right: spacing.md })
        .border({ width: 1, color: this.themeBorder })
        .borderRadius(borderRadius.md)
      }

      if (this.error) {
        Text(this.error)
          .fontSize(fontSizes.sm)
          .fontColor(this.themeError)
          .margin({ top: spacing.xs })
          .width('100%')
          .textAlign(TextAlign.Center)
      }

      Button(this.loading ? '处理中...' : (this.isLogin ? '登录' : '注册')) {
        if (this.loading) {
          LoadingProgress().color(Color.White)
        } else {
          Text(this.isLogin ? '登录' : '注册')
            .fontSize(fontSizes.md)
            .fontWeight(FontWeight.Bold)
            .fontColor(Color.White)
        }
      }
      .width('100%')
      .height(48)
      .backgroundColor(this.themePrimary)
      .borderRadius(borderRadius.md)
      .margin({ top: spacing.sm })
      .onClick((): void => {
        void this.handleSubmit();
      })

      Text(this.isLogin ? '没有账号?去注册' : '已有账号?去登录')
        .fontSize(fontSizes.sm)
        .fontColor(this.themePrimary)
        .fontWeight(FontWeight.Medium)
        .margin({ top: spacing.sm })
        .width('100%')
        .textAlign(TextAlign.Center)
        .onClick((): void => {
          this.isLogin = !this.isLogin;
          this.error = null;
        })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  build() {
    Scroll() {
      Column() {
        Column() {
          Image($r('app.media.app_logo'))
            .width(72)
            .height(72)
            .borderRadius(borderRadius.md)
          Text('BookDock').fontSize(fontSizes.xxl).fontWeight(FontWeight.Bold).fontColor(this.themeText)
            .margin({ top: spacing.md })
          Text(`${SOURCE_TYPE} ${this.isLogin ? '登录' : '注册'}`)
            .fontSize(fontSizes.sm)
            .fontColor(this.themeTextSec)
            .margin({ top: spacing.xs })
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
        .margin({ top: spacing.xl, bottom: spacing.lg })

        if (this.isTabletOrPC) {
          // 平板/2in1:左右布局,左边扫码面板 + 右边表单
          Row({ space: 40 }) {
            this.ScanPanelLandscape()
            this.FormPanel()
          }
          .width('100%')
          .constraintSize({ maxWidth: 600 })
          .justifyContent(FlexAlign.Center)
        } else {
          // 手机:只显示表单,不渲染扫码面板
          this.FormPanel()
        }
      }
      .width('100%')
      .padding({ left: spacing.lg, right: spacing.lg, top: spacing.md, bottom: spacing.xxl })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }

  // 保留空方法以避免 unused import warning
  private ignoreLoginEmpty(): void {
    const e: LoginEmptyResponse = emptyLoginResponse();
    void e;
  }
}