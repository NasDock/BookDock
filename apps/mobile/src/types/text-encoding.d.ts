declare module 'gbk.js' {
  export function decode(bytes: Uint8Array | ArrayBufferView | number[]): string;
  export function encode(str: string): number[];
}
