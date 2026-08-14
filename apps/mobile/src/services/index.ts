/**
 * services/index.ts — 统一导出 (mobile2)
 *
 * 与 mobile/src/services/index.ts 形状对齐:
 * - apiClient from './api'
 * - notificationService from './notifications' (mobile 是 index.ts 内嵌,mobile2 拆到独立文件)
 * - fileSystemService from './fileSystem' (同上)
 * - sharingService from './sharing' (同上)
 * - plus 系列 from './plus'
 *
 * 这样 SettingsScreen 等页面的 `import { notificationService, fileSystemService } from '../services'` 不需要改。
 */

// Re-export api client
export { apiClient } from './api';
export type { BooksQuery, UserSettings } from './api';
export type { TTSBookMeta, TTSChapter, TTSChapterContent } from './api';
export type { Collection, Highlight } from './api';

// Re-export Plus API (与 mobile 完全一致)
export {
  plusSendCode,
  plusLogin,
  plusGetMe,
  plusGetVipStatus,
  plusCreateVipPayment,
  plusQueryPaymentStatus,
  plusCancelOrder,
  plusGetCurrentLowestPrice,
  plusGetMyCoupons,
  plusVerifyCoupon,
  createScanLoginSession,
  getScanLoginSession,
  claimScanLoginSession,
  confirmScanLoginSession,
  consumeScanLoginSession,
  reportScanLoginResult,
  subscribeScanLoginSession,
  reportScanLoginResultViaSocket,
  setPlusToken,
  getPlusToken,
  removePlusToken,
  setPlusUnauthorizedHandler,
  participateInternalTest,
  deletePlusMe,
} from './plus';
export type {
  ISuccessResponse,
  ScanLoginSession,
  ScanLoginSessionStatus,
  ScanLoginClaimPayload,
  ScanLoginConfirmResult,
  VipStatusResponse,
  ParticipateInternalTestDto,
  ParticipateInternalTestResponse,
  DeletePlusMeResponse,
  CreatePaymentDto,
  CreatePaymentResult,
  PaymentStatusResult,
  PlusCoupon,
  PlusCouponVerifyResult,
  VipCurrentLowestPriceData,
  VipCurrentLowestPricePlan,
} from './plus';

// Notification, file system, sharing services
export { notificationService } from './notifications';
export { fileSystemService } from './fileSystem';
export { sharingService } from './sharing';