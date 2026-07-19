import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
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

export const useCheckUpdate = () => {
  // UI 状态
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const checkUpdate = async () => {
    if (Platform.OS !== 'android') return;

    try {
      // 1. 从 audiodock 接口获取最新版本和实际下载地址
      const downloadRes = await fetch(DOWNLOAD_API_URL);
      const downloadData: DownloadApiResponse = await downloadRes.json();
      if (downloadData.code !== 200 || !downloadData.data) {
        console.error('audiodock 下载接口返回异常:', downloadData.message);
        return;
      }

      const remoteVersion = downloadData.data.version;
      const androidFile = downloadData.data.files.find((f) => f.platform === 'android');
      if (!androidFile || !androidFile.url) {
        console.log(`Version ${remoteVersion} found but no Android download URL.`);
        return;
      }

      const downloadUrl = androidFile.url;
      console.log(`Found APK from audiodock: ${downloadUrl}`);

      // 2. 保留从 GitHub 获取更新内容（release notes）
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
        console.warn('从 GitHub 获取 release 说明失败，使用默认文案', e);
      }

      const localVersion = getLocalVersion();

      console.log(`本地: ${localVersion}, 线上: ${remoteVersion}`);

      // Check ignore
      const ignoredVersion = await AsyncStorage.getItem("ignored_version");
      if (remoteVersion === ignoredVersion) {
        console.log(`Version ${remoteVersion} is ignored.`);
        return;
      }

      // 3. 比对版本并展示更新
      if (compareVersions(remoteVersion, localVersion) === 1) {
        setUpdateInfo({
          version: remoteVersion,
          body,
          downloadUrl: downloadUrl
        });

        // 检查本地是否已经下载过
        const exists = await checkLocalApkExists(downloadUrl);
        if (exists) {
          setProgress(1); // 如果已存在，直接标记进度为完成
        } else {
          setProgress(0);
        }
      }
    } catch (error) {
      console.error('检查更新失败', error);
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

  // 内部函数：调起系统下载管理器
  const startSystemDownload = async (url: string) => {
    setIsUpdating(true);
    setProgress(0);

    try {
      // 使用系统下载管理器
      await downloadWithSystemManager(url);
      
      // 系统下载管理器调起后，标记为已开始
      // 注意：系统下载是后台进行的，应用无法直接获取进度
      setProgress(0.1); // 标记为已开始
      
      // 提示用户
      Alert.alert(
        '已开始下载',
        '更新正在系统下载管理器中下载，完成后请在通知栏中点击安装。',
        [{ text: '知道了', onPress: () => {
          setIsUpdating(false);
          setUpdateInfo(null); // 关闭弹窗
        }}]
      );
    } catch (e) {
      console.error('系统下载调起失败:', e);
      Alert.alert('更新失败', '无法调起系统下载，请重试');
      setIsUpdating(false);
    }
  };

  // 返回：触发函数 + UI组件
  return {
    checkUpdate,
    progress,
    isUpdating,
    updateInfo,
    startUpdate,
    ignoreUpdate,
    cancelUpdate,
    installLocalUpdate
  };
};
