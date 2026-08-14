/**
 * SharingService — mobile2 版本
 *
 * expo-sharing → react-native-share 替换:
 * - Sharing.isAvailableAsync → react-native-share 不需要探测(平台自带 share sheet)
 * - Sharing.shareAsync → Share.open(url, {type, filename})
 *
 * SettingsScreen 没引用 sharingService,但 mobile/src/services/index.ts 把 4 个 service 一起 export,
 * 保留接口形状对齐。
 */

import Share from 'react-native-share';
import RNFS from 'react-native-fs';

class SharingService {
  async isAvailable(): Promise<boolean> {
    // RN 原生 share sheet 在 iOS/Android 都有
    return true;
  }

  async shareFile(uri: string, mimeType?: string): Promise<void> {
    try {
      await Share.open({
        url: uri.startsWith('file://') ? uri : `file://${uri}`,
        type: mimeType,
        filename: 'Book',
      });
    } catch (error: any) {
      // user cancel - ignore
      if (error?.message?.includes('User did not share')) return;
      throw error;
    }
  }

  async shareText(text: string, _title?: string): Promise<void> {
    try {
      await Share.open({
        message: text,
        title: _title,
      });
    } catch (error: any) {
      if (error?.message?.includes('User did not share')) return;
      throw error;
    }
  }

  async shareBook(book: { title: string; author: string; localPath?: string }): Promise<void> {
    if (book.localPath) {
      await this.shareFile(book.localPath);
    } else {
      const shareText = `Check out "${book.title}" by ${book.author} on BookDock!`;
      await this.shareText(shareText);
    }
  }

  /** 兼容 mobile 的内部辅助函数:把 text 写到缓存文件再分享 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async _shareTextAsFile(text: string, mimeType: string): Promise<void> {
    const tempPath = `${RNFS.CachesDirectoryPath}/share_text.txt`;
    await RNFS.writeFile(tempPath, text, 'utf8');
    await this.shareFile(tempPath, mimeType);
  }
}

export const sharingService = new SharingService();