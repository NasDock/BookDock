// [API 23+] screens/LoginScreen.ets — 1:1 对齐 mobile src/screens/LoginScreen.tsx
// 功能:内/外网地址输入 + 用户名密码登录 + 注册切换 + 横屏扫码面板 + 错误态。
// mobile 的 vector-icons 在鸿蒙用字符串 emoji / SymbolGlyph 占位;
// 扫码二维码已用 ArkUI 内置 QRCode 组件生成真码,与 desktop / mobile 共用同一 payload。
import { mediaquery, promptAction } from '@kit.ArkUI';
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
  ScanLoginCreateDto,
  ScanLoginSecretDto,
  ReportScanLoginResultDto,
} from '../network/PlusClient';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import {
  saveServerConfig,
  selectBestServer,
  setActiveServerAddress,
  toApiBaseUrl,
} from '../utils/NetworkHelper';
import { getTheme, Theme, spacing, fontSizes, borderRadius } from '../theme/Theme';
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

// 三端统一的扫码登录二维码内容
interface ScanQrValue {
  kind: string;
  version: number;
  sessionId: string;
  secret: string;
  role: string;
  deviceKind: string;
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
  // 对齐 mobile 的 useWindowDimensions():只有宽 > 高(横屏)才走左右分栏
  @State private isLandscape: boolean = false;
  @State private showWideLayout: boolean = false;

  // 举报弹窗状态
  @State private showReport: boolean = false;
  @State private reportTitle: string = '';
  @State private reportReason: string = '';
  @State private reportSubmitting: boolean = false;
  @State private reportSuccess: boolean = false;

  private authStore: AuthStore = AuthStore.shared();
  private orientationListener: mediaquery.MediaQueryListener | null = null;
  private unsubscribeScan: (() => void) | null = null;
  private reportTimerId: number = -1;

  aboutToAppear(): void {
    this.applyTheme();
    void this.loadSavedConfig();
    // 只在平板 / 2in1 且横屏时展示扫码登录面板;手机、平板竖屏整块隐藏
    const dt: string = deviceInfo.deviceType;
    this.isTabletOrPC = dt === 'tablet' || dt === '2in1';
    const listener: mediaquery.MediaQueryListener =
      this.getUIContext().getMediaQuery().matchMediaSync('(orientation: landscape)');
    this.isLandscape = listener.matches;
    this.orientationListener = listener;
    listener.on('change', (result: mediaquery.MediaQueryResult): void => {
      this.isLandscape = result.matches;
      this.syncLayoutMode();
    });
    this.syncLayoutMode();
  }

  aboutToDisappear(): void {
    if (this.orientationListener) {
      this.orientationListener.off('change');
      this.orientationListener = null;
    }
    this.cleanupScan();
    this.clearReportTimer();
  }

  private clearReportTimer(): void {
    if (this.reportTimerId >= 0) {
      clearTimeout(this.reportTimerId);
      this.reportTimerId = -1;
    }
  }

  private cleanupScan(): void {
    if (this.unsubscribeScan) {
      this.unsubscribeScan();
      this.unsubscribeScan = null;
    }
  }

