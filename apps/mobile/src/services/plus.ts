import axios from 'axios';

export const PLUS_API_BASE_URL = 'https://www.audiodock.cn/api';

export const plusRequest = axios.create({
  baseURL: PLUS_API_BASE_URL,
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