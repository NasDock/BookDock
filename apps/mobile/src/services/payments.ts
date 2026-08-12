/**
 * payments.ts
 *
 * 微信 / 支付宝支付模块抽象。
 * 设计参考 AudioDock `apps/mobile/src/services/payments.ts`,精简为 BookDock 实际需要的部分:
 * - 微信:走 react-native-wechat-lib NativeModule,只在 Android 上启用。
 * - 支付宝:暂未集成 SDK,仅保留函数形状便于以后接入 @uiw/react-native-alipay。
 *
 * 注意 (2026-08-12):
 * - iOS 端不开放支付功能,MemberBenefitsScreen 在 iOS 上不会调用本文件的支付函数。
 *   但本文件本身不强制 Platform 判断,由 UI 层(utils/membershipGate.ts)控制。
 * - WECHAT_APP_ID 是占位符,与 AudioDock 一致(`wx1234567890abcdef`)。
 *   真支付所需的 AppID 在后端 /payment/create 返回 wechatPay.appId,SDK 用返回的 appId register。
 */

import { Linking, NativeModules } from 'react-native';

// ============ 常量 ============

/**
 * 占位 AppID。与 AudioDock `app/member-benefits.tsx` 顶部常量一致。
 * 真支付使用的 AppID 由后端 `/payment/create` 返回 `wechatPay.appId` 字段提供。
 * 这里只是 registerApp 的占位,以满足 react-native-wechat-lib 的 API 要求。
 */
export const WECHAT_APP_ID = 'wx1234567890abcdef';

/**
 * 微信 universalLink 占位。react-native-wechat-lib 在 iOS 上需要这个参数,
 * Android 上 registerApp 会忽略该字段,但类型签名要传。
 * iOS 当前不启用支付,但保留参数便于以后接入。
 */
export const WECHAT_UNIVERSAL_LINK = 'https://mock.example.com/';

// ============ 类型 ============

type WeChatNativeModule = {
  registerApp: (
    appId: string,
    universalLink: string | undefined,
    callback: (error?: string | null, result?: boolean) => void,
  ) => void;
  pay: (
    payload: Record<string, unknown>,
    callback: (error?: string | null) => void,
  ) => void;
};

type WeChatModule = {
  registerApp: (appId: string, universalLink?: string) => Promise<boolean>;
  pay: (payload: Record<string, unknown>) => Promise<unknown>;
};

export type WechatPayPayload = {
  partnerId: string;
  prepayId: string;
  nonceStr: string;
  timeStamp: string;
  sign: string;
  /**
   * 可选冗余字段：与 ensureWeChatRegistered 的 appId 同源，
   * payWithWeChat 内部实际不读这个字段（registerApp 已处理）。
   * 保留是因为部分调用方习惯把整个微信支付参数对象一锅端传进来。
   */
  appId?: string;
  package?: string;
  signType?: string;
};

// ============ NativeModule 加载(带缓存) ============

let cachedWeChatModule: WeChatModule | null | undefined;

const loadWeChatModule = (): WeChatModule | null => {
  if (cachedWeChatModule !== undefined) return cachedWeChatModule;
  const nativeModule = ((NativeModules as any)?.RCTWeChat ??
    (NativeModules as any)?.WeChat) as WeChatNativeModule | undefined;

  console.log('[Pay][WeChat] native module', {
    nativeKeys: Object.keys((NativeModules as any) || {}).filter(
      (key) => key === 'RCTWeChat' || key === 'WeChat',
    ),
    hasRegister: !!nativeModule?.registerApp,
    hasPay: !!nativeModule?.pay,
  });

  if (!nativeModule?.registerApp || !nativeModule?.pay) {
    cachedWeChatModule = null;
    return cachedWeChatModule;
  }

  cachedWeChatModule = {
    registerApp: (appId: string, universalLink?: string) =>
      new Promise<boolean>((resolve, reject) => {
        nativeModule.registerApp(appId, universalLink, (error, result) => {
          if (error) {
            reject(new Error(String(error)));
            return;
          }
          resolve(Boolean(result));
        });
      }),
    pay: (payload: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        // 监听 WeChat_Resp 事件以拿到异步支付结果
        const { DeviceEventEmitter } = require('react-native');
        const subscription = DeviceEventEmitter.addListener(
          'WeChat_Resp',
          (resp: any) => {
            if (resp?.type !== 'PayReq.Resp') return;
            subscription.remove();
            if (resp?.errCode === 0) {
              resolve(resp);
              return;
            }
            reject(
              new Error(
                resp?.errStr || String(resp?.errCode || 'WeChat pay failed'),
              ),
            );
          },
        );

        nativeModule.pay(payload, (error) => {
          if (!error) return;
          subscription.remove();
          reject(new Error(String(error)));
        });
      }),
  };
  return cachedWeChatModule;
};

const getWeChatModule = (): WeChatModule => {
  const mod = loadWeChatModule();
  console.log('[Pay][WeChat] module', {
    ok: !!mod,
    hasRegister: !!(mod as any)?.registerApp,
    hasPay: !!(mod as any)?.pay,
  });
  if (!mod || !mod.registerApp) {
    throw new Error('微信支付模块不可用(已禁用或未集成)');
  }
  return mod;
};

// ============ 公开 API ============

/**
 * 仅探测微信 NativeModule 是否可用,不实际调用 registerApp。
 * 用于 UI 层前置校验,避免在订单未创建前弹出错误 alert 之外的副作用。
 */
export const isWeChatModuleAvailable = (): boolean => {
  return loadWeChatModule() !== null;
};

/**
 * 在支付前调用 registerApp，把微信 SDK 绑定到指定 AppID。
 * 后端 /payment/create 返回的 wechatPay.appId 优先,WECHAT_APP_ID 是 fallback。
 */
export const ensureWeChatRegistered = async (
  appId: string = WECHAT_APP_ID,
  universalLink: string = WECHAT_UNIVERSAL_LINK,
) => {
  if (!appId) {
    throw new Error('WeChat AppID 缺失');
  }
  const WeChat = getWeChatModule();
  await WeChat.registerApp(appId, universalLink);
};

/**
 * 唤起微信支付。
 * 失败时若提供 fallbackUrl(通常是后端返回的 paymentUrl 网页兜底),
 * 会尝试 Linking.openURL;都不行则 throw 由调用方决定弹什么 Alert。
 */
export const payWithWeChat = async (
  payload: WechatPayPayload,
  fallbackUrl?: string,
) => {
  try {
    const WeChat = getWeChatModule();
    console.log('[Pay][WeChat] payload', payload);
    const wechatResult = await WeChat.pay({
      partnerId: payload.partnerId,
      prepayId: payload.prepayId,
      nonceStr: payload.nonceStr,
      timeStamp: payload.timeStamp,
      package: payload.package ?? 'Sign=WXPay',
      sign: payload.sign,
    });
    console.log('[Pay][WeChat] pay invoked', wechatResult);
    return wechatResult;
  } catch (error) {
    console.warn('[Pay][WeChat] error', error);
    if (fallbackUrl) {
      const supported = await Linking.canOpenURL(fallbackUrl);
      console.log('[Pay][WeChat] fallback url', { fallbackUrl, supported });
      if (supported) {
        await Linking.openURL(fallbackUrl);
        return;
      }
    }
    throw error;
  }
};