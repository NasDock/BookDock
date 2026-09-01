// [API 23+] router/AppRouter.ets — 1:1 对齐 mobile RootStackParamList 的 18 条路由
// 单 NavPathStack 管所有跳转;对齐 mobile headerShown:false 的页面用自绘 header。
// 现阶段每个 Page 是占位 build,等 P1~P6 阶段逐个替换为真实页面。
import { Book, Author } from '../model/ApiModels';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0004;
const TAG = 'AppRouter';

// 路由常量 — 1:1 对齐 mobile RootStackParamList 的 key
export class RouteName {
  static readonly MAIN = 'Main';
  static readonly READER = 'Reader';
  static readonly TTS_SCREEN = 'TTSScreen';
  static readonly TTS_READER = 'TTSReader';
  static readonly BOOK_DETAILS = 'BookDetails';
  static readonly AUTHOR_DETAIL = 'AuthorDetail';
  static readonly LOGIN = 'Login';
  static readonly MEMBER_LOGIN = 'MemberLogin';
  static readonly SCAN_LOGIN = 'ScanLogin';
  static readonly MEMBER_BENEFITS = 'MemberBenefits';
  static readonly MEMBER_DETAIL = 'MemberDetail';
  static readonly MEMBER_PAYMENT_SUCCESS = 'MemberPaymentSuccess';
  static readonly SOURCE_MANAGE = 'SourceManage';
  static readonly SETTINGS = 'Settings';
  static readonly ADMIN_USERS = 'AdminUsers';
  static readonly COLLECTION_DETAIL = 'CollectionDetail';
  static readonly NOTES = 'Notes';
  static readonly STATS = 'Stats';
  static readonly SEARCH = 'Search';
}

// ─── 入参类型 ───────────────────────────────────────────────────

export interface LoginParams {
  initialMode?: 'scan';
}

export interface BookParams {
  book: Book;
}

export interface TTSParams {
  book: Book;
  showChapterPicker?: boolean;
}

export interface AuthorParams {
  author: Author;
}

export interface CollectionDetailParams {
  collectionId: string;
}

export interface NotesParams {
  bookId?: string;
  author?: string;
}

// 路由配置表(对齐 mobile 18 条 entry + headerShown 标记)
export interface RouteConfig {
  name: string;
  showHeader: boolean;
  title?: string;
}

export const ROUTE_CONFIG: RouteConfig[] = [
  // 主 Tab
  { name: RouteName.MAIN, showHeader: false },
  // 阅读器 / TTS
  { name: RouteName.READER, showHeader: false },
  { name: RouteName.TTS_SCREEN, showHeader: false, title: '听书' },
  { name: RouteName.TTS_READER, showHeader: false },
  // 详情
  { name: RouteName.BOOK_DETAILS, showHeader: false },
  { name: RouteName.AUTHOR_DETAIL, showHeader: false },
  // 登录 / 扫码
  { name: RouteName.LOGIN, showHeader: false },
  { name: RouteName.MEMBER_LOGIN, showHeader: false },
  { name: RouteName.SCAN_LOGIN, showHeader: false },
  // 会员
  { name: RouteName.MEMBER_BENEFITS, showHeader: true, title: '会员权益' },
  { name: RouteName.MEMBER_DETAIL, showHeader: true, title: '会员详情' },
  { name: RouteName.MEMBER_PAYMENT_SUCCESS, showHeader: true, title: '支付成功' },
  // 资料 / 设置
  { name: RouteName.SOURCE_MANAGE, showHeader: true, title: '书源管理' },
  { name: RouteName.SETTINGS, showHeader: true, title: '设置' },
  { name: RouteName.ADMIN_USERS, showHeader: true, title: '用户管理' },
  { name: RouteName.STATS, showHeader: false },
  { name: RouteName.SEARCH, showHeader: true, title: '搜索' },
  // 合集 / 笔记
  { name: RouteName.COLLECTION_DETAIL, showHeader: false },
  { name: RouteName.NOTES, showHeader: false }
];

export function getRouteConfig(name: string): RouteConfig | undefined {
  return ROUTE_CONFIG.find((r) => r.name === name);
}

export function isHeaderShown(name: string): boolean {
  const cfg = getRouteConfig(name);
  return cfg ? cfg.showHeader : true;
}

// ─── 全局 NavPathStack 单例 ─────────────────────────────────────

let stackSingleton: NavPathStack | null = null;

export function getNavStack(): NavPathStack {
  if (!stackSingleton) {
    stackSingleton = new NavPathStack();
  }
  return stackSingleton;
}

// 推送便捷封装
export function pushRoute(name: string, param?: object): void {
  hilog.info(DOMAIN, TAG, 'navigate %{public}s', name);
  if (param) {
    getNavStack().pushPath({ name, param });
  } else {
    getNavStack().pushPath({ name });
  }
}

export function popRoute(): void {
  getNavStack().pop();
}

export function popToRoot(): void {
  getNavStack().clear();
}

export function replaceRoute(name: string, param?: object): void {
  if (param) {
    getNavStack().replacePath({ name, param });
  } else {
    getNavStack().replacePath({ name });
  }
}
