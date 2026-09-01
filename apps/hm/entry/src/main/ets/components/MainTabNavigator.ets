// [API 23+] components/MainTabNavigator.ets — 1:1 对齐 mobile MainTabNavigator
// 3 个 Tab:推荐 / 书仓 / 我的
// 推荐、书仓页面在 P2 阶段实现,这里用 PlaceholderPage 占位;
// 我的 Tab 直接接 ProfileScreen(P1 已实现)。
import { RecommendScreen } from '../screens/RecommendScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { BookDetailScreen } from '../screens/BookDetailScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { TTSScreen } from '../screens/TTSScreen';
import { TTSReaderScreen } from '../screens/TTSReaderScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AdminUsersScreen } from '../screens/AdminUsersScreen';
import { MemberLoginScreen } from '../screens/MemberLoginScreen';
import { ScanLoginScreen } from '../screens/ScanLoginScreen';
import { MemberBenefitsScreen } from '../screens/MemberBenefitsScreen';
import { MemberDetailScreen } from '../screens/MemberDetailScreen';
import { MemberPaymentSuccessScreen } from '../screens/MemberPaymentSuccessScreen';
import { CollectionDetailScreen } from '../screens/CollectionDetailScreen';
import { AuthorDetailScreen } from '../screens/AuthorDetailScreen';
import { TTSMiniPlayer } from '../components/TTSMiniPlayer';
import { AppIcon, AppIconKind } from '../components/AppIcon';
import { getTheme, Theme, spacing, fontSizes } from '../theme/Theme';
import { AuthStore } from '../store/AuthStore';
import { TTSPlayer, TTSPlayerState } from '../player/TTSPlayer';
import {
  getNavStack,
  RouteName,
  BookParams,
  TTSParams,
  AuthorParams,
  CollectionDetailParams
} from '../router/AppRouter';
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

  // ─── MiniPlayer 显隐控制 ─────────────────────────────────────────
  @State private showMiniPlayer: boolean = false;
  @State private currentRouteName: string = '';
  private routePollTimerId: number = -1;

  private authStore: AuthStore = AuthStore.shared();
  private unsubscribeAuth: (() => void) | null = null;

  aboutToAppear(): void {
    this.applyTheme();
    this.unsubscribeAuth = this.authStore.subscribe((): void => {
      this.applyTheme();
    });
    this.startRoutePolling();
  }

  aboutToDisappear(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
    }
    this.stopRoutePolling();
  }

  // ─── 轮询路由栈顶(500ms)，判断 MiniPlayer 显隐 ──────────────────────
  private startRoutePolling(): void {
    this.stopRoutePolling();
    this.updateMiniPlayerVisibility();
    this.routePollTimerId = setInterval((): void => {
      this.updateMiniPlayerVisibility();
    }, 500);
  }

  private stopRoutePolling(): void {
    if (this.routePollTimerId >= 0) {
      clearInterval(this.routePollTimerId);
      this.routePollTimerId = -1;
    }
  }

  private updateMiniPlayerVisibility(): void {
    // 1. 取当前路由栈顶页面名
    const names: string[] = getNavStack().getAllPathName();
    const top: string = names.length > 0 ? names[names.length - 1] : '';
    this.currentRouteName = top;

    // 2. 阅读详情页 / TTS 详情页 / TTS阅读页 / 设置页 → 始终隐藏
    const hideRoutes: string[] = [RouteName.READER, RouteName.TTS_SCREEN, RouteName.TTS_READER, RouteName.SETTINGS];
    if (hideRoutes.includes(top)) {
      this.showMiniPlayer = false;
      return;
    }

    // 3. 其他页面 → 有正在播放的 TTS 才显示
    const player: TTSPlayer = TTSPlayer.shared();
    const hasActiveTTS: boolean = player.currentBookId !== '' &&
      (player.state === TTSPlayerState.PLAYING || player.state === TTSPlayerState.PAUSED);
    this.showMiniPlayer = hasActiveTTS;
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
    } else if (name === RouteName.TTS_SCREEN) {
      NavDestination() {
        TTSScreen({
          initialBook: (param as TTSParams).book,
          initialShowChapterPicker: (param as TTSParams).showChapterPicker ?? false
        })
      }
      .hideTitleBar(true)
    } else if (name === RouteName.TTS_READER) {
      NavDestination() {
        TTSReaderScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.SEARCH) {
      NavDestination() {
        SearchScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.STATS) {
      NavDestination() {
        StatsScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.SETTINGS) {
      NavDestination() {
        SettingsScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.ADMIN_USERS) {
      NavDestination() {
        AdminUsersScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.MEMBER_LOGIN) {
      NavDestination() {
        MemberLoginScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.SCAN_LOGIN) {
      NavDestination() {
        ScanLoginScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.MEMBER_BENEFITS) {
      NavDestination() {
        MemberBenefitsScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.MEMBER_DETAIL) {
      NavDestination() {
        MemberDetailScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.MEMBER_PAYMENT_SUCCESS) {
      NavDestination() {
        MemberPaymentSuccessScreen()
      }
      .hideTitleBar(true)
    } else if (name === RouteName.COLLECTION_DETAIL) {
      NavDestination() {
        CollectionDetailScreen({ collectionId: (param as CollectionDetailParams).collectionId })
      }
      .hideTitleBar(true)
    } else if (name === RouteName.AUTHOR_DETAIL) {
      NavDestination() {
        AuthorDetailScreen({ initialAuthor: (param as AuthorParams).author })
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

      // TTSMiniPlayer 全局浮层(路由感知:阅读/TTS/设置页隐藏，其他页有播放才显示)
      // 贴 TabBar 上方(bottom: 56 TabBar 高度 + 8 间距)
      if (this.showMiniPlayer) {
        TTSMiniPlayer()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.themeBg)
    .alignContent(Alignment.Bottom)
  }

  @Builder
  TabBar(idx: number, label: string, icon: AppIconKind) {
    // 用 Stack 绝对定位 icon / label,而不是 Column 流式布局:
    // SymbolGlyph 渲染行高≈3*fontSize(fontSize=22 时≈66px),Text fallback 只有≈fontSize,
    // Column 流式布局下两类 icon 占据的「行盒」高度不同,不管怎么 align 都没法让
    // 「书仓」和「推荐/我的」的图标顶部真正对齐。
    // Stack + offset 把 icon 槽固定在 (top:0,height:24),label 固定在 (top:26),
    // 两类 icon 在同一槽内都垂直居中,视觉顶/底就完全对齐了。
    Stack() {
      Column() {
        AppIcon({
          kind: icon,
          iconSize: 22,
          iconColor: this.activeTabIndex === idx ? this.themePrimary : this.themeTextSec
        })
      }
      .width(24)
      .height(24)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .offset({ x: 0, y: 0 })

      Text(label)
        .fontSize(fontSizes.xs)
        .fontColor(this.activeTabIndex === idx ? this.themePrimary : this.themeTextSec)
        .offset({ x: 0, y: 32 })
    }
    .width('100%')
    .height(48)
    .alignContent(Alignment.Top)
    .layoutWeight(1)
  }
}