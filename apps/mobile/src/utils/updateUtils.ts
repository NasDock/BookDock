import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

/**
 * 1. 获取本地版本号 (例如 "1.0.58")
 */
export const getLocalVersion = () => {
  // Expo 推荐使用 expoConfig，兼容旧版本用 manifest
  return Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
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
const getFileNameFromUrl = (url: string) => {
  try {
    // 1. 去掉查询参数 (即 ? 后面的内容)
    const cleanUrl = url.split('?')[0];
    // 2. 获取最后一个 / 后面的内容
    const fileName = cleanUrl.split('/').pop();
    // 3. 如果获取失败，返回默认名字
    return fileName || 'update.apk';
  } catch (e) {
    return 'update.apk';
  }
};

export const getLocalApkUri = (downloadUrl: string): string => {
  const fileName = getFileNameFromUrl(downloadUrl);
  const cacheDir = FileSystem.cacheDirectory || ''; 
  return `${cacheDir}${fileName}`;
};

export const checkLocalApkExists = async (downloadUrl: string): Promise<boolean> => {
  try {
    const localUri = getLocalApkUri(downloadUrl);
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    return fileInfo.exists && fileInfo.size > 0;
  } catch (e) {
    return false;
  }
};

export const installApk = async (localUri: string) => {
  if (Platform.OS !== 'android') return;
  
  try {
    // 获取 Content URI
    const contentUri = await FileSystem.getContentUriAsync(localUri);
    
    // 调起安装
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, 
      type: 'application/vnd.android.package-archive',
    });
  } catch (e) {
    console.error('安装 APK 出错:', e);
    throw e;
  }
};

export const downloadAndInstallApk = async (
  downloadUrl: string, 
  onProgress: (progress: number) => void
) => {
  if (Platform.OS !== 'android') return;

  const localUri = getLocalApkUri(downloadUrl);
  console.log('保存路径:', localUri);

  try {
    // 检测本地是否已经存在已下载的安装包
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists && fileInfo.size > 0) {
      console.log('检测到本地已存在安装包，直接安装');
      onProgress(1); // 立即标记为完成
      await installApk(localUri);
      return;
    }
  } catch (e) {
    console.warn('检查本地文件失败，继续尝试下载:', e);
  }

  // 创建下载任务
  const downloadResumable = FileSystem.createDownloadResumable(
    downloadUrl,
    localUri,
    {},
    (downloadProgress) => {
      if (downloadProgress.totalBytesExpectedToWrite > 0) {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress(progress);
      }
    }
  );

  try {
    const result = await downloadResumable.downloadAsync();
    
    if (!result || (result.status !== 200 && result.status !== undefined)) {
      throw new Error(`下载失败，状态码: ${result?.status}`);
    }

    await installApk(result.uri);
  } catch (e) {
    console.error('下载安装流程出错:', e);
    throw e;
  }
};
