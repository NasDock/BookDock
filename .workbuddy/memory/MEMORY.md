# BookDock 项目长期约定

## mobile（apps/mobile）—— 纯 RN 版（RN 0.81.5 + React 19.1.0 + Fabric）
- 原 Expo 版已废弃，仅存 git 历史对照。**不引 expo-*，不跑 expo prebuild**；app.json 已删，版本号取根 package.json.version。
- safe-area-context 包保留依赖但组件不用（react-native-screens 硬依赖）；布局用顶层全屏 View + RN StatusBar + styles.xml 透明栏。
- Metro：`@react-native/metro-config` + watchFolders + disableHierarchicalLookup；Babel worklets plugin 放最后。
- 新 native 库必须 rebuild APK（assembleDebug + adb install -r），热更只更 JS。
- workspace 包禁止 `await import()`（Metro async bundle 路径 404），一律静态 import。
- RN7 导航：自绘 header 页面必须 headerShown:false，否则双 header。

### ⚠️ 触摸失灵 hard rule（2026-08-14 教训）
TouchableOpacity 全部失灵 + View.onTouchStart 能触发 = **100% gesture 系统问题**。RN 0.81 项目必须同时：
1. `index.js` 第一行 `import 'react-native-gesture-handler';`
2. `App.tsx` 根容器 `<GestureHandlerRootView style={{flex:1}}>`
排查顺序：App.tsx 根容器 → index.js import → 才是 layout/zIndex/elevation。

## Plus 服务层（services/plus.ts）
- plusRequest interceptor `return data`，拿到即 envelope `{code,message,data}`；范式 `res as unknown as ISuccessResponse<T>`。
- Plus 后端是 AudioDock 共享服务（https://www.audiodock.cn/api），改 DTO 前对照 AudioDock/packages/services/src/plus.ts。

## 会员权益文案维护约定
"4 免 4 会"分布 7 文件 10+ 处（mobile/desktop/server），改文案必须全改，grep 验证 `扫码登录|桌面小组件|优先客服|声仓会员` + `基础功能|云端同步|云端朗读|免广告`。

## hm（apps/hm）—— 纯 ArkTS 重写（P0/P1 完成，编译 0 ERROR）
- 纯 ArkTS + ArkUI 1:1 重写 mobile（不接 RNOH）；bundleName `com.bookdock.app`（AppScope/app.json5，与 mobile2 一致），入口 apps/hm/entry。
- 编译命令：`cd apps/hm && unset NODE_OPTIONS && node hvigorw.js --mode module -p module=entry@default -p product=default assembleDevHqf`

### ArkTS 严格模式硬约束（API 26+）
- **inline 类型注解 / Record<string,T> 类型别名均被拒**（arkts-no-obj-literals-as-types + no-untyped-obj-literals）→ 唯一解：named interface 集中放 model/ApiModels.ets。
- **对象/数组 spread 全禁**（arkts-no-spread）：`{...b, ...data}` → 逐字段 merge + `??` 兜底；`[...arr, x]` → `arr.concat([x])`。
- 对象字面量禁止 as cast：先 `const x: T = {...}` 再用。
- 箭头函数嵌套 async 不允许 → named method 显式 await。
- catch 不能写类型注解：`catch (err)` 后 `(err as object)?.['message']`。
- **build() 和 @Builder 内都禁止 const/let**（需抽成 private 方法调用）；每文件只 1 个 @Entry；禁 `function()` 表达式、any/unknown（开放 DTO 用具体字段 + index signature）。
- class 字段禁 `obj[key]` 索引 → Object.keys/values 平行数组。
- SymbolGlyph 不存在的资源（sparkles/refresh/gear/audio_waveform）→ emoji Text（✨🔄⚙️🎵）。
- Row.alignItems 形参是 VerticalAlign；Uint8Array.buffer 需 cast `as ArrayBuffer`。
- headers 给 SDK 用 `Map<string,string>` + `as object` cast。
- **对象/数组 spread 全禁**（arkts-no-spread）→ 数组用 `arr.concat([x])`，对象逐字段 merge。
- **inline 返回类型注解**（`{ total: number; ... }`）也被拒 → 提 named interface。
- **`@Component` 不能声明 `size` 字段**（撞 CustomComponent 内置属性）→ 用 `iconSize`/`iconColor`。
- **`$r('sys.symbol.xxx')` 必须传字符串字面量**，不能传变量 → 用 if/else 直写每个分支。
- **已验证可用的 sys.symbol**（API 22 真机）：`magnifyingglass` / `person_fill` / `house_fill` / `play_fill`。
- **未验证或缺失的**：`sparkles` / `refresh` / `gear` / `audio_waveform` / `qrcode` / `eye` / `eye_slash` → 走 `components/AppIcon.ets` 的 fallback 文本（不是 emoji）。
- **图标统一收口到 `components/AppIcon.ets`**：上层用 `AppIconKind` 枚举，不直接写 `$r()`。
- **fallback 不用 emoji**（用户明确拒绝）：用几何字符画 `▤ ⊕ ⌒ ⚿ ◉ ◌ ▦ ↑` 代替 📚 🌐 📶 🔒 👁 🙈 ▦ ⬆。
- **ArkUI `Column` 默认 `alignItems(HorizontalAlign.Center)`**：Text label 必须显式 `.width('100%').textAlign(TextAlign.Start)` 才左对齐；外层 Column 兜底 `.alignItems(HorizontalAlign.Start)`。
- **ArkUI `Scroll` 默认 `align: Center`**：横向滚动筛选/卡片行内容少时会整体居中，必须显式 `.align(Alignment.Start)` 才左对齐。**竖向同理**：内容高度不足时整个内容块垂直居中（如 Profile 头像"掉下来"），主内容 Scroll 必须显式 `.align(Alignment.Top)`。
- **设备类型区分**：`import { deviceInfo } from '@kit.BasicServicesKit'`，`deviceInfo.deviceType` 返回 `'phone' / 'tablet' / '2in1' / 'wearable' / 'tv' / 'car'`。平板/2in1 判断：`dt === 'tablet' || dt === '2in1'`。比 mediaquery 横屏监听更可靠。
- **`@State` 不能叫 `margin`**（撞 CustomComponent.margin 内置属性 10505001）→ 改名 `pageMargin`（同 P2 `size`→`iconSize` 教训）。
- **Flex wrap 网格内 `aspectRatio` 不可靠**：RecCard 封面用 `.width('100%').aspectRatio(2/3)` 真机塌缩成字母大小 → 封面尺寸必须写死数值 `.width(getRecItemWidth()).height(getRecItemWidth()*1.5)`，不依赖 aspectRatio 推导高度。
- **响应式网格宽度不能用 onAreaChange 首帧兜底**：`onAreaChange` 首次回调晚于首帧渲染，首帧用默认宽度算错列宽，Flex{wrap} 子项超宽换行后 `width('100%')` 封面会塌缩 → `@State` 宽度必须用 `px2vp(display.getDefaultDisplaySync().width)` 初始化，onAreaChange 只作后续旋转/折叠兜底。
- **`navDestination` 回调必须用 `NavDestination() { ... }` 包裹**：直接返回业务组件会导致 `NavDestinationContent` 渲染空白；`.hideTitleBar(true)` 要放在 `NavDestination` 上而不是 `Navigation` 上。
- **`.width('100%')` 会抵消 `margin({left, right})`**：卡片/搜索条等有左右 margin 的组件不要写 `.width('100%')`，让 margin 生效。

