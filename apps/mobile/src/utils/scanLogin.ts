/**
 * Mobile Scan Login Utilities for BookDock
 * Simplified version - BookDock only needs Plus auth sync
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
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
