// [API 23+] router/AppRoot.ets — Navigation 根容器
// P1: 根据 AuthStore.isAuthenticated 分发登录页/主 Tab;
// P1~P6 阶段把各路由接真实页面。
import { ConfigurationConstant } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { getNavStack, RouteName } from './AppRouter';
import { ThemeStore, getTheme, Theme } from '../theme/Theme';
import { AuthStore } from '../store/AuthStore';
import { initApiClient } from '../network/ApiClient';
import { getSavedApiBaseUrl } from '../utils/NetworkHelper';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabNavigator } from '../components/MainTabNavigator';

const APP_DOMAIN = 0x0009;
const APP_TAG = 'AppRoot';

// 带超时的 Promise 包装(默认 3s),防止网络/磁盘异常时启动链卡死
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: number = -1;
  try {
    const timeout: Promise<null> = new Promise((resolve) => {
      timer = setTimeout(() => {
        hilog.warn(APP_DOMAIN, APP_TAG, '%{public}s timeout(%{public}d ms), skip', label, ms);
        resolve(null);
      }, ms);
    });
    const result: T | null = await Promise.race([p, timeout]);
    return result;
  } catch (err) {
    hilog.warn(APP_DOMAIN, APP_TAG, '%{public}s fail: %{public}s', label, JSON.stringify(err));
    return null;
  } finally {
    if (timer >= 0) {
      clearTimeout(timer);
    }
  }
}

// 鸿蒙 Configuration.colorMode 字段类型(ArkTS 严格模式禁止 ESObject / unknown,用具体字段 interface 替代)
interface ConfigurationLike {
  colorMode: number;
}

@Entry
@Component
struct AppRoot {
  @State private themeBg: string = '#FFFFFF';
  @State private themeText: string = '#1F2937';
  @State private themeTextSecondary: string = '#6B7280';
  @State private isLoaded: boolean = false;
  // 把 authStore.isAuthenticated 镜像到 @State,确保 if/else 真的能驱动重渲染。
  // ArkUI 对 @Observed 单例的"字段直读"并不总是触发依赖收集,显式 @State 是最稳的写法。
  @State private isAuthed: boolean = false;

  private themeStore: ThemeStore = ThemeStore.shared();
  private authStore: AuthStore = AuthStore.shared();
  private unsubscribeAuth: (() => void) | null = null;

  async aboutToAppear(): Promise<void> {
    hilog.info(APP_DOMAIN, APP_TAG, 'aboutToAppear start');
    await withTimeout(this.themeStore.load(), 2000, 'themeStore.load');
    this.applyTheme(this.themeStore.getCurrentTheme());

    // 1) 加载 auth 持久化态(token + user)
    await withTimeout(this.authStore.load(), 2000, 'authStore.load');

    // 2) 初始化 ApiClient(token 拦截器 + onAuthError → logout)
    const apiBaseUrl: string | null = await withTimeout(
      getSavedApiBaseUrl('http://localhost:8088/api'), 2000, 'getSavedApiBaseUrl');
    const baseUrl: string = apiBaseUrl ?? 'http://localhost:8088/api';
    hilog.info(APP_DOMAIN, APP_TAG, 'apiBaseUrl=%{public}s', baseUrl);
    initApiClient({
      baseURL: baseUrl,
      getAuthToken: () => this.authStore.token,
      onAuthError: () => {
        this.authStore.logout();
      },
    });

    // 3) 校验 token;无效则切到 Login,有效则放 MainTab
    //    网络不通时 3s 超时兜底走本地缓存态,避免白屏
    await withTimeout(this.authStore.restoreAuth(), 3000, 'authStore.restoreAuth');
    this.isAuthed = this.authStore.isAuthenticated;
    hilog.info(APP_DOMAIN, APP_TAG, 'restoreAuth done, isAuthed=%{public}s',
      this.isAuthed ? 'true' : 'false');

    // 4) 监听 auth 变化,镜像到 @State 驱动 if/else 重渲
    this.unsubscribeAuth = this.authStore.subscribe(() => {
      this.isAuthed = this.authStore.isAuthenticated;
      hilog.info(APP_DOMAIN, APP_TAG, 'auth changed, isAuthed=%{public}s',
        this.isAuthed ? 'true' : 'false');
    });

    this.isLoaded = true;
    hilog.info(APP_DOMAIN, APP_TAG, 'aboutToAppear end, isLoaded=true, isAuthed=%{public}s',
      this.isAuthed ? 'true' : 'false');
  }

  aboutToDisappear(): void {
    this.unsubscribeAuth?.();
  }

  onConfigurationUpdate(newConfig: object): void {
    const cfg: object = newConfig;
    // Configuration.colorMode 是 ColorMode 枚举(数字),ArkTS 严格模式禁止 unknown,固定 object 后 cast
    const cm: number = (cfg as ConfigurationLike).colorMode;
    this.themeStore.setSystemDark(cm === ConfigurationConstant.ColorMode.COLOR_MODE_DARK);
    this.applyTheme(this.themeStore.getCurrentTheme());
  }

  private applyTheme(t: Theme): void {
    this.themeBg = t.colors.background;
    this.themeText = t.colors.text;
    this.themeTextSecondary = t.colors.textSecondary;
  }

  build() {
    Stack() {
      if (this.isLoaded) {
        // 简化结构:不用 Navigation 包根页面,直接 if/else 渲登录或主 Tab。
        // 子页面跳转未来再用 Navigation 包(等 P3/P4 真正用到 pushRoute)。
        if (this.authStore.isAuthenticated) {
          MainTabNavigator()
        } else {
          LoginScreen()
        }
      } else {
        Column() {
          LoadingProgress().color(this.themeTextSecondary).height(40)
        }
        .width('100%')
        .height('100%')
        .backgroundColor(this.themeBg)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
  }
}