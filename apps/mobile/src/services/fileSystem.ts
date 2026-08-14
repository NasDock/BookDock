/**
 * FileSystemService — mobile2 版本
 *
 * expo-file-system → react-native-fs 替换映射:
 * - documentDirectory → RNFS.DocumentDirectoryPath
 * - cacheDirectory → RNFS.CachesDirectoryPath
 * - getInfoAsync(uri) → RNFS.exists + RNFS.stat
 * - writeAsStringAsync / readAsStringAsync → RNFS.writeFile / RNFS.readFile
 * - deleteAsync → RNFS.unlink
 * - makeDirectoryAsync({intermediates:true}) → 先 exists 检查再 mkdir
 * - readDirectoryAsync → RNFS.readDir
 * - createDownloadResumable → RNFS.downloadFile (在 updateUtils 里处理,这里只保留离线缓存接口)
 *
 * 接口形状与 mobile/src/services/index.ts 里的 FileSystemService 对齐,
 * SettingsScreen 等仍然 `import { fileSystemService } from '../services'`。
 */

import RNFS from 'react-native-fs';

class FileSystemService {
  /** 暴露给 SettingsScreen 清除缓存用:`fileSystemService['booksDir']` */
  public readonly booksDir = `${RNFS.DocumentDirectoryPath}/books/`;

  private async ensureBooksDirectory(): Promise<void> {
    const exists = await RNFS.exists(this.booksDir);
    if (!exists) {
      await RNFS.mkdir(this.booksDir);
    }
  }

  async getBookPath(bookId: string, filename: string): Promise<string> {
    await this.ensureBooksDirectory();
    return `${this.booksDir}${bookId}_${filename}`;
  }

  async saveBookFile(bookId: string, filename: string, content: string): Promise<string> {
    const path = await this.getBookPath(bookId, filename);
    await RNFS.writeFile(path, content, 'utf8');
    return path;
  }

  async readBookFile(path: string): Promise<string | null> {
    try {
      const exists = await RNFS.exists(path);
      if (!exists) return null;
      return await RNFS.readFile(path, 'utf8');
    } catch (error) {
      console.error('Failed to read book file:', error);
      return null;
    }
  }

  async deleteBookFile(path: string): Promise<void> {
    try {
      const exists = await RNFS.exists(path);
      if (exists) {
        await RNFS.unlink(path);
      }
    } catch (error) {
      console.error('Failed to delete book file:', error);
    }
  }

  async getFileSize(path: string): Promise<number> {
    try {
      const exists = await RNFS.exists(path);
      if (!exists) return 0;
      const stat = await RNFS.stat(path);
      return Number(stat.size);
    } catch {
      return 0;
    }
  }

  async listDownloadedBooks(): Promise<string[]> {
    try {
      await this.ensureBooksDirectory();
      const entries = await RNFS.readDir(this.booksDir);
      return entries.map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * 移动版:返回 free disk storage (bytes)。
   * RNFS 没有原生 getFreeDiskStorageAsync 接口,
   * 这里返回 0 占位,SettingsScreen 渲染 "0 GB" 是 mobile 行为也是 mobile2 行为。
   */
  async getStorageInfo(): Promise<{ used: number; total: number }> {
    try {
      // RNFS.freeDiskSpace 返回 free bytes
      const free = await RNFS.getFSInfo();
      return { used: 0, total: free.freeSpace };
    } catch {
      return { used: 0, total: 0 };
    }
  }
}

export const fileSystemService = new FileSystemService();