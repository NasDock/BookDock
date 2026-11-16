// [API 23+] utils/NetworkHelper.ets — 1:1 对齐 mobile src/utils/network.ts
// 提供 server config 持久化 + 内/外网优选 + active address 记忆 + ApiBaseUrl 规范化。
// mobile 用 @react-native-community/netinfo 判 WiFi/蜂窝;
// 鸿蒙侧在 P1 阶段走双地址探测的兜底路径(不依赖 NetCapabilities)。
import { http } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { PrefKey, PreferencesStore } from './PreferencesStore';

const DOMAIN = 0x0005;
const TAG = 'NetworkHelper';
const PROBE_TIMEOUT_MS = 8000;
const DEFAULT_API_BASE_URL = 'http://localhost:8088/api';

export interface ServerConfig {
  internal: string;
  external: string;
  name?: string;
}

export function toApiBaseUrl(address: string): string {
  const trimmed = (address || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function toServerBaseUrl(address: string): string {
  return (address || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

export async function loadServerConfig(): Promise<ServerConfig> {
  const raw = await PreferencesStore.readObject<ServerConfig>(PrefKey.SERVER_CONFIG, { internal: '', external: '' });
  return raw;
}

export async function saveServerConfig(config: ServerConfig): Promise<void> {
  const persisted: ServerConfig = {
    internal: config.internal ? toApiBaseUrl(config.internal) : '',
    external: config.external ? toApiBaseUrl(config.external) : '',
    name: config.name,
  };
  await PreferencesStore.writeObject<ServerConfig>(PrefKey.SERVER_CONFIG, persisted);
}

export async function getActiveServerAddress(): Promise<string | null> {
  const v = await PreferencesStore.readString(PrefKey.ACTIVE_API_BASE_URL, '');
  return v ? v : null;
}

export async function setActiveServerAddress(address: string): Promise<void> {
  await PreferencesStore.writeString(PrefKey.ACTIVE_API_BASE_URL, toApiBaseUrl(address));
}

/** mobile selectBestServer 思路对齐 */
export async function checkServerConnectivity(address: string): Promise<boolean> {
  if (!address) {
    return false;
  }
  if (!address.startsWith('http://') && !address.startsWith('https://')) {
    return false;
  }
  try {
    const url = `${toServerBaseUrl(address)}/hello`;
    const req = http.createHttp();
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.GET,
      connectTimeout: PROBE_TIMEOUT_MS,
      readTimeout: PROBE_TIMEOUT_MS,
      expectDataType: http.HttpDataType.STRING,
    };
    const resp = await req.request(url, options);
    req.destroy();
    return resp.responseCode >= 200 && resp.responseCode < 500;
  } catch (err) {
    hilog.warn(DOMAIN, TAG, 'checkServerConnectivity %{public}s fail %{public}s', address, JSON.stringify(err));
    return false;
  }
}

export interface NetworkTypeInfo {
  isWifi: boolean;
  isCellular: boolean;
  type: string;
}

/**
 * 鸿蒙侧 networkManager 在权限未授权时可能抛错 → 兜底 unknown,
 * P1 阶段不依赖 NetCapabilities 遍历,直接返回 unknown 走双地址探测。
 */
export async function getNetworkType(): Promise<NetworkTypeInfo> {
  return { isWifi: false, isCellular: false, type: 'unknown' };
}

export async function selectBestServer(internalAddress: string, externalAddress: string): Promise<string | null> {
  const net = await getNetworkType();
  hilog.info(DOMAIN, TAG, 'selectBestServer netType=%{public}s wifi=%{public}s cellular=%{public}s',
    net.type, net.isWifi, net.isCellular);
  const candidates: string[] = [];
  if (internalAddress && externalAddress) {
    if (net.isWifi) {
      candidates.push(internalAddress, externalAddress);
    } else if (net.isCellular) {
      candidates.push(externalAddress);
    } else {
      candidates.push(internalAddress, externalAddress);
    }
  } else {
    if (internalAddress) {
      candidates.push(internalAddress);
    }
    if (externalAddress) {
      candidates.push(externalAddress);
    }
  }
  for (const c of candidates) {
    if (await checkServerConnectivity(c)) {
      hilog.info(DOMAIN, TAG, 'selectBestServer picked=%{public}s', c);
      return c;
    }
  }
  hilog.warn(DOMAIN, TAG, 'selectBestServer none reachable');
  return null;
}

export async function autoSelectServer(): Promise<string | null> {
  const cfg = await loadServerConfig();
  if (!cfg.internal && !cfg.external) {
    return null;
  }
  const best = await selectBestServer(cfg.internal, cfg.external);
  if (best) {
    await setActiveServerAddress(best);
  }
  return best;
}

export async function getSavedApiBaseUrl(fallback: string = DEFAULT_API_BASE_URL): Promise<string> {
  const active = await getActiveServerAddress();
  if (active) {
    return toApiBaseUrl(active);
  }
  const cfg = await loadServerConfig();
  const configured = cfg.internal || cfg.external;
  if (configured) {
    return toApiBaseUrl(configured);
  }
  return fallback;
}