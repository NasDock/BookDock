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

// 扫码登录协议(对齐 desktop services/plus.ts 与线上 /scan-login/session)
// 旧的 /auth/scan-login 端点已下线,三端必须共用这里的 sessionId + secret 结构。
export interface ScanLoginSourceConfig {
  id: string;
  internal: string;
  external: string;
  name?: string;
}

export interface ScanLoginSourceBundle {
  type: string;
  configs: ScanLoginSourceConfig[];
}

export interface ScanLoginAuthBundle {
  baseUrl: string;
  sourceType: string;
  token: string;
  user: any;
  device?: any;
}

export interface ScanLoginPlusBundle {
  token: string;
  userId: string | number;
}

export interface ScanLoginSession {
  sessionId: string;
  secret: string;
  role: 'scanner' | 'target';
  deviceKind: 'mobile' | 'desktop' | 'harmony';
  expiresAt: number;
}

export interface ScanLoginSessionStatus extends Omit<ScanLoginSession, 'secret'> {
  status: 'waiting_scan' | 'waiting_confirm' | 'confirmed' | 'consumed' | 'success' | 'failed' | 'expired';
  deviceName?: string;
  sourceBundles: ScanLoginSourceBundle[];
  hasNativeAuth: boolean;
  hasPlusAuth: boolean;
}

export interface ScanLoginClaimPayload {
  nativeAuth?: ScanLoginAuthBundle | null;
  plusAuth?: ScanLoginPlusBundle | null;
  sourceBundles: ScanLoginSourceBundle[];
  deviceName?: string;
}

export interface ScanLoginConfirmResult {
  nativeAuth: ScanLoginAuthBundle | null;
  plusAuth: ScanLoginPlusBundle | null;
  sourceBundles: ScanLoginSourceBundle[];
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
// 与 desktop / hm 共用线上 /scan-login/session 协议(sessionId + secret)。
// axios 会包一层 AxiosResponse,这里统一 unwrap 成 envelope,调用方按 res.data 取业务数据。
const unwrap = <T,>(res: { data: ISuccessResponse<T> }): ISuccessResponse<T> => res.data;

export const createScanLoginSession = async (data: {
  role: 'scanner' | 'target';
  deviceKind: 'mobile' | 'desktop' | 'harmony';
}): Promise<ISuccessResponse<ScanLoginSession>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginSession>>('/scan-login/session', data);
  return unwrap(res);
};

export const getScanLoginSession = async (
  sessionId: string,
  secret: string,
): Promise<ISuccessResponse<ScanLoginSessionStatus>> => {
  const res = await plusRequest.get<ISuccessResponse<ScanLoginSessionStatus>>(
    `/scan-login/session/${sessionId}?secret=${encodeURIComponent(secret)}`,
  );
  return unwrap(res);
};

export const claimScanLoginSession = async (
  sessionId: string,
  data: { secret: string; payload: ScanLoginClaimPayload },
): Promise<ISuccessResponse<ScanLoginSessionStatus>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginSessionStatus>>(
    `/scan-login/session/${sessionId}/claim`,
    data,
  );
  return unwrap(res);
};

export const confirmScanLoginSession = async (
  sessionId: string,
  data: { secret: string; selections?: { type: string; configIds: string[] }[] },
): Promise<ISuccessResponse<ScanLoginSessionStatus>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginSessionStatus>>(
    `/scan-login/session/${sessionId}/confirm`,
    data,
  );
  return unwrap(res);
};

export const consumeScanLoginSession = async (
  sessionId: string,
  data: { secret: string; selections?: { type: string; configIds: string[] }[] },
): Promise<ISuccessResponse<ScanLoginConfirmResult>> => {
  const res = await plusRequest.post<ISuccessResponse<ScanLoginConfirmResult>>(
    `/scan-login/session/${sessionId}/consume`,
    data,
  );
  return unwrap(res);
};

export const reportScanLoginResult = async (
  sessionId: string,
  data: { secret: string; success: boolean; error?: string },
): Promise<ISuccessResponse<unknown>> => {
  const res = await plusRequest.post<ISuccessResponse<unknown>>(
    `/scan-login/session/${sessionId}/report`,
    data,
  );
  return unwrap(res);
};

// desktop 走 socket.io;mobile 未引入 socket 客户端,用 HTTP report 等价实现。
export const reportScanLoginResultViaSocket = (
  sessionId: string,
  secret: string,
  success: boolean,
  error?: string,
): Promise<ISuccessResponse<unknown>> => {
  return reportScanLoginResult(sessionId, { secret, success, error });
};

export const subscribeScanLoginSession = (
  sessionId: string,
  secret: string,
  onUpdate: (status: ScanLoginSessionStatus) => void,
): (() => void) => {
  // 轮询实现(与 desktop 的 socket 订阅等价,无需额外原生依赖)
  const interval = setInterval(async () => {
    try {
      const res = await getScanLoginSession(sessionId, secret);
      if (res.data) {
        onUpdate(res.data);
        if (['consumed', 'expired', 'success', 'failed'].includes(res.data.status)) {
          clearInterval(interval);
        }
      }
    } catch {
      // 网络抖动不中断轮询,会话过期后由服务端状态自然收敛
    }
  }, 2000);

  return () => clearInterval(interval);
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