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
