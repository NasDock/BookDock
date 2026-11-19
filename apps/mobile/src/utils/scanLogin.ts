/**
 * Mobile Scan Login Utilities for BookDock
 * Simplified version - BookDock only needs Plus auth sync
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

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

export async function collectMobileScanLoginPayload(): Promise<ScanLoginClaimPayload> {
  const plusToken = await AsyncStorage.getItem("bookdock_plus_token");
  const plusUserId = await AsyncStorage.getItem("bookdock_plus_user_id");

  return {
    deviceName: "Mobile Device",
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

export async function applyMobileScanLoginResult(result: ScanLoginConfirmResult) {
  if (result.plusAuth) {
    await AsyncStorage.setItem("bookdock_plus_token", result.plusAuth.token);
    await AsyncStorage.setItem("bookdock_plus_user_id", JSON.stringify(result.plusAuth.userId));
  }
}
