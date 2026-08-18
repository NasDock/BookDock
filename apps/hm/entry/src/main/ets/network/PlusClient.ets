// [API 23+] network/PlusClient.ets — 1:1 对齐 mobile src/services/plus.ts
// Plus 服务是 AudioDock 共享的会员/扫码服务(https://www.audiodock.cn/api),
// BookDock server 没有 payment 模块。
// envelope { code, message, data },对齐 mobile 的 `res as unknown as ISuccessResponse<T>` 模式。
import { http } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0006;
const TAG = 'PlusClient';

export const PLUS_API_BASE_URL = 'https://www.audiodock.cn/api';

// ─── Envelope & DTO ────────────────────────────────────────────

export interface ISuccessResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface SendCodeDto {
  phone: string;
}

export interface LoginDto {
  phone: string;
  code: string;
}

export type PaymentMethod = 'WECHAT' | 'ALIPAY' | 'STRIPE' | 'PAYPAL' | 'OTHER';

export interface CreatePaymentDto {
  userId: string;
  amount: number;
  method: PaymentMethod;
  forVip: boolean;
  forPoints: boolean;
}

export interface CreatePaymentResult {
  orderId: string;
  amount: number;
  payUrl?: string;
  qrCodeUrl?: string;
  status: string;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED';

export interface PaymentStatusResult {
  orderId: string;
  status: PaymentStatus;
  paidAt?: string;
}

export interface VipCurrentLowestPricePlan {
  planId: string;
  name: string;
  price: number;
  originalPrice?: number;
  durationDays?: number;
  badge?: string;
}

export interface VipCurrentLowestPriceData {
  activityId: string | null;
  name?: string | null;
  description?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  annual: VipCurrentLowestPricePlan | null;
  lifetime: VipCurrentLowestPricePlan | null;
}

export interface PlusCoupon {
  id: string;
  code: string;
  name: string;
  amount: number;
  expiresAt?: string | null;
  used: boolean;
}

export interface PlusCouponVerifyResult {
  valid: boolean;
  coupon?: PlusCoupon;
  reason?: string;
}

export type ScanLoginSessionStatus = 'PENDING' | 'CLAIMED' | 'CONFIRMED' | 'CONSUMED' | 'EXPIRED';

export interface ScanLoginSession {
  id: string;
  status: ScanLoginSessionStatus;
  clientId: string;
  createdAt: string;
  expiresAt: string;
  claimedAt?: string;
  confirmedAt?: string;
  consumedAt?: string;
  userId?: string;
  token?: string;
}

export interface PlusAuthRef {
  token: string;
  userId: string | number;
}

export interface ScanLoginClaimPayload {
  deviceName: string;
  deviceType: string;
  nativeAuth?: object;
  plusAuth?: PlusAuthRef;
  sourceBundles?: string[];
}

export interface ScanLoginConfirmResult {
  success: boolean;
  token?: string;
  userId?: string;
  plusAuth?: PlusAuthRef;
}

export interface VipStatusResponse {
  isVip: boolean;
  tier: string;
  expiresAt: string | null;
}

export interface ParticipateInternalTestDto {
  vipStartsAt: string;
  vipEndsAt: string;
}

export interface ParticipateInternalTestResponse {
  ok: boolean;
  id: string;
  batchId: string;
  code: string;
  vipTier: string;
  vipStartsAt: string;
  vipEndsAt: string;
  usedAt: string | null;
  usedByUserId: string | null;
  createdAt: string;
}

export interface DeletePlusMeResponse {
  ok: boolean;
  userId: string;
  deletedAt: string;
}

export interface ReportScanLoginResultDto {
  success: boolean;
  token?: string;
  userId?: string;
  error?: string;
}

export interface PlusLoginResponse {
  token: string;
  userId: string;
}

export interface PlusPayloadMeta {
  code: number;
  message: string;
}

export interface PlusOrderCancelDto {
  orderId: string;
}

export interface PlusCouponVerifyDto {
  code: string;
  userId: string;
}

export interface PlusUserIdQuery {
  userId: string;
}

export interface PlusOrderIdQuery {
  orderId: string;
}

// ─── Query / HTTP 公共类型 ──────────────────────────────────────

// Plus 端请求 query 用 object(ArkTS 严格模式禁止 ESObject 作为类型)
export type PlusQueryValueMap = object;

export interface PlusRequestOptions {
  method?: http.RequestMethod;
  path: string;
  body?: object | string;
  query?: PlusQueryValueMap;
  expectDataType?: http.HttpDataType;
  timeoutMs?: number;
}

// ─── Token & Unauthorized Handler ───────────────────────────────

let plusAuthToken: string | null = null;
let plusUnauthorizedHandler: (() => void | Promise<void>) | null = null;
let isHandlingPlusUnauthorized = false;

export function setPlusToken(token: string): void {
  plusAuthToken = token;
}

export function getPlusToken(): string | null {
  return plusAuthToken;
}

export function removePlusToken(): void {
  plusAuthToken = null;
}

export function setPlusUnauthorizedHandler(handler: (() => void | Promise<void>) | null): void {
  plusUnauthorizedHandler = handler;
}

function hasPlusAuthHeader(headers: object): boolean {
  if (!headers) {
    return false;
  }
  // headers 实际是 Record<string, string>,ArkTS 严格模式不允许 obj['key'] 索引访问,
  // 这里用 Object.keys 遍历检测 Authorization(大小写)键存在与否
  const keys: string[] = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    const k: string = keys[i];
    if (k === 'Authorization' || k === 'authorization') {
      return true;
    }
  }
  return false;
}

