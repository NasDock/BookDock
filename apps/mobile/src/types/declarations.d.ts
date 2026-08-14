/**
 * 第三方库类型补充 — mobile2
 *
 * 这几个库都是 JS-only,没有官方 .d.ts:
 * - react-native-vector-icons/Ionicons (mobile2 用 Ionicons)
 * - react-native-vector-icons/AntDesign (ProfileScreen headerRight scan icon)
 * - react-native-intent-launcher (mobile2 用 installApk 调起 Android Intent)
 */

declare module 'react-native-vector-icons/Ionicons' {
  import {ComponentType} from 'react';
  import {TextProps} from 'react-native';

  interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  const Icon: ComponentType<IconProps>;
  export default Icon;
  export {Icon};
}

declare module 'react-native-vector-icons/AntDesign' {
  import {ComponentType} from 'react';
  import {TextProps} from 'react-native';

  interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  const Icon: ComponentType<IconProps>;
  export default Icon;
  export {Icon};
}

declare module 'react-native-intent-launcher' {
  export interface IntentLauncherActivityArgs {
    action?: string;
    data?: string;
    type?: string;
    category?: string;
    flags?: number;
    packageName?: string;
    className?: string;
  }

  const IntentLauncher: {
    startActivity(args: IntentLauncherActivityArgs): Promise<void>;
  };

  export default IntentLauncher;
}
/**
 * gbk.js — mobile2 复刻 mobile ReaderScreen 用 GBK 编码探测 TXT
 * JS-only,无官方 .d.ts。mobile 那边直接 import 也没事（mobile tsc 设置更宽松）
 */
declare module 'gbk.js' {
  /**
   * 解码 GBK 编码的 Uint8Array 为 UTF-8 字符串。
   * gbk.js 包内默认导出 decode(bytes) 函数。
   */
  export function decode(bytes: Uint8Array): string;
  const gbkjs: { decode: typeof decode };
  export default gbkjs;
}

/**
 * RN 0.81 Hermes runtime globals —— tsc 默认 lib 不含 web DOM,
 * 这些 global API 在 Hermes 里都有但 TS 不知道,显式 declare 才能编译过。
 *
 * - atob / btoa:RN Web polyfill / Hermes 内置,ReaderScreen 用作 base64 编解码
 * - TextDecoder / TextEncoder:Hermes 0.81 内置,ReaderScreen 用来探测 TXT 编码 (jschardet + decode)
 * - navigator:浏览器 navigator.share (Web Share API),ReaderScreen 分享按钮在 web 端 fallback 用,
 *   RN 真机没有 navigator global,运行时这个分支永远走不到,只是为了让 tsc 过
 *
 * 之前因为没声明,IDE / tsc 报 "Cannot find name 'atob'" (TS2304),ReaderScreen.tsx 6 处红错。
 */
declare const atob: (input: string) => string;
declare const btoa: (input: string) => string;
declare class TextDecoder {
  constructor(encoding?: string);
  readonly encoding: string;
  decode(input?: ArrayBufferView | ArrayBuffer | null): string;
}
declare class TextEncoder {
  constructor();
  readonly encoding: string;
  encode(input?: string): Uint8Array;
}
interface Navigator {
  share?: (data?: { title?: string; text?: string; url?: string }) => Promise<void>;
}
declare const navigator: Navigator | undefined;
