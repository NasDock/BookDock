/**
 * screens/index.ts — mobile2 第一版
 *
 * 当前只导出 SettingsScreen + 三个 navigate 目标占位页面 (Member 3 个)。
 * 后续每迁一个 mobile 页面,在这里加一行 export。
 *
 * 注意:TypeScript 报 "[ts] File 'xxx' is not a module" 时,
 * 检查文件顶部是否 export 了对应的 component。
 */

export { SettingsScreen } from './SettingsScreen';
export { LoginScreen } from './LoginScreen';
export { MemberLoginScreen } from './MemberLoginScreen';
export { MemberBenefitsScreen } from './MemberBenefitsScreen';
export { MemberDetailScreen } from './MemberDetailScreen';
export { MemberPaymentSuccessScreen } from './MemberPaymentSuccessScreen';
export { ScanLoginScreen } from './ScanLoginScreen';
// 首页 tab 3 屏(1:1 复刻 mobile 旧版,LinearGradient → 纯色,expo-vector-icons → react-native-vector-icons)
export { RecommendScreen } from './RecommendScreen';
export { LibraryScreen } from './LibraryScreen';
export { ProfileScreen } from './ProfileScreen';
// 后续要 1:1 移植的页面占位（先让跳转不 crash）
export { BookDetailScreen } from './BookDetailScreen';
export { ReaderScreen } from './ReaderScreen';
export { CollectionDetailScreen } from './CollectionDetailScreen';
export { AdminUsersScreen } from './AdminUsersScreen';
export { StatsScreen } from './StatsScreen';
export { SearchScreen } from './SearchScreen';
// P4:TTS 系列 — TTSScreen 是主屏,TTSTabScreen 是 tab 入口
export { TTSScreen } from './TTSScreen';
export { TTSTabScreen } from './TTSTabScreen';