function payloadHasCode(payload: object): PlusPayloadMeta | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const obj = payload as PlusPayloadMeta;
  if (typeof obj.code !== 'number' || typeof obj.message !== 'string') {
    return null;
  }
  const meta: PlusPayloadMeta = { code: obj.code, message: obj.message };
  return meta;
}

function isPlusUnauthorizedPayload(payload: object | string | undefined): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const info = payloadHasCode(payload);
  if (!info) {
    return false;
  }
  if (info.code !== 401) {
    return false;
  }
  const lower: string = info.message.toLowerCase();
  return lower === 'invalid token' || lower === 'missing token';
}

async function handlePlusUnauthorized(): Promise<void> {
  if (isHandlingPlusUnauthorized) {
    return;
  }
  isHandlingPlusUnauthorized = true;
  try {
    removePlusToken();
    const cb = plusUnauthorizedHandler;
    if (cb) {
      await cb();
    }
  } finally {
    setTimeout(() => {
      isHandlingPlusUnauthorized = false;
    }, 0);
  }
}

// ─── HTTP Client ──────────────────────────────────────────────

async function plusRequest<T>(opts: PlusRequestOptions): Promise<ISuccessResponse<T>> {
  let qs = '';
  if (opts.query) {
    const input: PlusQueryValueMap = opts.query;
    const qKeys: string[] = Object.keys(input);
    const qValues: object[] = Object.values(input);
    const parts: string[] = [];
    for (let i = 0; i < qKeys.length; i++) {
      const k: string = qKeys[i];
      const v: object = qValues[i];
      if (v === undefined || v === null) {
        continue;
      }
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    qs = parts.length > 0 ? `?${parts.join('&')}` : '';
  }
  const url = `${PLUS_API_BASE_URL}${opts.path}${qs}`;

  // headers 用 Map 构造,最终传给 SDK 时 cast 成 object(SDK 接受 ESObject)
  const headers: Map<string, string> = new Map();
  headers.set('Accept', 'application/json');
  if (opts.body !== undefined && opts.body !== null) {
    headers.set('Content-Type', 'application/json');
  }
  if (plusAuthToken) {
    headers.set('Authorization', `Bearer ${plusAuthToken}`);
  }

  let bodyText: string | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    bodyText = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  const req = http.createHttp();
  const requestOptions: http.HttpRequestOptions = {
    method: opts.method ?? (bodyText !== undefined ? http.RequestMethod.POST : http.RequestMethod.GET),
    header: headers as object,
    extraData: bodyText,
    connectTimeout: opts.timeoutMs ?? 15000,
    readTimeout: opts.timeoutMs ?? 15000,
    expectDataType: opts.expectDataType ?? http.HttpDataType.STRING,
  };
  let resp: http.HttpResponse;
  try {
    resp = await req.request(url, requestOptions);
  } catch (err) {
    req.destroy();
    hilog.warn(DOMAIN, TAG, 'request %{public}s fail %{public}s', opts.path, JSON.stringify(err));
    throw new Error(`Plus request fail: ${opts.path}`);
  }
  req.destroy();

  const responseHeaders: Record<string, string> = {};
  if (resp.header) {
    const headerObj: object = resp.header as object;
    const hKeys: string[] = Object.keys(headerObj);
    const hValues: object[] = Object.values(headerObj);
    for (let i = 0; i < hKeys.length; i++) {
      const k: string = hKeys[i];
      const v: object = hValues[i];
      responseHeaders[k] = String(v);
    }
  }

  let payload: object | string | undefined;
  if (typeof resp.result === 'string') {
    try {
      payload = JSON.parse(resp.result);
    } catch {
      payload = resp.result;
    }
  } else if (resp.result !== undefined && resp.result !== null) {
    payload = resp.result as object;
  }

  // 拦截 401
  if (resp.responseCode === 401 && hasPlusAuthHeader(headers)) {
    await handlePlusUnauthorized();
  }
  if (hasPlusAuthHeader(headers) && isPlusUnauthorizedPayload(payload)) {
    await handlePlusUnauthorized();
  }

  if (resp.responseCode < 200 || resp.responseCode >= 300) {
    throw new Error(`Plus HTTP ${resp.responseCode}`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Plus invalid payload');
  }
  return payload as ISuccessResponse<T>;
}

// ─── Auth API ─────────────────────────────────────────────────

export function plusSendCode(data: SendCodeDto): Promise<ISuccessResponse<object>> {
  return plusRequest<object>({ method: http.RequestMethod.POST, path: '/auth/send-code', body: data });
}

export function plusLogin(data: LoginDto): Promise<ISuccessResponse<PlusLoginResponse>> {
  return plusRequest<PlusLoginResponse>({
    method: http.RequestMethod.POST,
    path: '/auth/login',
    body: data,
  });
}

export function plusGetMe(userId: string): Promise<ISuccessResponse<object>> {
  const q: PlusUserIdQuery = { userId: userId };
  return plusRequest<object>({ method: http.RequestMethod.GET, path: '/users/me', query: q });
}

export function plusGetVipStatus(userId: string): Promise<ISuccessResponse<VipStatusResponse>> {
  const q: PlusUserIdQuery = { userId: userId };
  return plusRequest<VipStatusResponse>({
    method: http.RequestMethod.GET,
    path: '/vip/status',
    query: q,
  });
}

// ─── Payment API ──────────────────────────────────────────────

export function plusCreateVipPayment(data: CreatePaymentDto): Promise<ISuccessResponse<CreatePaymentResult>> {
  return plusRequest<CreatePaymentResult>({ method: http.RequestMethod.POST, path: '/payment/create', body: data });
}

export function plusQueryPaymentStatus(orderId: string): Promise<ISuccessResponse<PaymentStatusResult>> {
  const q: PlusOrderIdQuery = { orderId: orderId };
  return plusRequest<PaymentStatusResult>({ method: http.RequestMethod.GET, path: '/payment/status', query: q });
}

export function plusCancelOrder(orderId: string): Promise<ISuccessResponse<object>> {
  const payload: PlusOrderCancelDto = { orderId: orderId };
  return plusRequest<object>({ method: http.RequestMethod.POST, path: '/payment/cancel', body: payload });
}

export function plusGetCurrentLowestPrice(): Promise<ISuccessResponse<VipCurrentLowestPriceData>> {
  return plusRequest<VipCurrentLowestPriceData>({ method: http.RequestMethod.GET, path: '/vip/current-lowest-price' });
}

export function plusGetMyCoupons(): Promise<ISuccessResponse<PlusCoupon[]>> {
  return plusRequest<PlusCoupon[]>({ method: http.RequestMethod.GET, path: '/coupons/mine' });
}

export function plusVerifyCoupon(code: string, userId: string): Promise<ISuccessResponse<PlusCouponVerifyResult>> {
  const payload: PlusCouponVerifyDto = { code: code, userId: userId };
  return plusRequest<PlusCouponVerifyResult>({
    method: http.RequestMethod.POST,
    path: '/coupons/verify',
    body: payload,
  });
}

// ─── Scan Login API ───────────────────────────────────────────

export function createScanLoginSession(): Promise<ISuccessResponse<ScanLoginSession>> {
  return plusRequest<ScanLoginSession>({ method: http.RequestMethod.POST, path: '/auth/scan-login' });
}

export function getScanLoginSession(sessionId: string): Promise<ISuccessResponse<ScanLoginSession>> {
  return plusRequest<ScanLoginSession>({ method: http.RequestMethod.GET, path: `/auth/scan-login/${sessionId}` });
}

export function claimScanLoginSession(sessionId: string, payload: ScanLoginClaimPayload): Promise<ISuccessResponse<ScanLoginSession>> {
  return plusRequest<ScanLoginSession>({
    method: http.RequestMethod.POST,
    path: `/auth/scan-login/${sessionId}/claim`,
    body: payload,
  });
}

export function confirmScanLoginSession(sessionId: string): Promise<ISuccessResponse<ScanLoginConfirmResult>> {
  return plusRequest<ScanLoginConfirmResult>({
    method: http.RequestMethod.POST,
    path: `/auth/scan-login/${sessionId}/confirm`,
  });
}

export function consumeScanLoginSession(sessionId: string): Promise<ISuccessResponse<ScanLoginSession>> {
  return plusRequest<ScanLoginSession>({
    method: http.RequestMethod.POST,
    path: `/auth/scan-login/${sessionId}/consume`,
  });
}

export function reportScanLoginResult(sessionId: string, result: ReportScanLoginResultDto): Promise<ISuccessResponse<object>> {
  return plusRequest<object>({
    method: http.RequestMethod.POST,
    path: `/auth/scan-login/${sessionId}/result`,
    body: result,
  });
}

export const reportScanLoginResultViaSocket = reportScanLoginResult;

export function subscribeScanLoginSession(sessionId: string, onUpdate: (session: ScanLoginSession) => void): () => void {
  let cancelled = false;
  const interval = setInterval(async () => {
    if (cancelled) {
      return;
    }
    try {
      const res = await getScanLoginSession(sessionId);
      if (cancelled) {
        return;
      }
      if (res && res.data) {
        onUpdate(res.data);
        if (res.data.status === 'CONSUMED' || res.data.status === 'EXPIRED') {
          clearInterval(interval);
        }
      }
    } catch {
      clearInterval(interval);
    }
  }, 2000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

// ─── Misc ─────────────────────────────────────────────────────

export function participateInternalTest(data: ParticipateInternalTestDto): Promise<ISuccessResponse<ParticipateInternalTestResponse>> {
  return plusRequest<ParticipateInternalTestResponse>({
    method: http.RequestMethod.POST,
    path: '/users/internal-test-codes/participate',
    body: data,
  });
}

export function deletePlusMe(): Promise<ISuccessResponse<DeletePlusMeResponse>> {
  return plusRequest<DeletePlusMeResponse>({ method: http.RequestMethod.DELETE, path: '/users/me' });
}