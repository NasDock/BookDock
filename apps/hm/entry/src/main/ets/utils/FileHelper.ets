// [API 23+] utils/FileHelper.ets — 1:1 对齐 mobile RNFS 用法
// mobile 的 libraryStore.downloadBook 写了 `${DocumentDirectoryPath}/books/${id}.${ext}`
// 这里用 @kit.CoreFileKit 的 context.filesDir 对齐。提供 RNFS 兼容的子集:
// exists / mkdir / writeFile / readFile / unlink / stat。
import { fileIo } from '@kit.CoreFileKit';
import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0003;
const TAG = 'FileHelper';

// fileIo 抛出的错误类型,ArkTS 不能用 unknown,固定到具体字段
interface FsError {
  code: number;
  message: string;
}

let appContext: common.UIAbilityContext | null = null;

export class FileHelper {
  /** 在 EntryAbility.onCreate 调用一次 */
  static init(context: common.UIAbilityContext): void {
    appContext = context;
  }

  private static requireContext(): common.UIAbilityContext {
    if (!appContext) {
      throw new Error('FileHelper not initialized. Call FileHelper.init(context) in EntryAbility.onCreate.');
    }
    return appContext;
  }

  /** 应用沙箱根目录(对齐 mobile RNFS.DocumentDirectoryPath) */
  static documentsDir(): string {
    return FileHelper.requireContext().filesDir;
  }

  /** 业务目录(对齐 mobile libraryStore.downloadBook 用的 books/ 子目录) */
  static booksDir(): string {
    return FileHelper.documentsDir() + '/books';
  }

  static async ensureBooksDir(): Promise<string> {
    const dir = FileHelper.booksDir();
    if (!FileHelper.exists(dir)) {
      await FileHelper.mkdir(dir);
    }
    return dir;
  }

  /** 拼出 mobile RNFS 风格的目标路径(books/{safeId}.{ext}) */
  static bookLocalPath(bookId: string, ext: string): string {
    const safeId = bookId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const e = (ext || 'txt').toLowerCase();
    return `${FileHelper.booksDir()}/${safeId}.${e}`;
  }

  // ─── RNFS 兼容接口 ─────────────────────────────────────────────

  static exists(path: string): boolean {
    try {
      return fileIo.accessSync(path);
    } catch {
      return false;
    }
  }

  static async mkdir(path: string): Promise<void> {
    try {
      await fileIo.mkdir(path, true);
    } catch (err) {
      const e: FsError = err as FsError;
      if (e.code !== 13900015) {
        // 13900015 = EEXIST,目录已存在,忽略
        hilog.warn(DOMAIN, TAG, 'mkdir %{public}s fail err=%{public}s', path, JSON.stringify(err));
      }
    }
  }

  /** 写 ArrayBuffer(mobile RNFS.writeFile(path, base64, 'base64') 等价路径) */
  static async writeBytes(path: string, bytes: ArrayBuffer): Promise<void> {
    const file = await fileIo.open(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    try {
      await fileIo.write(file.fd, bytes);
    } finally {
      await fileIo.close(file);
    }
  }

  /** 写 UTF-8 字符串 */
  static async writeText(path: string, text: string): Promise<void> {
    const encoder = new util.TextEncoder();
    const bytes: Uint8Array = encoder.encodeInto(text);
    // bytes.buffer 类型是 ArrayBufferLike,writeBytes 形参是 ArrayBuffer,需要显式 cast
    await FileHelper.writeBytes(path, bytes.buffer as ArrayBuffer);
  }

  /** 读为 ArrayBuffer */
  static async readBytes(path: string): Promise<ArrayBuffer> {
    const file = await fileIo.open(path, fileIo.OpenMode.READ_ONLY);
    try {
      const stat = await fileIo.stat(path);
      const buf = new ArrayBuffer(stat.size);
      await fileIo.read(file.fd, buf);
      return buf;
    } finally {
      await fileIo.close(file);
    }
  }

  /** 读为 UTF-8 字符串 */
  static async readText(path: string): Promise<string> {
    const buf: ArrayBuffer = await FileHelper.readBytes(path);
    const decoder = new util.TextDecoder('utf-8');
    const result: string = decoder.decodeToString(new Uint8Array(buf));
    return result;
  }

  static async unlink(path: string): Promise<void> {
    if (!FileHelper.exists(path)) {
      return;
    }
    try {
      await fileIo.unlink(path);
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'unlink %{public}s fail err=%{public}s', path, JSON.stringify(err));
    }
  }

