import axios from 'axios';

export const PLUS_API_BASE_URL = 'https://www.audiodock.cn/api';

export const plusRequest = axios.create({
  baseURL: PLUS_API_BASE_URL,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

let plusUnauthorizedHandler: (() => void | Promise<void>) | null = null;
let isHandlingPlusUnauthorized = false;

/**
 * 设置 Plus 服务的验证 Token
 * @param token JWT Token
 */
export const setPlusToken = (token: string) => {
  plusRequest.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

/**
 * 获取 Plus 服务的验证 Token
 */
export const getPlusToken = () => {
  return plusRequest.defaults.headers.common['Authorization'] as string | undefined;
};

/**
 * 移除 Plus 服务的验证 Token
 */
export const removePlusToken = () => {
  delete plusRequest.defaults.headers.common['Authorization'];
};

export const setPlusUnauthorizedHandler = (
  handler: (() => void | Promise<void>) | null,
) => {
  plusUnauthorizedHandler = handler;
};

const hasPlusAuthHeader = (headers: any) => {
  if (!headers) return false;
  const authHeader =
    headers.Authorization ||
    headers.authorization ||
    headers.common?.Authorization ||
    headers.common?.authorization;
  return Boolean(authHeader);
};

const isPlusUnauthorizedPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.code !== 401) return false;
  const message = String(payload.message || '').toLowerCase();
  return message === 'invalid token' || message === 'missing token';
};

const handlePlusUnauthorized = async () => {
  if (isHandlingPlusUnauthorized) return;
  isHandlingPlusUnauthorized = true;

  try {
    removePlusToken();
    await plusUnauthorizedHandler?.();
  } finally {
    setTimeout(() => {
      isHandlingPlusUnauthorized = false;
    }, 0);
  }
};

plusRequest.interceptors.response.use(
  async (response) => {
    // 直接返回响应数据，统一与 fetch API 的行为
    const data = response.data;
    if (
      hasPlusAuthHeader(response.config?.headers) &&
      isPlusUnauthorizedPayload(data)
    ) {
      await handlePlusUnauthorized();
    }
    return data;
  },
  async (error) => {
    const status = error?.response?.status;
    if (
      status === 401 &&
      hasPlusAuthHeader(error?.config?.headers)
    ) {
      await handlePlusUnauthorized();
    }
    return Promise.reject(error);
  },
);

// --- DTO Types ---

export interface SendCodeDto {
  /** Phone number in E.164 format, e.g. +8613812345678 */
  phone: string;
}

export interface LoginDto {
  /** Phone number in E.164 format */
  phone: string;
  /** Verification code */
  code: string;
}

// --- Payment DTO Types ---
// 补回于 2026-08-12：这些类型在 08ce0a6 重写 plus.ts 时被误删，导致
// MemberBenefitsScreen / MemberDetailScreen 引用的 plus* 支付接口全部报
// "is not a function"。后端仍是 AudioDock 共享 Plus 服务
// (https://www.audiodock.cn/api)。

export interface CreatePaymentDto {
  userId: string;
  amount: number;
  method: "WECHAT" | "ALIPAY" | "STRIPE" | "PAYPAL" | "OTHER";
  forVip: boolean;
  forPoints: boolean;
  vipTier?: "BASIC" | "PREMIUM" | "LIFETIME";
  clientType?: "app" | "web" | "desktop";
  couponCode?: string;
}

export interface CreatePaymentResult {
  orderId: string;
  transactionId?: string | null;
  paymentUrl: string;
  qrCode: string;
  wechatPay?: any | null;
  alipayPay?: any | null;
  originalAmount: number;
  finalAmount: number;
  couponDiscount?: any | null;
  raw?: any;
}

export interface PaymentStatusResult {
  orderId: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  paidAt?: string | null;
  amount?: number;
}

export interface PlusCoupon {
  id: string;
  code: string;
  discountPercent: number;
  expiresAt?: string;
}

export interface PlusCouponVerifyResult {
  valid: boolean;
  discountPercent?: number;
  message?: string;
}

export interface VipCurrentLowestPricePlan {
  originalPrice: number;
  discountPercent: number;
  currentPrice: number;
}

/**
 * 后端 /vip/current-lowest-price 返回结构：每个套餐是嵌套的 plan 对象，
 * 不是平铺的数字。Fix 2026-08-12：之前误写成平铺 number，导致前端拿到
 * 后运算 basePrice = [object Object] → finalPrice = NaN → 创建订单失败。
 * 与 AudioDock packages/services/src/plus.ts:189 对齐。
 */
export interface VipCurrentLowestPriceData {
  activityId: string | null;
  name?: string | null;
  description?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  annual: VipCurrentLowestPricePlan | null;
  lifetime: VipCurrentLowestPricePlan | null;
}

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

export type ScanLoginSessionStatus = 'PENDING' | 'CLAIMED' | 'CONFIRMED' | 'CONSUMED' | 'EXPIRED';

export interface ScanLoginClaimPayload {
  deviceName: string;
  deviceType: string;
}

export interface ScanLoginConfirmResult {
  success: boolean;
  token?: string;
  userId?: string;
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
  ok: true;
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

export interface ISuccessResponse<T> {
  code: number;
  message: string;
  data: T;
}

// --- API Functions ---

/**
 * AuthController_sendCode: Send login code to phone
 */
export const plusSendCode = async (data: SendCodeDto) => {
  return plusRequest.post<ISuccessResponse<any>>('/auth/send-code', data);
};

/**
 * AuthController_login: Login with phone and code
 */
export const plusLogin = async (data: LoginDto) => {
  return plusRequest.post<ISuccessResponse<{ token: string; userId: string }>>('/auth/login', data);
};

/**
 * UserController_getMe: Get current user profile
 */
export const plusGetMe = async (userId: string) => {
  return plusRequest.get<ISuccessResponse<any>>('/users/me', { params: { userId } });
};

/**
 * VipController_status: Get VIP status
 */
export const plusGetVipStatus = async (userId: string) => {
  return plusRequest.get<ISuccessResponse<VipStatusResponse>>('/vip/status', { params: { userId } });
};

// --- VIP Payment / Coupon API ---
// 补回于 2026-08-12：见上文 DTO Types 注释。这些接口是 AudioDock 共享 Plus
// 服务提供的；BookDock server 没有 payment 模块。
//
// 注意：上面 plusRequest 的 response interceptor 已经 `return data`
// （unwrapping AxiosResponse），所以这里必须显式 `await` 后取 `.data`，
// 否则会被 axios 类型欺骗返回 AxiosResponse。返回类型直接写 envelope 内层
// 类型，调用方按 `{code, message, data: T}` 使用（与本文件 sendCode / login
// 等保持一致）。

/**
 * 创建会员 / 积分 支付订单
 * 后端: POST /payment/create
 */
export const plusCreateVipPayment = async (data: CreatePaymentDto): Promise<ISuccessResponse<CreatePaymentResult>> => {
  const res = await plusRequest.post('/payment/create', data);
  // res 已经是 envelope（plusRequest.interceptors.response 已 unwrap AxiosResponse.data），
  // 不能再多取一层 .data — 那是 envelope 内层的 data 字段，会让 priceRes.code 这种直接读到 undefined。
  return res as unknown as ISuccessResponse<CreatePaymentResult>;
};

/**
 * 查询订单状态（轮询支付回调落地）
 * 后端: GET /payment/status?orderId=xxx
 */
export const plusQueryPaymentStatus = async (orderId: string): Promise<ISuccessResponse<PaymentStatusResult>> => {
  const res = await plusRequest.get('/payment/status', { params: { orderId } });
  return res as unknown as ISuccessResponse<PaymentStatusResult>;
};

/**
 * 取消未支付订单
 * 后端: POST /payment/cancel
 */
export const plusCancelOrder = async (orderId: string): Promise<ISuccessResponse<any>> => {
  const res = await plusRequest.post('/payment/cancel', { orderId });
  return res as unknown as ISuccessResponse<any>;
};

/**
 * 获取当前会员最低价（活动价 / 限时优惠）
 * 后端: GET /vip/current-lowest-price
 */
export const plusGetCurrentLowestPrice = async (): Promise<ISuccessResponse<VipCurrentLowestPriceData>> => {
  const res = await plusRequest.get('/vip/current-lowest-price');
  return res as unknown as ISuccessResponse<VipCurrentLowestPriceData>;
};

/**
 * 获取当前用户的可用优惠券
 * 后端: GET /coupons/mine
 */
export const plusGetMyCoupons = async (): Promise<ISuccessResponse<PlusCoupon[]>> => {
  const res = await plusRequest.get('/coupons/mine');
  return res as unknown as ISuccessResponse<PlusCoupon[]>;
};

/**
 * 验证优惠码是否对当前用户有效
 * 后端: POST /coupons/verify
 */
export const plusVerifyCoupon = async (code: string, userId: string): Promise<ISuccessResponse<PlusCouponVerifyResult>> => {
  const res = await plusRequest.post('/coupons/verify', { code, userId });
  return res as unknown as ISuccessResponse<PlusCouponVerifyResult>;
};

// --- Scan Login API ---

export const createScanLoginSession = async () => {
  return plusRequest.post<ISuccessResponse<ScanLoginSession>>('/auth/scan-login');
};

export const getScanLoginSession = async (sessionId: string) => {
  return plusRequest.get<ISuccessResponse<ScanLoginSession>>(`/auth/scan-login/${sessionId}`);
};

export const claimScanLoginSession = async (sessionId: string, payload: ScanLoginClaimPayload) => {
  return plusRequest.post<ISuccessResponse<ScanLoginSession>>(`/auth/scan-login/${sessionId}/claim`, payload);
};

export const confirmScanLoginSession = async (sessionId: string) => {
  return plusRequest.post<ISuccessResponse<ScanLoginConfirmResult>>(`/auth/scan-login/${sessionId}/confirm`);
};

export const consumeScanLoginSession = async (sessionId: string) => {
  return plusRequest.post<ISuccessResponse<ScanLoginSession>>(`/auth/scan-login/${sessionId}/consume`);
};

export const reportScanLoginResult = async (sessionId: string, result: { success: boolean; token?: string; userId?: string }) => {
  return plusRequest.post<ISuccessResponse<any>>(`/auth/scan-login/${sessionId}/result`, result);
};

export const subscribeScanLoginSession = (sessionId: string, onUpdate: (session: ScanLoginSession) => void) => {
  // 轮询实现
  const interval = setInterval(async () => {
    try {
      const res = await getScanLoginSession(sessionId);
      if (res.data?.data) {
        onUpdate(res.data.data);
        if (['CONSUMED', 'EXPIRED'].includes(res.data.data.status)) {
          clearInterval(interval);
        }
      }
    } catch {
      clearInterval(interval);
    }
  }, 2000);

  return () => clearInterval(interval);
};

export const reportScanLoginResultViaSocket = async (sessionId: string, result: { success: boolean; token?: string; userId?: string }) => {
  return plusRequest.post<ISuccessResponse<any>>(`/auth/scan-login/${sessionId}/result`, result);
};

/**
 * 参与内测 - 直接获取内测资格
 */
export const participateInternalTest = async (
  data: ParticipateInternalTestDto,
) => {
  return plusRequest.post<ISuccessResponse<ParticipateInternalTestResponse>>(
    '/users/internal-test-codes/participate',
    data,
  );
};

/**
 * 删除当前会员账户
 */
export const deletePlusMe = async () => {
  return plusRequest.delete<ISuccessResponse<DeletePlusMeResponse>>('/users/me');
};