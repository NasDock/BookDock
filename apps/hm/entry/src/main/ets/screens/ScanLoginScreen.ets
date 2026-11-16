// [API 23+] screens/ScanLoginScreen.ets — 1:1 对齐 mobile ScanLoginScreen.tsx
// 扫码登录页:相机权限申请 / 扫描二维码认领会话 / 作为 target 轮询会话等桌面确认
// mobile → hm 关键差异:
//   1. react-native-vision-camera(Camera + useCodeScanner) → 暂不集成扫码 SDK,
//      相机预览区用占位视图;会话认领(handleBarCodeScanned)逻辑保留接口说明
//   2. expo-camera useCameraPermissions → abilityAccessCtrl.requestPermissionsFromUser
//   3. mobile utils/scanLogin.ts → 本文件内 collectScanLoginPayload/applyScanLoginResult
//   4. RN Alert → promptAction.showDialog / showToast
// 说明:扫码识别本身需要集成 HM 扫码能力(Scan Kit 或 AVSession 自定义解析),
// 当前版本对齐 mobile 的会话生命周期(create/subscribe/consume/report),
// 相机预览与码识别留占位,后续接 Scan Kit。
import { promptAction } from '@kit.ArkUI';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { getTheme, Theme, spacing, fontSizes, ThemeStore } from '../theme/Theme';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { popRoute } from '../router/AppRouter';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import {
  createScanLoginSession,
  getScanLoginSession,
  claimScanLoginSession,
  subscribeScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  ISuccessResponse,
  ScanLoginSession,
  ScanLoginClaimPayload,
  PlusAuthRef
} from '../network/PlusClient';
import { AuthStore } from '../store/AuthStore';

// ─── 扫码二维码内容(对齐 mobile parsed QR JSON)──────────────────────
interface ScanQrPayload {
  kind: string;
  sessionId: string;
  role: string;
}

// 对齐 mobile collectMobileScanLoginPayload
async function collectScanLoginPayload(): Promise<ScanLoginClaimPayload> {
  const plusToken: string = await PreferencesStore.readString(PrefKey.PLus_TOKEN, '');
  const plusUserIdRaw: string = await PreferencesStore.readString(PrefKey.PLus_USER_ID, '');

  const payload: ScanLoginClaimPayload = {
    deviceName: 'Mobile Device',
    deviceType: 'mobile',
    sourceBundles: []
  };

  if (plusToken.length > 0 && plusUserIdRaw.length > 0) {
    try {
      const uid: string = JSON.parse(plusUserIdRaw) as string;
      const authRef: PlusAuthRef = { token: plusToken, userId: uid };
      payload.plusAuth = authRef;
    } catch {
      // 解析失败则不带 plusAuth
    }
  }
  return payload;
}

// 对齐 mobile applyMobileScanLoginResult
async function applyScanLoginResult(result: ScanLoginSession): Promise<void> {
  if (result.token && result.userId) {
    await PreferencesStore.writeString(PrefKey.PLus_TOKEN, result.token);
    await PreferencesStore.writeString(PrefKey.PLus_USER_ID, JSON.stringify(result.userId));
    await PreferencesStore.writeString(PrefKey.PLus_USER, JSON.stringify({ id: result.userId }));
  }
}

@Component
export struct ScanLoginScreen {
  @State private hasCameraPermission: boolean = false;
  @State private permissionChecked: boolean = false;
  @State private scanBusy: boolean = false;
  @State private scanSession: ScanLoginSession | null = null;
  @State private statusText: string = '';

  // ─── 主题(@State 镜像)──────────────────────────────────────────
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themePrimary: string = '#4A90D9';
  @State private themeError: string = '#EF4444';