  // 布局与扫码会话的唯一入口:平板/2in1 + 横屏才左右分栏,其余一律单列表单
  private syncLayoutMode(): void {
    const wide: boolean = this.isTabletOrPC && this.isLandscape;
    this.showWideLayout = wide;
    if (wide) {
      // 进入横屏才创建会话 / 恢复订阅,竖屏不产生任何扫码请求
      if (!this.scanSession) {
        void this.createTargetSession();
      } else {
        this.subscribeSession();
      }
    } else {
      // 竖屏 / 手机:停订阅并丢弃旧会话,避免转回横屏后展示已过期的二维码
      this.cleanupScan();
      this.scanSession = null;
      this.scanBusy = false;
      this.scanProgress = '';
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
      // 平板/2in1 作为 target,与 desktop 共用同一套线上会话接口
      const dto: ScanLoginCreateDto = { role: 'target', deviceKind: 'desktop' };
      const res = await createScanLoginSession(dto);
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
    const sid: string = this.scanSession.sessionId;
    const secret: string = this.scanSession.secret;
    void getScanLoginSession(sid, secret).catch((): void => undefined);
    const unsub: () => void = subscribeScanLoginSession(sid, secret, (session: ScanLoginSession): void => {
      this.scanSession = session;
      if (session.status === 'confirmed') {
        void this.consumeConfirmedScan();
      }
    });
    this.unsubscribeScan = unsub;
  }

  private async consumeConfirmedScan(): Promise<void> {
    if (!this.scanSession) {
      return;
    }
    const sid: string = this.scanSession.sessionId;
    const secret: string = this.scanSession.secret;
    this.scanBusy = true;
    try {
      const body: ScanLoginSecretDto = { secret: secret };
      const res = await consumeScanLoginSession(sid, body);
      if (!res.data) {
        throw new Error('No data returned');
      }
      // 新协议 consume 返回扫码端带来的认证包,Plus 身份在 plusAuth 里
      const auth = res.data.plusAuth;
      const token: string | undefined = auth?.token;
      const userId: string | number | undefined = auth?.userId;
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
      const okDto: ReportScanLoginResultDto = { secret: secret, success: true };
      await reportScanLoginResult(sid, okDto);
      this.scanProgress = '登录成功';
      this.scanBusy = false;
      // 登录态变化由 AppRoot 的 authStore.subscribe 监听并切到主 Tab,
      // 此处不再操作 NavPathStack(登录阶段无 Navigation 挂载,调用无效且污染栈)
    } catch (err) {
      const msg: string = errToString(err) || '确认扫码登录失败';
      const failDto: ReportScanLoginResultDto = { secret: secret, success: false, error: msg };
      await reportScanLoginResult(sid, failDto).catch((): void => undefined);
      this.error = msg;
      this.scanBusy = false;
    }
  }

  // 三端统一的二维码内容:扫码端按 kind / sessionId / secret / role 解析
  private buildScanQrValue(): string {
    if (!this.scanSession) {
      return '';
    }
    const payload: ScanQrValue = {
      kind: 'bookdock-scan-login',
      version: 1,
      sessionId: this.scanSession.sessionId,
      secret: this.scanSession.secret,
      role: 'target',
      deviceKind: 'harmony',
    };
    return JSON.stringify(payload);
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
          // 登录态变化由 AppRoot 的 authStore.subscribe 监听并切到主 Tab
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
          // 登录态变化由 AppRoot 的 authStore.subscribe 监听并切到主 Tab
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

  // ─── 举报弹窗 ─────────────────────────────────────────────────────
  private openReport(): void {
    this.reportTitle = '';
    this.reportReason = '';
    this.reportSuccess = false;
    this.showReport = true;
  }

  private closeReport(): void {
    if (this.reportSubmitting) {
      return;
    }
    this.showReport = false;
  }

  private handleReportSubmit(): void {
    if (this.reportTitle.trim().length === 0 || this.reportReason.trim().length === 0) {
      promptAction.showToast({ message: '请填写标题和原因', duration: 1500 });
      return;
    }
    this.reportSuccess = false;
    this.reportSubmitting = true;
    this.clearReportTimer();
    this.reportTimerId = setTimeout((): void => {
      this.reportSubmitting = false;
      this.reportSuccess = true;
      this.reportTimerId = setTimeout((): void => {
        this.showReport = false;
        this.reportTimerId = -1;
        promptAction.showToast({ message: '提交成功', duration: 1500 });
      }, 1500);
    }, 2000);
  }

  @Builder
  private ScanPanelLandscape() {
    if (this.scanSession && this.scanSession.status === 'waiting_confirm') {
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
        // 真二维码:ArkUI 内置 QRCode 组件,固定白底深码保证暗色主题下也能识别
        if (this.buildScanQrValue().length > 0) {
          QRCode(this.buildScanQrValue())
            .width(180)
            .height(180)
            .color('#111827')
            .backgroundColor('#FFFFFF')
        } else {
          Column()
            .width(180).height(180)
            .backgroundColor('#FFFFFF')
            .borderRadius(borderRadius.lg)
        }
        // 轻量文字按钮:对齐 desktop 的「刷新图标 + 蓝色小字」。
        // 原实现是整宽实心主按钮,与右侧「登录」形成两块高饱和色块,视觉上抢焦点。
        Row({ space: spacing.xs }) {
          AppIcon({ kind: AppIconKind.Refresh, iconSize: 14, iconColor: this.themePrimary })
          Text('刷新二维码')
            .fontSize(fontSizes.sm)
            .fontColor(this.themePrimary)
        }
        .height(36)
        .padding({ left: spacing.md, right: spacing.md })
        .margin({ top: spacing.sm })
        .enabled(!this.scanBusy)
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
    Stack() {
      Scroll() {
        Column() {
          // 右上角举报按钮
          Row() {
            Blank()
            Column() {
              AppIcon({ kind: AppIconKind.Help, iconSize: 24, iconColor: this.themeTextSec })
            }
            .width(40)
            .height(40)
            .justifyContent(FlexAlign.Center)
            .onClick((): void => {
              this.openReport();
            })
          }
          .width('100%')
          .padding({ top: spacing.sm })

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
        // 平板横屏高度有限,收紧品牌区上下留白,保证表单 + 去注册链接一屏内可见
        .margin({
          top: this.showWideLayout ? spacing.xs : spacing.xl,
          bottom: this.showWideLayout ? spacing.xs : spacing.lg
        })

        if (this.showWideLayout) {
          // 平板/2in1 横屏:左侧固定 260 扫码面板 + 右侧按剩余宽度收缩的表单。
          // 对齐 mobile 的 contentLandscape(row + gap 40) / formCard(flex:1, minWidth:0):
          // 表单必须用 layoutWeight 吃剩余空间,不能用 width('100%')——否则会按 Row 整宽测量,
          // 260 + 40 + Row整宽 会一起溢出屏幕右边界。
          Row({ space: 40 }) {
            this.ScanPanelLandscape()
            Column() {
              this.FormPanel()
            }
            .layoutWeight(1)
            .constraintSize({ maxWidth: 360 })
            .alignItems(HorizontalAlign.Start)
          }
          .width('100%')
          .constraintSize({ maxWidth: 680 })
          .alignItems(VerticalAlign.Center)
          .justifyContent(FlexAlign.Center)
        } else {
          // 手机 / 平板竖屏:单列表单,限制最大宽度并居中,避免平板上输入框被拉到屏幕边缘
          // [备选·对齐 mobile 竖屏上下堆叠] 如需竖屏仍在表单上方显示二维码,改为:
          // Column({ space: spacing.lg }) { this.ScanPanelLandscape(); this.FormPanel() }
          Column() {
            this.FormPanel()
          }
          .width('100%')
          .constraintSize({ maxWidth: 420 })
        }
      }
      .width('100%')
      .alignItems(HorizontalAlign.Center)
      .padding({
        left: spacing.lg,
        right: spacing.lg,
        top: this.showWideLayout ? spacing.xs : spacing.md,
        bottom: this.showWideLayout ? spacing.xs : spacing.xxl
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)

    // 举报弹窗(叠加在登录页之上)
    if (this.showReport) {
      Column() {
        Column() {
          Row() {
            Text('举报数据源')
              .fontSize(fontSizes.lg)
              .fontWeight(FontWeight.Bold)
              .fontColor(this.themeText)
            Blank()
            Column() {
              AppIcon({ kind: AppIconKind.Close, iconSize: 20, iconColor: this.themeTextSec })
            }
            .width(28)
            .height(28)
            .justifyContent(FlexAlign.Center)
            .onClick((): void => {
              this.closeReport();
            })
          }
          .width('100%')
          .margin({ bottom: spacing.md })

          if (this.reportSuccess) {
            Column() {
              Text('✓')
                .fontSize(48)
                .fontColor('#22c55e')
              Text('提交成功')
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.themeText)
                .margin({ top: spacing.md })
              Text('感谢您的反馈，我们会尽快处理')
                .fontSize(fontSizes.sm)
                .fontColor(this.themeTextSec)
                .margin({ top: spacing.xs })
            }
            .width('100%')
            .padding({ top: spacing.xl, bottom: spacing.xl })
          } else {
            Column({ space: spacing.md }) {
              Column() {
                Text('标题 *')
                  .fontSize(fontSizes.sm)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themeText)
                  .width('100%')
                  .textAlign(TextAlign.Start)
                TextInput({ placeholder: '请输入举报标题', text: this.reportTitle })
                  .fontSize(fontSizes.md)
                  .fontColor(this.themeText)
                  .placeholderColor(this.themeTextSec)
                  .backgroundColor(this.themeBg)
                  .border({ width: 1, color: this.themeBorder })
                  .borderRadius(borderRadius.md)
                  .width('100%')
                  .height(44)
                  .padding({ left: spacing.md, right: spacing.md })
                  .onChange((v: string): void => {
                    this.reportTitle = v;
                  })
              }
              .width('100%')

              Column() {
                Text('原因 *')
                  .fontSize(fontSizes.sm)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(this.themeText)
                  .width('100%')
                  .textAlign(TextAlign.Start)
                TextArea({ placeholder: '请详细描述举报原因', text: this.reportReason })
                  .fontSize(fontSizes.md)
                  .fontColor(this.themeText)
                  .placeholderColor(this.themeTextSec)
                  .backgroundColor(this.themeBg)
                  .border({ width: 1, color: this.themeBorder })
                  .borderRadius(borderRadius.md)
                  .width('100%')
                  .height(100)
                  .padding({ left: spacing.md, right: spacing.md })
                  .onChange((v: string): void => {
                    this.reportReason = v;
                  })
              }
              .width('100%')

              Button(this.reportSubmitting ? '提交中...' : '提交举报')
                .width('100%')
                .height(44)
                .fontSize(fontSizes.md)
                .fontWeight(FontWeight.Medium)
                .fontColor('#FFFFFF')
                .backgroundColor(this.themePrimary)
                .borderRadius(borderRadius.md)
                .enabled(!this.reportSubmitting)
                .onClick((): void => {
                  this.handleReportSubmit();
                })
            }
            .width('100%')
          }
        }
        .width('90%')
        .constraintSize({ maxWidth: 420 })
        .padding(spacing.lg)
        .backgroundColor(this.themeSurface)
        .borderRadius(borderRadius.lg)
        .onClick((): void => {
          // 消费点击事件,避免冒泡到遮罩层导致误关闭
        })
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#99000000')
      .justifyContent(FlexAlign.Center)
      .onClick((): void => {
        this.closeReport();
      })
    }
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