### ArkWeb 与 react-native-webview API 映射（P4 沉淀）
- `javaScriptEnabled` → `.javaScriptAccess(true)`；`domStorageEnabled` → `.domStorageAccess(true)`
- `source={{html}}` → `src: 'data:text/html;charset=utf-8,' + encodeURIComponent(html)`
- `ref.injectJavaScript(js)` → `WebviewController.runJavaScript(js)`
- **`onMessage` 不存在** → 用 `.javaScriptProxy({ object: jsBridge, name: 'readerBridge', methodList: ['postMessage'], controller })`；H5 侧 `window.ReactNativeWebView.postMessage(...)` 全部替换为 `window.readerBridge.postMessage(...)`
- 桥接对象必须是独立 class 持有组件引用，methodList 数组列公开方法名，被调方法必须 public
- **编译命令**（hvigorw 必需 DEVECO_SDK_HOME + unset NODE_OPTIONS；**Bash 工具过滤 `cd`，必须用 `pushd/popd`**）：
  `pushd apps/hm > /dev/null 2>&1; unset NODE_OPTIONS; DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js --mode module -p module=entry@default -p product=default assembleHap; popd > /dev/null 2>&1`
- **hap 产物路径**：`apps/hm/entry/build/default/outputs/default/entry-default-signed.hap`（不在 apps/hm 根目录）

### 模块映射（mobile → hm）
zustand+AsyncStorage → @Observed 单例 + PreferencesStore（subscribe 用 listeners 数组）；netinfo → NetworkKit.connection；RN Alert → promptAction.showDialog/showToast；RN Modal → @Builder + `if (visible)`；axios → NetworkKit.http 封装（envelope 对齐）；横竖屏 mediaquery.matchMediaSync（aboutToDisappear 中 off）。

### 持久化键（utils/PreferencesStore.ets）
AUTH_TOKEN/AUTH_USER/PLus_TOKEN/PLus_USER/PLus_USER_ID/VIP_TIER/VIP_EXPIRES；THEME_MODE/LIBRARY_VIEW/LIBRARY_SORT_BY/LIBRARY_SORT_ORDER/READER_PREFS/TTS_PREFS/READING_PROGRESS/LOCAL_BOOK_PATHS/API_BASE_URL/FIRST_LAUNCH；SERVER_CONFIG/ACTIVE_API_BASE_URL；CRED_PREFIX=`creds_${SOURCE_TYPE}_${apiBaseUrl}`。

### 路由（router/AppRouter.ets）
18 路由常量对齐 mobile RootStackParamList；ROUTE_CONFIG showHeader 对齐 headerShown:false 页面（Reader/TTS*/BookDetails/AuthorDetail/Login/MemberLogin/ScanLogin/Stats/CollectionDetail/Notes）。
AppRoot：ThemeStore.load → AuthStore.load → initApiClient → restoreAuth → 订阅 auth 变化自动 replacePath（Login/MainTab）。
EntryAbility.onCreate：PreferencesStore.init → FileHelper.init → ThemeStore.setSystemDark。
权限：INTERNET + GET_NETWORK_INFO（P1 已加）。
