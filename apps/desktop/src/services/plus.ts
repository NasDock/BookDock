/**
 * Plus API Service for BookDock
 * Connects to AudioDock Plus API (https://www.audiodock.cn/api)
 */

import { io, type Socket } from "socket.io-client";

const PLUS_API_BASE_URL = "https://www.audiodock.cn/api";
const PLUS_WS_BASE_URL = "https://www.audiodock.cn/ws";

// --- Types ---

export interface ISuccessResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

export interface SendCodeDto {
  phone: string;
}

export interface LoginDto {
  phone: string;
  code: string;
}

export interface PlusUser {
  id: string;
  phone: string;
  nickname?: string;
  avatar?: string;
  vipTier: string;
  vipExpiresAt?: string;
  createdAt: string;
}

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
  role: "scanner" | "target";
  deviceKind: "mobile" | "desktop";
  expiresAt: number;
}

export interface ScanLoginSessionStatus extends Omit<ScanLoginSession, "secret"> {
  status: "waiting_scan" | "waiting_confirm" | "confirmed" | "consumed" | "success" | "failed" | "expired";
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

// --- Token Management ---

let plusSocket: Socket | null = null;

export const getPlusSocket = (): Socket => {
  if (!plusSocket) {
    plusSocket = io(PLUS_WS_BASE_URL, {
      transports: ["websocket"],
    });
  }
  return plusSocket;
};

export const setPlusToken = (token: string) => {
  localStorage.setItem("bookdock_plus_token", token);
};

export const getPlusToken = (): string | null => {
  return localStorage.getItem("bookdock_plus_token");
};

export const removePlusToken = () => {
  localStorage.removeItem("bookdock_plus_token");
};

// --- API Functions ---

async function plusFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ISuccessResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getPlusToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${PLUS_API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  return data;
}

export const plusSendCode = async (data: SendCodeDto) => {
  return plusFetch("/auth/send-code", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const plusLogin = async (data: LoginDto) => {
  return plusFetch<{ token: string; userId: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const plusGetMe = async (userId: string) => {
  return plusFetch(`/users/me?userId=${encodeURIComponent(userId)}`);
};

export const plusGetVipStatus = async (userId: string) => {
  return plusFetch<{ isVip: boolean; tier: string; expiresAt: string | null }>(`/vip/status?userId=${encodeURIComponent(userId)}`);
};

// --- Scan Login APIs ---

export const createScanLoginSession = async (data: {
  role: "scanner" | "target";
  deviceKind: "mobile" | "desktop";
}) => {
  return plusFetch<ScanLoginSession>("/scan-login/session", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const getScanLoginSession = async (sessionId: string, secret: string) => {
  return plusFetch<ScanLoginSessionStatus>(`/scan-login/session/${sessionId}?secret=${encodeURIComponent(secret)}`);
};

export const claimScanLoginSession = async (
  sessionId: string,
  data: { secret: string; payload: ScanLoginClaimPayload },
) => {
  return plusFetch<ScanLoginSessionStatus>(`/scan-login/session/${sessionId}/claim`, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const confirmScanLoginSession = async (
  sessionId: string,
  data: { secret: string; selections?: { type: string; configIds: string[] }[] },
) => {
  return plusFetch<ScanLoginSessionStatus>(`/scan-login/session/${sessionId}/confirm`, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const consumeScanLoginSession = async (
  sessionId: string,
  data: { secret: string; selections?: { type: string; configIds: string[] }[] },
) => {
  return plusFetch<ScanLoginConfirmResult>(`/scan-login/session/${sessionId}/consume`, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const reportScanLoginResult = async (
  sessionId: string,
  data: { secret: string; success: boolean; error?: string },
) => {
  return plusFetch(`/scan-login/session/${sessionId}/report`, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const subscribeScanLoginSession = (
  sessionId: string,
  secret: string,
  listener: (status: ScanLoginSessionStatus) => void,
) => {
  const socket = getPlusSocket();
  const eventName = `scan_login_session_update:${sessionId}`;
  const reportEventName = "scan_login_report_result";

  const handleUpdate = (payload: {
    sessionId: string;
    secret?: string;
    status: ScanLoginSessionStatus;
  }) => {
    if (payload?.sessionId !== sessionId) return;
    if (payload?.secret && payload.secret !== secret) return;
    listener(payload.status);
  };

  const handleReport = (payload: {
    sessionId: string;
    secret?: string;
    success: boolean;
    error?: string;
  }) => {
    if (payload?.sessionId !== sessionId) return;
    if (payload?.secret && payload.secret !== secret) return;
    listener({ status: payload.success ? "success" : "failed", sessionId } as any);
  };

  socket.on(eventName, handleUpdate);
  socket.on(reportEventName, handleReport);
  socket.emit("scan_login_watch", { sessionId, secret });

  return () => {
    socket.off(eventName, handleUpdate);
    socket.off(reportEventName, handleReport);
  };
};

export const reportScanLoginResultViaSocket = (
  sessionId: string,
  secret: string,
  success: boolean,
  error?: string,
) => {
  const socket = getPlusSocket();
  socket.emit("scan_login_report_result", { sessionId, secret, success, error });
};
