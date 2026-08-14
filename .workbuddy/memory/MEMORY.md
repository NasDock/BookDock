# BookDock 项目长期约定

## mobile2（apps/mobile）—— 纯 RN 复刻 mobile ✅ 已完成改名

### 定位与硬约束（**已改名**，2026-08-14 17:50）
- `apps/mobile` = **纯 RN 版**（RN 0.81.5 + React 19.1.0 + Fabric），原"mobile2"已重命名为 mobile
- 原 mobile（Expo 52 + RN 0.76.9）已彻底废弃，仅存 git 历史作对照（`git show <commit>:apps/mobile/...`）
- **不引任何 expo-* 模块；不要跑 `npx expo prebuild`**（会破坏 android/ios 原生工程）
- **app.json 已删（2026-08-14 18:38）**：mobile 不再需要 expo 配置；CI 和 release.js 取版本号统一用**根 `package.json.version`**（与 release.js source of truth 对齐）
- mobile2 → mobile 改名铁律见 2026-08-14.md "apps/mobile2 → apps/mobile 改名后清缓存铁律"段（CMake `.cxx/` + 3 个 gradle 缓存）
- **safe-area-context 包必须保留，但组件不用**（2026-08-14 校正 08-13 的"卸载"决定）：react-native-screens 内部硬依赖它（NativeStackView 直接 import），卸载会红屏 `Can't find ViewManager 'RNCSafeAreaProvider'`。做法：package.json 保留依赖，代码里不用 SafeAreaView/SafeAreaProvider（SafeAreaProvider 在 RN 0.81 上偶发 native bridge throw → navigationRef undefined）。布局替代：App.tsx 顶层全屏 View 铺主题背景 + RN 内置 StatusBar + styles.xml 透明栏（statusBarColor/navigationBarColor=transparent + windowDrawsSystemBarBackgrounds=true）。加/删 native 包后必须 native rebuild 一次。
- Metro：`@react-native/metro-config` + watchFolders + disableHierarchicalLookup。Babel：worklets plugin 放最后。
- iOS 无 Gemfile，直接 `pod install`，不走 bundle。

### expo → 纯 RN 替换映射
vector-icons→react-native-vector-icons；notifications→@notifee/react-native；file-system→react-native-fs；intent-launcher→react-native-intent-launcher；web-browser→react-native-inappbrowser-reborn；sharing→react-native-share；navigation-bar→utils/navigationBar.ts；status-bar/constants/font→RN 内置；av→react-native-track-player（⚠️ 5.0.0-alpha0，API 不同于 v4：setupPlayer / Event.PlaybackActiveTrackChanged 等，index.js 必须 registerPlaybackService）；camera→react-native-vision-camera（待装）。
JS-only 库（vector-icons / intent-launcher）无 .d.ts → 集中声明在 `src/types/declarations.d.ts`（Hermes globals atob/btoa/TextDecoder/navigator.share 也在此，别到处 @ts-ignore）。

### 踩坑清单
1. **新 RN 子项目第一步**：package.json 显式 declare 14 个 `@react-native/*`（与 react-native 同版本）+ `react-devtools-core`，再 `pnpm install --force`。否则 root shamefully-hoist 用 mobile 的 0.76 transitive 占位 → gradle-plugin/autolinking/codegen 链式炸。
2. **workspace 包禁止 `await import()`**：Metro 给 async bundle 生成 `../../` 路径，URL 解析后 404。一律静态 import。
3. **新 native 库必须 rebuild APK**：`./gradlew assembleDebug && adb install -r`，热更只更 JS。react-native-webview@13.12.5 + RN 0.81 有 Kotlin null-safety 编译错 → pnpm patch（patches/react-native-webview.patch + pnpm-workspace.yaml 注册）。
4. **`as any` ≠ runtime 通**：P 阶段结束 grep `as any`，缺啥补啥（libraryStore 的 getLocalBookPath 必须同步返回）。
5. **Metro markdown-it@10 legacy require**（entities.json 解析失败）→ metro.config.js 的 resolver.resolveRequest hook 精准拦截返回绝对路径，不要 pnpm.overrides。
6. **RN7 导航**：`useNavigationContainerRef<T>()` 不传 initialState；NavigationContainer theme 必传 fonts（400/500/700/900）。
7. **页面迁移时注册 options 要跟 mobile 原版对齐**：自绘 header 的页面必须 `headerShown: false`，否则双 header。已修：BookDetails（2026-08-14）。未迁页面：AuthorDetail / Notes / TTSReader（点对应入口会静默无反应，RN7 只 console.error）。
8. **ReaderScreen 的 libraryStore 三方法**（getLocalBookPath / saveReadingProgress / downloadBook）已补齐进 mobile2 libraryStore，getLocalBookPath 保持同步。