  static async fileSize(path: string): Promise<number> {
    try {
      const stat = await fileIo.stat(path);
      return stat.size;
    } catch {
      return 0;
    }
  }

  // ─── ArrayBuffer ↔ Base64 ───────────────────────────────────────
  // 鸿蒙 Base64 helper 已被 deprecated,改用自定义实现。
  // 标准 Base64 字符集 + 4 字符一组,统一处理末尾 '=' 填充。

  private static readonly BASE64_CHARS: string[] =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');

  /** ArrayBuffer → Base64 字符串 */
  static arrayBufferToBase64(buf: ArrayBuffer): string {
    const u8: Uint8Array = new Uint8Array(buf);
    const len: number = u8.length;
    const chars: string[] = FileHelper.BASE64_CHARS;
    let out: string = '';
    let i = 0;
    while (i + 2 < len) {
      const b0: number = u8[i];
      const b1: number = u8[i + 1];
      const b2: number = u8[i + 2];
      out += chars[b0 >> 2];
      out += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
      out += chars[((b1 & 0x0f) << 2) | (b2 >> 6)];
      out += chars[b2 & 0x3f];
      i += 3;
    }
    if (i < len) {
      const b0: number = u8[i];
      const b1: number = i + 1 < len ? u8[i + 1] : 0;
      out += chars[b0 >> 2];
      if (i + 1 < len) {
        out += chars[((b0 & 0x03) << 4) | (b1 >> 4)];
        out += chars[(b1 & 0x0f) << 2];
        out += '=';
      } else {
        out += chars[(b0 & 0x03) << 4];
        out += '==';
      }
    }
    return out;
  }

  /** Base64 字符串 → ArrayBuffer */
  static base64ToArrayBuffer(b64: string): ArrayBuffer {
    const cleaned: string = b64.replace(/[^A-Za-z0-9+/]/g, '');
    const lookup: Map<string, number> = new Map();
    const chars: string[] = FileHelper.BASE64_CHARS;
    for (let idx = 0; idx < chars.length; idx++) {
      const ch: string = chars[idx];
      lookup.set(ch, idx);
    }
    const outLen: number = Math.floor(cleaned.length * 3 / 4);
    const bytes: Uint8Array = new Uint8Array(outLen);
    let bi = 0;
    let pi = 0;
    while (pi + 3 < cleaned.length) {
      const c0: number = lookup.get(cleaned.charAt(pi)) ?? 0;
      const c1: number = lookup.get(cleaned.charAt(pi + 1)) ?? 0;
      const c2: number = lookup.get(cleaned.charAt(pi + 2)) ?? 0;
      const c3: number = lookup.get(cleaned.charAt(pi + 3)) ?? 0;
      bytes[bi] = (c0 << 2) | (c1 >> 4);
      bytes[bi + 1] = ((c1 & 0x0f) << 4) | (c2 >> 2);
      bytes[bi + 2] = ((c2 & 0x03) << 6) | c3;
      pi += 4;
      bi += 3;
    }
    if (pi + 1 < cleaned.length) {
      const c0: number = lookup.get(cleaned.charAt(pi)) ?? 0;
      const c1: number = lookup.get(cleaned.charAt(pi + 1)) ?? 0;
      bytes[bi] = (c0 << 2) | (c1 >> 4);
      bi += 1;
      if (pi + 2 < cleaned.length) {
        const c2: number = lookup.get(cleaned.charAt(pi + 2)) ?? 0;
        bytes[bi] = ((c1 & 0x0f) << 4) | (c2 >> 2);
      }
    }
    return bytes.buffer as ArrayBuffer;
  }
}