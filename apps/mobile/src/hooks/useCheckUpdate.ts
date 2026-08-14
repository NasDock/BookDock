import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { checkLocalApkExists, compareVersions, downloadWithSystemManager, getLocalApkUri, getLocalVersion, installApk } from '../utils/updateUtils';

// 配置常量
const GITHUB_USER = 'mmdctjj';
const GITHUB_REPO = 'BookDock';
const DOWNLOAD_API_URL = 'https://www.audiodock.cn/api/download/latest?product=bookdock';

interface DownloadFile {
  platform: string;
  label: string;
  filename: string;
  size: number;
  url: string;
}

interface DownloadApiResponse {
  code: number;
  message: string;
  data: {
    version: string;
    files: DownloadFile[];
  };
}

export interface UpdateInfo {
  version: string;
  body: string;
  downloadUrl: string;
}

/**
 * 一次手动检查更新的结果,供 UI 层做反馈
 * - hasUpdate: 有新版本(同时会通过 updateInfo 暴露详情,弹窗会自动展示)
 * - upToDate: 已是最新版本
 * - ignored: 该版本被用户主动忽略
 * - error: 检查过程出错(网络/接口异常)
 * - unsupported: 当前平台不支持(非 Android)
 */
export type UpdateCheckResult =
  | { status: 'hasUpdate' }
  | { status: 'upToDate' }
  | { status: 'ignored'; version: string }
  | { status: 'error'; message: string }
  | { status: 'unsupported' };

export const useCheckUpdate = () => {
  // UI 状态
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // 手动检查专用状态
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(null);

  const clearCheckResult = useCallback(() => setCheckResult(null), []);

  const checkUpdate = async () => {
    if (Platform.OS !== 'android') {
      setCheckResult({ status: 'unsupported' });
      return;
    }

    setIsChecking(true);
    setCheckResult(null);

    try {
      // 1. 从 audiodock 接口获取最新版本和实际下载地址
      const downloadRes = await fetch(DOWNLOAD_API_URL);
      const downloadData: DownloadApiResponse = await downloadRes.json();
      if (downloadData.code !== 200 || !downloadData.data) {
        console.error('audiodock 下载接口返回异常:', downloadData.message);
        setCheckResult({ status: 'error', message: downloadData.message || '获取最新版本失败' });
        return;
      }

      const remoteVersion = downloadData.data.version;
      const androidFile = downloadData.data.files.find((f) => f.platform === 'android');
      if (!androidFile || !androidFile.url) {
        console.log(`Version ${remoteVersion} found but no Android download URL.`);
        setCheckResult({ status: 'error', message: '未找到 Android 安装包' });
        return;
      }

      const downloadUrl = androidFile.url;
      console.log(`Found APK from audiodock: ${downloadUrl}`);

      // 2. 保留从 GitHub 获取更新内容(release notes)
      let body = '建议立即更新体验新功能';
      try {
        const tagName = `v${remoteVersion}`;
        const githubApiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/tags/${tagName}`;
        const githubRes = await fetch(githubApiUrl);
        const githubData = await githubRes.json();
        if (githubData.body) {
          body = githubData.body;
        }
      } catch (e) {
        console.warn('从 GitHub 获取 release 说明失败,使用默认文案', e);
      }

      const localVersion = getLocalVersion();

      console.log(`本地: ${localVersion}, 线上: ${remoteVersion}`);

      // Check ignore
      const ignoredVersion = await AsyncStorage.getItem("ignored_version");
      if (remoteVersion === ignoredVersion) {
        console.log(`Version ${remoteVersion} is ignored.`);
        setCheckResult({ status: 'ignored', version: remoteVersion });
        return;
      }

      // 3. 比对版本并展示更新
      if (compareVersions(remoteVersion, localVersion) === 1) {
        setUpdateInfo({
          version: remoteVersion,
          body,
          downloadUrl: downloadUrl
        });
        setCheckResult({ status: 'hasUpdate' });

        // 检查本地是否已经下载过
        const exists = await checkLocalApkExists(downloadUrl);
        if (exists) {
          setProgress(1); // 如果已存在,直接标记进度为完成
        } else {
          setProgress(0);
        }
      } else {
        // 本地版本不低于线上版本 → 已是最新
        setCheckResult({ status: 'upToDate' });
      }
    } catch (error) {
      console.error('检查更新失败', error);
      setCheckResult({ status: 'error', message: '网络错误,请稍后重试' });
    } finally {
      setIsChecking(false);
    }
  };

  /**
   * 使用系统下载管理器下载更新
   */
  const startUpdate = () => {
    if (isUpdating) return;
    if (updateInfo) {
      startSystemDownload(updateInfo.downloadUrl);
    }
  };

  /**
   * 安装本地已下载的 APK
   */
  const installLocalUpdate = async () => {
    if (updateInfo) {
      const localUri = getLocalApkUri(updateInfo.downloadUrl);
      try {
        await installApk(localUri);
      } catch (e) {
        Alert.alert('安装失败', '无法打开安装程序');
      }
    }
  };

  const ignoreUpdate = async () => {
    if (updateInfo) {
      await AsyncStorage.setItem("ignored_version", updateInfo.version);
      setUpdateInfo(null);
    }
  };

  const cancelUpdate = () => {
    setUpdateInfo(null);
  };

  // 内部函数:调起系统下载管理器
  const startSystemDownload = async (url: string) => {
    setIsUpdating(true);
    setProgress(0);

    try {
      // 使用系统下载管理器
      await downloadWithSystemManager(url);

      // 系统下载管理器调起后,标记为已开始
      // 注意:系统下载是后台进行的,应用无法直接获取进度
      setProgress(0.1); // 标记为已开始

      // 提示用户
      Alert.alert(
        '已开始下载',
        '更新正在系统下载管理器中下载,完成后请在通知栏中点击安装。',
        [{ text: '知道了', onPress: () => {
          setIsUpdating(false);
          setUpdateInfo(null); // 关闭弹窗
        }}]
      );
    } catch (e) {
      console.error('系统下载调起失败:', e);
      Alert.alert('更新失败', '无法调起系统下载,请重试');
      setIsUpdating(false);
    }
  };

  // 返回:触发函数 + UI组件
  return {
    checkUpdate,
    progress,
    isUpdating,
    updateInfo,
    startUpdate,
    ignoreUpdate,
    cancelUpdate,
    installLocalUpdate,
    // 手动触发专用
    isChecking,
    checkResult,
    clearCheckResult,
  };
};