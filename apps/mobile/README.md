# BookDock Mobile2

`@bookdock/mobile2` — 一比一复刻 `apps/mobile`，剥离所有 `expo-*` 模块，采用 **AudioDock 同版本** 的纯 React Native 工程。

## 定位

| | `apps/mobile` | `apps/mobile2`（本仓库） |
|---|---|---|
| 构建工具 | Expo 52 | 纯 RN CLI（无 Expo SDK） |
| RN 版本 | 0.76.9 | **0.81.5** |
| React 版本 | 18.3.1 | **19.1.0** |
| Router | expo-router（未启用）+ RN navigation 6 | RN navigation 7 |
| 包管理 | pnpm workspace | pnpm workspace |

> 之所以另起 `mobile2` 而不是改 `mobile`：保留 `mobile` 作为对照与热修基底，迁移期间 `mobile` 继续走 Expo 构建链路。

## 当前状态（2026-08-13）

✅ 骨架阶段：

- `apps/mobile2/` 完整目录：`src/{screens,components,navigation,services,stores,hooks,utils,types}`、`assets/`
- `apps/mobile2/{android,ios}/` — 来自 `npx @react-native-community/cli init MobileTwo --version 0.81.5`
- `package.json` — 已 declare `workspace:*` 引用 `@bookdock/{api-client,auth,ebook-reader,tts,ui}` 五个共享包，未引入任何 `expo-*`
- `metro.config.js` — workspace-aware（`watchFolders`、`disableHierarchicalLookup`）
- `babel.config.js` — `@react-native/babel-preset` + `module-resolver`（`@` → `./src`）+ `react-native-worklets/plugin`
- `tsconfig.json` — extends `@react-native/typescript-config`，加 `@/*` 路径映射
- `App.tsx` — 最小可运行壳（主题色 + 版本号）
- `Gemfile`、`jest.config.js`、`.gitignore`、`.watchmanconfig`

⏳ **待迁移**（不阻塞骨架启动）：

- `apps/mobile/src/navigation/RootNavigator.tsx` + `MainTabNavigator.tsx`
- `apps/mobile/src/screens/*`（22 个，分批迁）
- `apps/mobile/src/services/*`、`stores/*`、`hooks/*`、`utils/*`、`types/*`
- `apps/mobile/src/components/{TTSMiniPlayer,UpdateModal}.tsx`
- `apps/mobile/assets/*`（图标、splash、icon）

## 启动

```bash
# 1. 安装依赖（workspace 会自动装 api-client/auth/ebook-reader/tts/ui）
pnpm install

# 2. iOS 首次需要装 pods（**不用 bundle**，mobile 工作流也是直接 pod install）
cd apps/mobile2/ios && pod install && cd -

# 3. 跑起来
pnpm --filter @bookdock/mobile2 start            # metro
pnpm --filter @bookdock/mobile2 ios              # iOS 模拟器（前提：系统已装 CocoaPods，brew install cocoapods）
pnpm --filter @bookdock/mobile2 android          # Android 模拟器/真机
pnpm --filter @bookdock/mobile2 tsc              # 类型检查
```

## expo → 纯 RN 替换映射表

`apps/mobile` 用了 14 个 `expo-*` 模块，`mobile2` **全部不引入**，逐项替换：

| 现有 expo 模块 | 替换方案 | 备注 |
|---|---|---|
| `expo-av` | `react-native-video` + `react-native-track-player` | 音频/视频播放；TTS/Reader 用 track-player |
| `expo-camera` | `react-native-vision-camera` | 扫码登录用 |
| `expo-file-system` | `react-native-fs` | 离线缓存 |
| `expo-font` | RN 内置 `<Text>` + `react-native-asset` | 字体资源 |
| `expo-linear-gradient` | `react-native-linear-gradient` | 紫卡 / 按钮渐变 |
| `expo-notifications` | `@notifee/react-native` | 推送通知 |
| `expo-splash-screen` | `react-native-bootsplash` | 启动屏 |
| `expo-status-bar` | RN 内置 `<StatusBar />` | 状态栏 |
| `expo-web-browser` | `react-native-inappbrowser-reborn` | 外部链接 |
| `expo-intent-launcher` | 自实现 native module 或 `react-native-intent-launcher` | Android Intent 跳转 |
| `expo-sharing` | `react-native-share` | 系统分享面板 |
| `expo-navigation-bar` | RN 原生 API（`NavigationBar.setColor`） | Android 导航栏颜色 |
| `expo-modules-core` | 不需要 | mobile2 纯 RN |
| `expo-asset` | `react-native-asset` | 资源打包 |

> 替换**按需**进行：迁移某个屏幕时再加对应依赖，不要一次性全装。

## monorepo 适配要点

1. **Root `package.json`** 仍然挂着 `expo ~52.0.49` 和 `react-native 0.76.9`（给 `mobile` 用），`mobile2` 自己 declare `react-native 0.81.5`，pnpm 在各自 `node_modules` 独立 hoist，**不会有冲突**。
2. **不需要 `patches/expo-modules-core.patch`**：那是给 `mobile` 用的，`mobile2` 不引入 `expo-modules-core`，`pnpm-workspace.yaml` 的 `patchedDependencies` 在 install mobile2 时会忽略。
3. **`@bookdock/*` workspace 包** 用 `workspace:*` 引用，mobile2 与 mobile 共享同一份代码。
4. **Metro monorepo 模式**：参考 `mobile/metro.config.js`，但用 `@react-native/metro-config` 替代 `expo/metro-config`。

## 下一步计划（建议）

按"先不依赖 expo 的页面 → 后替换 expo 的页面"分批：

1. **第一批（无 expo 依赖）**：`LoginScreen`、`MemberLoginScreen`、`MemberBenefitsScreen`、`MemberDetailScreen`、`MemberPaymentSuccessScreen`、`SettingsScreen`、`ProfileScreen`、`LibraryScreen`、`SearchScreen`、`RecommendScreen`、`StatsScreen`、`NotesScreen`、`AuthorDetailScreen`、`CollectionDetailScreen`、`SourceManageScreen`、`AdminUsersScreen`、`BookDetailScreen`、`ScanLoginScreen`（部分）
2. **第二批（少量 expo 替换）**：`TTSScreen`、`TTSTabScreen`、`TTSReaderScreen`、`ReaderScreen` — 涉及 `expo-av`/`expo-file-system` 替换
3. **第三批（重 expo 依赖）**：`ScanLoginScreen`（完整） — `expo-camera` → `react-native-vision-camera`

每批迁完都要在 mobile2 上跑通 `tsc` + 真机/模拟器冒烟。

## 注意事项

- **不要跑 `npx expo prebuild`**：mobile2 不是 expo 项目，会破坏 `android/`、`ios/` 原生工程
- **改 `app.json`**：当前只有 `{name, displayName}`，不需要 `expo` 块
- **改 `index.js`**：保持 `AppRegistry.registerComponent(appName, () => App)` 不变
- **改 bundleId / package**：当前是 `com.bookdock2.app`（模板默认 `org.reactjs.native.example.MobileTwo` 的派生），如有需要改 `android/app/build.gradle` 的 `applicationId` 和 `ios/MobileTwo/Info.plist`