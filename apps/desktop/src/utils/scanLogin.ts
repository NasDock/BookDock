/**
 * Desktop Scan Login Utilities for BookDock
 * Simplified version - BookDock only needs Plus auth sync
 */

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
