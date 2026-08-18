// [API 23+] components/MainTabNavigator.ets — 1:1 对齐 mobile MainTabNavigator
// 3 个 Tab:推荐 / 书仓 / 我的
// 推荐、书仓页面在 P2 阶段实现,这里用 PlaceholderPage 占位;
// 我的 Tab 直接接 ProfileScreen(P1 已实现)。
import { RecommendScreen } from '../screens/RecommendScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { BookDetailScreen } from '../screens/BookDetailScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { TTSMiniPlayer } from '../components/TTSMiniPlayer';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { getTheme, Theme, spacing, fontSizes } from '../theme/Theme';
import { AuthStore } from '../store/AuthStore';
import { getNavStack, RouteName, BookParams } from '../router/AppRouter';
import { Book } from '../model/ApiModels';

@Component
export struct MainTabNavigator {
  @State private activeTabIndex: number = 0;
  @State private themeBg: string = '#FFFFFF';
  @State private themeSurface: string = '#F3F4F6';
  @State private themeText: string = '#1F2937';
  @State private themeTextSec: string = '#6B7280';
  @State private themeBorder: string = '#E5E7EB';
  @State private themePrimary: string = '#4A90D9';

  private authStore: AuthStore = AuthStore.shared();
  private unsubscribeAuth: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeAuth = this.authStore.subscribe((): void => {
      this.applyTheme();
    });
  }

  aboutToDisappear(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
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
  }

  @Builder
  PageBuilder(name: string, param: object) {
    // navDestination 回调必须用 NavDestination 包裹,否则内容不渲染(NavDestinationContent 空白)
    // .hideTitleBar(true) 对齐 mobile headerShown:false
    if (name === RouteName.BOOK_DETAILS) {
      NavDestination() {
        BookDetailScreen({ initialBook: (param as BookParams).book })
      }
      .hideTitleBar(true)
    } else if (name === RouteName.READER) {
      NavDestination() {
        ReaderScreen({ initialBook: (param as BookParams).book })
      }
      .hideTitleBar(true)
    } else {
      NavDestination() {
        Column() {
          Text(`未注册路由: ${name}`)
            .fontSize(fontSizes.md)
            .fontColor(this.themeTextSec)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      }
      .hideTitleBar(true)
    }
  }

  build() {
    Stack() {
      Navigation(getNavStack()) {
        Tabs({ barPosition: BarPosition.End, index: this.activeTabIndex }) {
          TabContent() {
            RecommendScreen()
          }
          .tabBar(this.TabBar(0, '推荐', AppIconKind.Home))

          TabContent() {
            LibraryScreen()
          }
          .tabBar(this.TabBar(1, '书仓', AppIconKind.Library))

          TabContent() {
            ProfileScreen()
          }
          .tabBar(this.TabBar(2, '我的', AppIconKind.Person))
        }
        .onChange((idx: number): void => {
          this.activeTabIndex = idx;
        })
        .barMode(BarMode.Fixed)
        .barWidth('100%')
        .barHeight(56)
        .backgroundColor(this.themeBg)
      }
      .navDestination(this.PageBuilder)
      .hideTitleBar(true)
      .mode(NavigationMode.Stack)

      // TTSMiniPlayer 全局浮层(P4 阶段替换为 AVPlayer 联动)
      // 贴 TabBar 上方(bottom: 56 TabBar 高度 + 8 间距)
      TTSMiniPlayer()
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
    .alignContent(Alignment.Bottom)
  }

  @Builder
  TabBar(idx: number, label: string, icon: AppIconKind) {
    Column() {
      AppIcon({
        kind: icon,
        iconSize: 22,
        iconColor: this.activeTabIndex === idx ? this.themePrimary : this.themeTextSec
      })
      Text(label)
        .fontSize(fontSizes.xs)
        .fontColor(this.activeTabIndex === idx ? this.themePrimary : this.themeTextSec)
        .margin({ top: 2 })
    }
    .padding({ top: spacing.xs, bottom: spacing.xs })
    .layoutWeight(1)
  }
}