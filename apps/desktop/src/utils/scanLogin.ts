/**
 * Desktop Scan Login Utilities for BookDock
 * Simplified version - BookDock only needs Plus auth sync
 */

/** 三端统一的二维码内容:扫码端按 kind / sessionId / secret / role 解析 */
export const SCAN_LOGIN_QR_KIND = "bookdock-scan-login";

export function buildScanLoginQrValue(
  session: { sessionId: string; secret: string },
  deviceKind: string,
): string {
  return JSON.stringify({
    kind: SCAN_LOGIN_QR_KIND,
    version: 1,
    sessionId: session.sessionId,
    secret: session.secret,
    role: "target",
    deviceKind,
  });
}


import type { ScanLoginClaimPayload, ScanLoginConfirmResult } from "../services/plus";

export async function collectDesktopScanLoginPayload(): Promise<ScanLoginClaimPayload> {
  const plusToken = localStorage.getItem("bookdock_plus_token");
  const plusUserId = localStorage.getItem("bookdock_plus_user_id");

  let deviceName = window.navigator.userAgent;
  try {
    if ((window as any).ipcRenderer?.getName) {
      deviceName = await (window as any).ipcRenderer.getName();
    }
  } catch (error) {
    console.error("Failed to resolve desktop device name", error);
  }

  return {
    deviceName,
    nativeAuth: null,
    plusAuth:
      plusToken && plusUserId
        ? {
            token: plusToken,
            userId: JSON.parse(plusUserId),
          }
        : null,
    sourceBundles: [],
  };
}

export async function applyDesktopScanLoginResult(result: ScanLoginConfirmResult) {
  if (result.plusAuth) {
    localStorage.setItem("bookdock_plus_token", result.plusAuth.token);
    localStorage.setItem("bookdock_plus_user_id", JSON.stringify(result.plusAuth.userId));
  }
}
