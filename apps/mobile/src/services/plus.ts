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
    // 直接返回响应数据,统一与 fetch API 的行为
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
// 这些接口由 AudioDock 共享 Plus 服务提供;BookDock server 没有 payment 模块。
// 与 AudioDock packages/services/src/plus.ts 保持一致。

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
 * 后端 /vip/current-lowest-price 返回结构:每个套餐是嵌套的 plan 对象,
 * 不是平铺的数字。
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
  /** 兼容 mobile 版本 */
  nativeAuth?: any | null;
  /** 兼容 mobile 版本 */
  plusAuth?: { token: string; userId: string | number } | null;
  /** 兼容 mobile 版本 */
  sourceBundles?: any[];
}

export interface ScanLoginConfirmResult {
  success: boolean;
  token?: string;
  userId?: string;
  /** 兼容 mobile 版本 */
  plusAuth?: { token: string; userId: string | number };
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
export const plusSendCode = async (data: SendCodeDto): Promise<ISuccessResponse<any>> => {
  const res = await plusRequest.post<ISuccessResponse<any>>('/auth/send-code', data);
  return res as unknown as ISuccessResponse<any>;
};

/**
 * AuthController_login: Login with phone and code
 */
export const plusLogin = async (data: LoginDto): Promise<ISuccessResponse<{ token: string; userId: string }>> => {
  const res = await plusRequest.post<ISuccessResponse<{ token: string; userId: string }>>('/auth/login', data);
  return res as unknown as ISuccessResponse<{ token: string; userId: string }>;
};

/**
 * UserController_getMe: Get current user profile
 */
export const plusGetMe = async (userId: string): Promise<ISuccessResponse<any>> => {
  const res = await plusRequest.get<ISuccessResponse<any>>('/users/me', { params: { userId } });
  return res as unknown as ISuccessResponse<any>;
};

/**
 * VipController_status: Get VIP status
 */
export const plusGetVipStatus = async (userId: string): Promise<ISuccessResponse<VipStatusResponse>> => {
  const res = await plusRequest.get<ISuccessResponse<VipStatusResponse>>('/vip/status', { params: { userId } });
  return res as unknown as ISuccessResponse<VipStatusResponse>;
};

// --- VIP Payment / Coupon API ---
// 注意:上面 plusRequest 的 response interceptor 已经 `return data`
// (unwrapping AxiosResponse),所以这里必须显式 `await` 后取 `.data`,
// 否则会被 axios 类型欺骗返回 AxiosResponse。
// 正确做法:直接返回 res(已经是 envelope),让调用方按 `{code, message, data: T}` 使用。

/**
 * 创建会员 / 积分 支付订单
 * 后端: POST /payment/create
 */
export const plusCreateVipPayment = async (data: CreatePaymentDto): Promise<ISuccessResponse<CreatePaymentResult>> => {
  const res = await plusRequest.post('/payment/create', data);
  return res as unknown as ISuccessResponse<CreatePaymentResult>;
};

/**
 * 查询订单状态(轮询支付回调落地)
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
 * 获取当前会员最低价(活动价 / 限时优惠)
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

export const createScanLoginSession = async (): Promise<ISuccessResponse<ScanLoginSession>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginSession>>('/auth/scan-login');
  return res as unknown as ISuccessResponse<ScanLoginSession>;
};

export const getScanLoginSession = async (sessionId: string): Promise<ISuccessResponse<ScanLoginSession>> => {
  const res = await plusRequest.get<ISuccessResponse<ScanLoginSession>>(`/auth/scan-login/${sessionId}`);
  return res as unknown as ISuccessResponse<ScanLoginSession>;
};

export const claimScanLoginSession = async (sessionId: string, payload: ScanLoginClaimPayload): Promise<ISuccessResponse<ScanLoginSession>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginSession>>(`/auth/scan-login/${sessionId}/claim`, payload);
  return res as unknown as ISuccessResponse<ScanLoginSession>;
};

export const confirmScanLoginSession = async (sessionId: string): Promise<ISuccessResponse<ScanLoginConfirmResult>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginConfirmResult>>(`/auth/scan-login/${sessionId}/confirm`);
  return res as unknown as ISuccessResponse<ScanLoginConfirmResult>;
};

export const consumeScanLoginSession = async (sessionId: string): Promise<ISuccessResponse<ScanLoginSession>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginSession>>(`/auth/scan-login/${sessionId}/consume`);
  return res as unknown as ISuccessResponse<ScanLoginSession>;
};

export const reportScanLoginResult = async (sessionId: string, result: { success: boolean; token?: string; userId?: string; error?: string }): Promise<ISuccessResponse<any>> => {
  const res = await plusRequest.post<ISuccessResponse<any>>(`/auth/scan-login/${sessionId}/result`, result);
  return res as unknown as ISuccessResponse<any>;
};

export const subscribeScanLoginSession = (sessionId: string, onUpdate: (session: ScanLoginSession) => void) => {
  // 轮询实现
  const interval = setInterval(async () => {
    try {
      const res = await getScanLoginSession(sessionId);
      if (res.data) {
        onUpdate(res.data);
        if (['CONSUMED', 'EXPIRED'].includes(res.data.status)) {
          clearInterval(interval);
        }
      }
    } catch {
      clearInterval(interval);
    }
  }, 2000);

  return () => clearInterval(interval);
};

export const reportScanLoginResultViaSocket = async (sessionId: string, result: { success: boolean; token?: string; userId?: string; error?: string }): Promise<ISuccessResponse<any>> => {
  const res = await plusRequest.post<ISuccessResponse<any>>(`/auth/scan-login/${sessionId}/result`, result);
  return res as unknown as ISuccessResponse<any>;
};

/**
 * 参与内测 - 直接获取内测资格
 */
export const participateInternalTest = async (
  data: ParticipateInternalTestDto,
): Promise<ISuccessResponse<ParticipateInternalTestResponse>> => {
  const res = await plusRequest.post<ISuccessResponse<ParticipateInternalTestResponse>>(
    '/users/internal-test-codes/participate',
    data,
  );
  return res as unknown as ISuccessResponse<ParticipateInternalTestResponse>;
};

/**
 * 删除当前会员账户
 */
export const deletePlusMe = async (): Promise<ISuccessResponse<DeletePlusMeResponse>> => {
  const res = await plusRequest.delete<ISuccessResponse<DeletePlusMeResponse>>('/users/me');
  return res as unknown as ISuccessResponse<DeletePlusMeResponse>;
};