### ⚠️ 触摸按钮点不到 → **先查 GestureHandlerRootView（hard rule）**
**症状**：TouchableOpacity.onPress 全部失灵，含纯 setState 的按钮；系统侧边返回手势无效；View.onTouchStart 可能偶发触发；WebView 内 Chromium 滚动正常。
**真正根因（2026-08-14 教训，治标多轮浪费 1 小时才发现）**：`react-native-gesture-handler` 没正确初始化 —— 任何 RN 0.81 + native-stack（@react-navigation/native-stack@7）项目 **必须同时做两件事**：
1. `index.js` **第一行** `import 'react-native-gesture-handler';`（触发 native module 注册）
2. `App.tsx` 根容器用 `<GestureHandlerRootView style={{flex:1}}>` 包裹 `<RootNavigator />`（TapGestureHandler / BackHandler 都依赖根容器上下文）

**排查优先级**（不要再被表象骗）：
1. 先看 `App.tsx` 根是不是 `GestureHandlerRootView`
2. 再看 `index.js` 头一行有没有 `import 'react-native-gesture-handler';`
3. 才是 layout / zIndex / elevation

**诊断信号**：`<View onTouchStart>` 能触发 + `<TouchableOpacity onPress>` 全部失灵 = **100% 是 gesture 系统问题**，不是层级问题。
**未来所有纯 RN 项目模板**：`App.tsx` 顶层强制 `<GestureHandlerRootView>` —— 这是 hard rule，不可选。

### WebView + absolute 栏的次级坑（RN 0.81 + Fabric + Android，gesture 修好后才需要关心）
gesture 修好后如果栏点不到，再考虑 layout 三件套：①栏在 WebView 之后 render；②栏静态外壳加 `elevation: 12, zIndex: 10`；③内层动画 `useNativeDriver: false`（JS driver 保热区==视觉）。mobile（RN 0.76）跑通的 layout 不代表 mobile2（RN 0.81 + Fabric）也跑通。

### mobile2 tsc 现状
2026-08-14 起全项目 TS2786（'View' cannot be used as a JSX component 等）刷屏——root @types/react 版本与 RN 不匹配的**存量环境问题**，与业务代码无关。验证改动时过滤：`npx tsc --noEmit | grep <文件> | grep -v TS2786`。

## Plus 服务层（services/plus.ts）
- **plusRequest 已是 envelope**：interceptor `return data`，`await plusRequest.get()` 拿到的就是 `{code,message,data}`。范式：`return res as unknown as ISuccessResponse<T>`（二段 cast 必需）。
- Plus 后端是 AudioDock 共享服务（`https://www.audiodock.cn/api`），改 DTO 前对照 `AudioDock/packages/services/src/plus.ts`（注意嵌套 vs 平铺，如 VipCurrentLowestPriceData 嵌套 annual/lifetime.plan）。
- 联调：`curl https://www.audiodock.cn/api/vip/current-lowest-price`（无需 token）。

## 会员权益文案维护约定
"4 免 4 会"分布在 7 文件 10+ 处：mobile MemberBenefitsScreen/MemberDetailScreen；desktop MemberBenefits/MemberDetail/Membership/NoVipBlock；server vip.service.ts + vip.dto.ts。改文案必须全改，grep 验证 `扫码登录|桌面小组件|优先客服|声仓会员` + `基础功能|云端同步|云端朗读|免广告`。图标：QrCode/Layout/MessageCircle/Headphones（mobile emoji 📷🪟💬🎧）。永久卡 features 4 条平铺，不加"全部年卡特权"前缀。

## mobile（Expo 版，仅存 git）遗留知识
- SafeAreaView + native-stack header 重复 inset：headerShown:true 时 SafeAreaView 必须 `edges={['left','right']}`。
- Android 横屏相机侧横条：app.json android 块 `edgeToEdgeEnabled: true` + App.tsx 全屏主题背景 View；不改 styles.xml 的 statusBarColor；必须 `expo prebuild --clean` 生效。
- Silent fallback：MemberBenefits 等页 fallbackPrice 吞错 → 临时 render `JSON.stringify(rawResponse)` 看 envelope 三层是否完整。
