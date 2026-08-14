/**
 * Mobile Scan Login Utilities for BookDock
 * Simplified version - BookDock only needs Plus auth sync
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ScanLoginClaimPayload } from "../services/plus";

export async function collectMobileScanLoginPayload(): Promise<ScanLoginClaimPayload> {
  const plusToken = await AsyncStorage.getItem("bookdock_plus_token");
  const plusUserId = await AsyncStorage.getItem("bookdock_plus_user_id");

  return {
    deviceName: "Mobile Device",
    deviceType: "mobile",
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

/**
 * Apply scan-login result to local storage.
 *
 * Source devices (mobile/desktop) return a wide object (ScanLoginSession with plusAuth),
 * target devices get a narrower ScanLoginConfirmResult. We only care about the plusAuth
 * field in both cases, so accept any shape that has it.
 */
export async function applyMobileScanLoginResult(result: {
  plusAuth?: { token: string; userId: string | number } | null;
}) {
  if (result.plusAuth) {
    await AsyncStorage.setItem("bookdock_plus_token", result.plusAuth.token);
    await AsyncStorage.setItem("bookdock_plus_user_id", JSON.stringify(result.plusAuth.userId));
  }
}