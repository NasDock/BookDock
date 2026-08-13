# BookDock 项目长期约定

## Plus 服务层（apps/mobile/src/services/plus.ts）

### 致命坑：plusRequest 已经是 envelope，别再加 `.data`

`apps/mobile/src/services/plus.ts` 里的 `plusRequest` 是 axios instance，但加了
response interceptor `return data`，意思是 `await plusRequest.get/post(...)` 拿到的
**就是** envelope `{code, message, data: <inner>}`，不是 `AxiosResponse`。

任何 `plus*` 请求函数封装必须**直接返回 res**，不能 `return res.data as ...`。
参考 AudioDock `packages/services/src/plus.ts` 的范式：`return plusRequest.get(...)` 不再 unwrap。

```ts
// ✅ 正确（与 AudioDock 一致）
export const plusFoo = async () => {
  const res = await plusRequest.get('/foo');
  return res as unknown as ISuccessResponse<FooData>;
};

// ❌ 错（多 unwrap 一次，把 inner 当 envelope 返回，调用方读 .code 是 undefined）
export const plusFoo = async () => {
  const res = await plusRequest.get('/foo');
  return res.data as ISuccessResponse<FooData>;
};
```

二段 cast（`as unknown as ...`）是必须的，因为 axios 静态类型 `AxiosResponse<any>`
与 `ISuccessResponse<T>` 形状不重叠，TS 拒绝直接 as。

### Plus 后端是共享的

BookDock mobile 的 Plus 接口（`/payment/create`、`/vip/current-lowest-price`、
`/coupons/mine` 等）跑在 AudioDock 共享 Plus 服务上（`https://www.audiodock.cn/api`），
BookDock server 里**没有 payment 模块**。改 DTO / 加新接口前，**先读**
`AudioDock/packages/services/src/plus.ts` 对照字段形状（特别是嵌套 vs 平铺）。

调试联调：`curl https://www.audiodock.cn/api/vip/current-lowest-price` 不带 token
就能拿到 200 + 完整 envelope，是最快的 sanity check。

## Silent fallback bug

`MemberBenefitsScreen` 等页面用 `STATIC_PRODUCTS[].fallbackPrice` 做兜底。当 backend
失败被 `catch {}` 吞掉时，UI 静默显示兜底值，看起来像「请求没发出去」。排查这类问题
最快的方法是**直接 render `JSON.stringify(rawResponse, null, 2)` 到页面上**，看 envelope
是否完整（`code/message/data` 三层都要在）。如果只有 inner data，说明上层有错位 unwrap。

## 工作流提醒（来自用户偏好）

- **代码先于 UI**：需求涉及「接口 + 组件」时，第一步永远在 service 层加类型 / API，
  确认接口落点正确，再做 UI。绝不能先画 UI 设计稿。
- 接到需求如果不确定先后，先用一句话确认优先级。

## SafeAreaView + React Navigation native-stack：header 下面避免重复顶部 inset

凡是用了 React Navigation `Stack.Screen` 默认 header（`headerShown: true`，包括
title/back 自动渲染）的页面，**`<SafeAreaView>` 必须 `edges={['left', 'right']}`**
（或干脆换成 `<View>`），**不能用默认 edges**。

原因：App.tsx 的 `SafeAreaProvider` 没传 `initialMetrics`，默认从 native module 拿
设备级 insets（status bar 高度）；React Navigation native-stack 的 Screen frame 已经
从 header bottom 开始（header 自带 status bar），但 SafeAreaProvider 不知道 Screen
frame，会把设备级 top inset 加到 Screen 内部 → header 下面多 ≈ 44px 空白。

判定：
- `headerShown: false`（自绘 header）→ SafeAreaView 用默认 edges 是对的
  （参考 `SearchScreen.tsx:165`）。
- `headerShown: true`（用 RN header）→ SafeAreaView 必须 `edges={['left', 'right']}`，
  顶交给 RN header，底交给 scrollContent 的 `paddingBottom`（≥ 40 覆盖 home indicator）。

BookDock mobile 已确认有此问题的页面（4 个有 RN header 的）：
- `SettingsScreen` / `MemberDetailScreen` / `AdminUsersScreen` / `MemberBenefitsScreen`
- 第一个元素是大色卡（MemberDetail 紫卡 / Settings 列表第一行）的不明显；
  第一个元素是浅色卡片（MemberBenefits 对比表）就会被用户感知成"很大一块空白"。
- 修复状态：✅ `MemberBenefitsScreen`（2026-08-13）✅ `MemberDetailScreen`（2026-08-13）。
  待修：`SettingsScreen` / `AdminUsersScreen`（等用户报修再改）。

## 会员权益文案的维护约定（**重要**）

会员权益文案分布在 **7 个文件、10+ 处**，是**强一致性**内容（"4 免 4 会"）：

| 位置 | 角色 |
|---|---|
| `apps/mobile/src/screens/MemberBenefitsScreen.tsx` | mobile 对比表（**唯一** mobile 端"免费 + 会员"两列对比）+ STATIC_PRODUCTS features (dead field, 但保持一致) |
| `apps/mobile/src/screens/MemberDetailScreen.tsx` | mobile 会员详情特权 grid（emoji 前缀） |
| `apps/desktop/src/pages/MemberBenefits.tsx` | web 购买页 banner + 套餐 features (active) |
| `apps/desktop/src/pages/MemberDetail.tsx` | web 会员详情特权 grid |
| `apps/desktop/src/pages/Membership.tsx` | web **另一个** 购买页（3 档方案：免费版+年卡+永久卡），含免费版 features |
| `apps/desktop/src/components/NoVipBlock.tsx` | web VIP 拦截弹窗（次级弹窗里的权益列表） |
| `apps/server/src/modules/vip/vip.service.ts` | server `GET /vip/products` 返回值 |
| `apps/server/src/modules/vip/dto/vip.dto.ts` | swagger `@ApiProperty` example |

修改权益文案**必须全改**：grep 验证 `扫码登录|桌面小组件|优先客服|声仓会员` 和 `基础功能|云端同步|云端朗读|免广告` 各处都命中。

图标约定（web 端 lucide-react）：
- 扫码登录 → `QrCode`
- 桌面小组件 → `Layout`
- 优先客服 → `MessageCircle`
- 声仓会员 → `Headphones`

Mobile 端 emoji 前缀：📷 🪟 💬 🎧

**不要加"全部年卡特权"前缀**：永久卡 features 直接 4 条平铺（mobile 端 2 列 grid 加 5 条会换行不平衡）。
