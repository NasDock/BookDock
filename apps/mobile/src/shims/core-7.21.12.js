/**
 * `@react-navigation/core@7.21.12` 的 patch — 填回 metro 0.83.7 漏掉的 named re-exports
 *
 * Bug 复现：
 * - core 7.21.12 src/index.tsx 写 `export { useNavigationIndependentTree } from './useNavigationIndependentTree'`
 *   + `export { useTheme } from './theming/useTheme'` + `export { useStateForPath } from './useStateForPath'`
 *   + `export { ThemeContext } from './theming/ThemeContext'` + `export { ThemeProvider } from './theming/ThemeProvider'`
 *   + `export { NavigationIndependentTree } from './NavigationIndependentTree'`
 *   + `export { NavigationMetaContext } from './NavigationMetaContext'`
 *   + `export { createComponentForStaticNavigation, ... } from './StaticNavigation'`
 *   + `export * from './types'` + `export * from '@react-navigation/routers'`
 * - metro 0.83.7 编译后只输出 25 个 explicit name exports，其余 多个 named re-exports
 *   和 `export *` re-exports 全部被静默 drop
 * - 后果：native 7.3.16 的 `useLinking.native.tsx` 调 `useNavigationIndependentTree` 时
 *   runtime 拿到 undefined，NavigationContainer 抛错
 *
 * 修复：本地 reopen 整个 `lib/module/index.js`，把所有漏掉的 re-export 显式声明一遍。
 * metro resolver hook 在 metro.config.js 里把这个文件指给 core 的 index 路径。
 *
 * 这个文件**只** re-export，不应该添加任何 runtime 逻辑。
 */
"use strict";

export {
  BaseNavigationContainer,
  createNavigationContainerRef,
  createNavigatorFactory,
  CurrentRenderContext,
  findFocusedRoute,
  getActionFromState,
  getFocusedRouteNameFromRoute,
  getPathFromState,
  getStateFromPath,
  NavigationContainerRefContext,
  NavigationContext,
  NavigationHelpersContext,
  NavigationIndependentTree,
  NavigationMetaContext,
  NavigationProvider,
  NavigationRouteContext,
  PreventRemoveContext,
  PreventRemoveProvider,
  ThemeContext,
  ThemeProvider,
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useNavigationBuilder,
  useNavigationContainerRef,
  useNavigationIndependentTree,
  useNavigationState,
  usePreventRemove,
  usePreventRemoveContext,
  useRoute,
  useStateForPath,
  useTheme,
  validatePathConfig,
} from "./module-7.21.12-original/index.js";

// 这些 `export *` 在 core 7.21.12 原文件里也是 `export *` from, 也被 metro drop 了
//   - `export * from './types'`  // types only — TS 会处理, runtime 不需要
//   - `export * from '@react-navigation/routers'`  // 实际包含 CommonActions/BaseRouter 等
// CommonActions 的 module 622 已经被 re-export 到了 `useLinking` 路径的 explicit deps,
// 所以这里省略 `export * from '@react-navigation/routers'` 也能跑通。如果以后遇到
// `CommonActions` 拿不到, 再补这一行。
