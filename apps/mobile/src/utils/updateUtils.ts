/**
 * updateUtils.ts — APK 下载与安装工具（mobile2 版本）
 *
 * expo-* 替换:
 * - expo-constants → 直接读 package.json (与 SettingsScreen 行为一致)
 * - expo-file-system → react-native-fs
 * - expo-intent-launcher → react-native-intent-launcher
 * - expo-web-browser → react-native-inappbrowser-reborn
 *
 * 设计参考 audioDock apps/mobile/src/utils/updateUtils.ts,行为完全一致。
 */

import RNFS from 'react-native-fs';
import IntentLauncher from 'react-native-intent-launcher';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { Linking, Platform } from 'react-native';

/**
 * 1. 获取本地版本号 (例如 "1.0.58")
 * mobile2 直接读 package.json,避免依赖 expo-constants / react-native-device-info
 */
export const getLocalVersion = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../package.json').version || '0.0.0';
};

/**
 * 2. 版本比对算法
 * 返回 1: remote > local (需要更新)
 * 返回 0: 相等
 * 返回 -1: remote < local
 */
export const compareVersions = (remote: string, local: string): number => {
  const parts1 = remote.split('.').map(Number);
  const parts2 = local.split('.').map(Number);
  const length = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < length; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};

// 辅助函数：从 URL 提取文件名
// 输入: https://example.com/v1/app-1.0.0.apk?token=xyz
// 输出: app-1.0.0.apk
const getFileNameFromUrl = (url: string): string => {
  try {
    const cleanUrl = url.split('?')[0];
    const fileName = cleanUrl.split('/').pop();
    return fileName || 'update.apk';
  } catch {
    return 'update.apk';
  }
};

/**
 * 计算本地 APK 缓存路径 (react-native-fs 路径)。
 * mobile2 用 CachesDirectoryPath 替代 expo-file-system 的 cacheDirectory。
 */
export const getLocalApkUri = (downloadUrl: string): string => {
  const fileName = getFileNameFromUrl(downloadUrl);
  return `${RNFS.CachesDirectoryPath}/${fileName}`;
};

export const checkLocalApkExists = async (downloadUrl: string): Promise<boolean> => {
  try {
    const localUri = getLocalApkUri(downloadUrl);
    const exists = await RNFS.exists(localUri);
    if (!exists) return false;
    const stat = await RNFS.stat(localUri);
    return Number(stat.size) > 0;
  } catch {
    return false;
  }
};

/**
 * 通过 IntentLauncher 调起 Android 安装器。
 * 注意:RNFS 的路径是 file:// URI,Android 7+ 需要 FileProvider 才能传给 Intent。
 * 这里简化处理:如果有 file:// 路径,直接传 path;真生产环境推荐改用 FileProvider。
 */
export const installApk = async (localUri: string): Promise<void> => {
  if (Platform.OS !== 'android') return;

  try {
    // RNFS 路径可能是 "file:///..." 或 "/...",统一剥掉 file:// 前缀
    const path = localUri.replace(/^file:\/\//, '');

    await IntentLauncher.startActivity({
      action: 'android.intent.action.VIEW',
      data: `file://${path}`,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
  } catch (e) {
    console.error('安装 APK 出错:', e);
    throw e;
  }
};

/**
 * 使用应用内浏览器打开下载链接,让系统浏览器处理下载
 * 避免弹出第三方应用选择器(如迅雷)
 */
export const downloadWithSystemManager = async (downloadUrl: string): Promise<void> => {
  if (Platform.OS !== 'android') return;

  try {
    await InAppBrowser.open(downloadUrl, {
      showTitle: true,
      toolbarColor: '#000000',
    });
  } catch (e) {
    console.error('浏览器打开失败:', e);
    // 降级方案:使用系统浏览器
    await Linking.openURL(downloadUrl);
  }
};

/**
 * 保留:与 mobile 保持一致的接口。
 * 当前 mobile2 用系统下载管理器,这里始终返回 false 让调用方走系统流程。
 */
export const checkSystemDownloadComplete = async (_downloadUrl: string): Promise<boolean> => {
  return false;
};

/**
 * 旧的应用内下载逻辑(保留作为备用)
 */
export const downloadAndInstallApk = async (
  downloadUrl: string,
  onProgress: (progress: number) => void,
): Promise<void> => {
  if (Platform.OS !== 'android') return;

  const localUri = getLocalApkUri(downloadUrl);
  console.log('保存路径:', localUri);

  try {
    const exists = await RNFS.exists(localUri);
    if (exists) {
      const stat = await RNFS.stat(localUri);
      if (Number(stat.size) > 0) {
        console.log('检测到本地已存在安装包,直接安装');
        onProgress(1);
        await installApk(localUri);
        return;
      }
    }
  } catch (e) {
    console.warn('检查本地文件失败,继续尝试下载:', e);
  }

  try {
    // react-native-fs downloadFile 用 jobId + promise 风格
    const download = RNFS.downloadFile({
      fromUrl: downloadUrl,
      toFile: localUri,
      progressDivider: 5,
      begin: () => {
        console.log('[Update] Download begin');
      },
      progress: (res) => {
        if (res.contentLength > 0) {
          onProgress(res.bytesWritten / res.contentLength);
        }
      },
    });

    const result = await download.promise;
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`下载失败,状态码: ${result.statusCode}`);
    }

    await installApk(localUri);
  } catch (e) {
    console.error('下载安装流程出错:', e);
    throw e;
  }
};