  private unsubscribeSession: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    void this.requestCameraPermission();
    void this.createTargetSession();
  }

  aboutToDisappear(): void {
    if (this.unsubscribeSession) {
      this.unsubscribeSession();
      this.unsubscribeSession = null;
    }
  }

  private applyTheme(): void {
    const t: Theme = ThemeStore.shared().getCurrentTheme();
    this.themeBg = t.colors.background;
    this.themeSurface = t.colors.surface;
    this.themeText = t.colors.text;
    this.themeTextSec = t.colors.textSecondary;
    this.themePrimary = t.colors.primary;
    this.themeError = t.colors.error;
  }

  // ─── 相机权限(对齐 mobile useCameraPermission + requestPermission)────────
  private async requestCameraPermission(): Promise<void> {
    try {
      const atManager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
      const context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
      const permissions: Permissions[] = ['ohos.permission.CAMERA'];
      const result = await atManager.requestPermissionsFromUser(context, permissions);
      const granted: boolean = result.authResults.length > 0 && result.authResults[0] === 0;
      this.hasCameraPermission = granted;
      this.permissionChecked = true;
      if (!granted) {
        promptAction.showDialog({
          title: '需要相机权限',
          message: '请在设置中开启相机权限以使用扫码登录',
          buttons: [{ text: '确定', color: this.themePrimary }]
        }).then((): void => {
          popRoute();
        });
      }
    } catch {
      this.hasCameraPermission = false;
      this.permissionChecked = true;
    }
  }

  // ─── 创建会话(对齐 mobile createTargetSession)──────────────────────────
  private async createTargetSession(): Promise<void> {
    try {
      const res: ISuccessResponse<ScanLoginSession> = await createScanLoginSession();
      if (res.data) {
        this.scanSession = res.data;
        this.subscribeSession(res.data.id);
      }
    } catch {
      // 静默失败(对齐 mobile console.error)
    }
  }

  // ─── 订阅会话状态(对齐 mobile subscribeScanLoginSession useEffect)────────
  private subscribeSession(sessionId: string): void {
    if (this.unsubscribeSession) {
      this.unsubscribeSession();
    }
    getScanLoginSession(sessionId).catch((): void => {});
    this.unsubscribeSession = subscribeScanLoginSession(sessionId, (session: ScanLoginSession): void => {
      this.scanSession = session;
      if (session.status === 'CONFIRMED') {
        void this.consumeConfirmedScan(session);
      }
    });
  }

  // ─── 消费会话(对齐 mobile consumeConfirmedScan)──────────────────────────
  private consuming: boolean = false;

  private async consumeConfirmedScan(session: ScanLoginSession): Promise<void> {
    if (this.consuming) {
      return;
    }
    this.consuming = true;
    this.scanBusy = true;
    try {
      const res: ISuccessResponse<ScanLoginSession> = await consumeScanLoginSession(session.id);
      if (!res.data) {
        throw new Error('No data returned');
      }
      try {
        await applyScanLoginResult(res.data);
      } catch (applyErr) {
        const msg: string = applyErr instanceof Error ? applyErr.message : '未知错误';
        await reportScanLoginResult(session.id, { success: false, error: msg }).catch((): void => {});
        throw new Error(msg);
      }
      await reportScanLoginResult(session.id, { success: true }).catch((): void => {});
      // 同步 VIP 状态
      await AuthStore.shared().refreshVipStatus();
      promptAction.showToast({ message: '扫码登录成功', duration: 1500 });
      popRoute();
    } catch (err) {
      const msg: string = err instanceof Error ? err.message : '未知错误';
      promptAction.showDialog({
        title: '扫码登录失败',
        message: msg,
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
      await this.createTargetSession();
    } finally {
      this.scanBusy = false;
      this.consuming = false;
    }
  }

  // ─── 二维码识别回调(对齐 mobile handleBarCodeScanned)─────────────────────
  // 注意:当前未集成扫码 SDK,此方法预留,待接 Scan Kit 后由识别结果调用
  private async handleQrScanned(data: string): Promise<void> {
    if (this.scanBusy) {
      return;
    }
    try {
      const parsed: ScanQrPayload = JSON.parse(data) as ScanQrPayload;
      if (parsed.kind !== 'bookdock-scan-login' && parsed.kind !== 'soundx-scan-login') {
        promptAction.showDialog({
          title: '无效的二维码',
          buttons: [{ text: '好的', color: this.themePrimary }]
        });
        return;
      }
      if (parsed.role === 'target') {
        const payload: ScanLoginClaimPayload = await collectScanLoginPayload();
        this.scanBusy = true;
        const claimRes: ISuccessResponse<ScanLoginSession> =
          await claimScanLoginSession(parsed.sessionId, payload);
        if (claimRes.code === 200 || claimRes.code === 201) {
          promptAction.showDialog({
            title: '已发送',
            message: '请在目标设备上确认登录',
            buttons: [{ text: '好的', color: this.themePrimary }]
          });
        } else {
          promptAction.showDialog({
            title: '扫码失败',
            message: claimRes.message || '无法认领会话',
            buttons: [{ text: '好的', color: this.themePrimary }]
          });
        }
      }
    } catch (err) {
      const msg: string = err instanceof Error ? err.message : '二维码格式错误';
      promptAction.showDialog({
        title: '扫码失败',
        message: msg,
        buttons: [{ text: '好的', color: this.themePrimary }]
      });
    } finally {
      this.scanBusy = false;
    }
  }

  build() {
    Stack() {
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

          Text('扫码登录')
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
        .alignItems(VerticalAlign.Center)
        .zIndex(10)

        // ─── 相机区(对齐 mobile Camera/overlay/hint 分支)───────────────────
        if (!this.permissionChecked) {
          // 权限请求中(对齐 mobile loading)
          Column() {
            LoadingProgress()
              .width(48)
              .height(48)
              .color(this.themePrimary)
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else if (!this.hasCameraPermission) {
          // 无权限(对齐 mobile noPermission)
          Column() {
            Text('需要相机权限')
              .fontSize(fontSizes.md)
              .fontColor(this.themeTextSec)
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else {
          // 已授权:扫码占位视图(对齐 mobile Camera + overlay frame)
          Stack() {
            // 相机预览占位(黑色取景区)
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor('#000000')

            // 取景框(对齐 mobile frame 240x240 白色边框)
            Column()
              .width(240)
              .height(240)
              .border({ width: 2, color: '#FFFFFF' })
              .borderRadius(16)

            // 提示(对齐 mobile hint bottom:100)
            Text('对准电脑屏幕上的二维码')
              .fontSize(fontSizes.md)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.themeTextSec)
              .margin({ bottom: 100 })
          }
          .width('100%')
          .layoutWeight(1)
          .alignContent(Alignment.Center)
        }
      }
      .width('100%')
      .height('100%')

      // 会话状态提示(target 模式等待桌面端扫码确认)
      if (this.scanSession && this.scanSession.status === 'PENDING') {
        Text('等待桌面端扫码确认…')
          .fontSize(fontSizes.sm)
          .fontColor('#FFFFFF')
          .padding({ left: spacing.md, right: spacing.md, top: spacing.xs, bottom: spacing.xs })
          .backgroundColor('#80000000')
          .borderRadius(16)
          .margin({ top: 120 })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }
}
