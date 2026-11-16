/**
 * Network utilities for server address auto-switching
 * Inspired by AudioDock's sourceUtils.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

export interface ServerConfig {
  internal: string;
  external: string;
  name?: string;
}

const STORAGE_KEY = 'bookdock_server_config';
const ACTIVE_ADDRESS_KEY = 'bookdock_server_address';
const DEFAULT_API_BASE_URL = 'http://localhost:8088/api';

export function toApiBaseUrl(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function toServerBaseUrl(address: string): string {
  return address.trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

/**
 * Load saved server config from AsyncStorage
 */
export async function loadServerConfig(): Promise<ServerConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        internal: parsed.internal || '',
        external: parsed.external || '',
        name: parsed.name || 'Default',
      };
    }
  } catch {
    // ignore
  }
  return { internal: '', external: '' };
}

/**
 * Save server config to AsyncStorage
 */
export async function saveServerConfig(config: ServerConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...config,
    internal: config.internal ? toApiBaseUrl(config.internal) : '',
    external: config.external ? toApiBaseUrl(config.external) : '',
  }));
}

/**
 * Check if a server address is reachable
 */
export async function checkServerConnectivity(address: string): Promise<boolean> {
  if (!address) return false;
  if (!address.startsWith('http://') && !address.startsWith('https://')) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${toServerBaseUrl(address)}/hello`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Get current network type using NetInfo
 */
export async function getNetworkType(): Promise<{ isWifi: boolean; isCellular: boolean; type: string }> {
  const state = await NetInfo.fetch();
  const type = state.type || 'unknown';
  // 华为/OPPO 等国产 ROM 可能返回 'unknown' 但确实是 WiFi，增加 isConnected 兜底
  const isWifi = type === 'wifi' || (type === 'unknown' && state.isConnected === true && !state.isInternetReachable);
  const isCellular = ['cellular', '2g', '3g', '4g', '5g'].includes(type);

  console.log('[NetInfo] type:', type, 'isConnected:', state.isConnected, 'details:', JSON.stringify(state.details));
  return { isWifi, isCellular, type };
}

/**
 * Select the best server address based on network conditions
 */
export async function selectBestServer(
  internalAddress: string,
  externalAddress: string,
): Promise<string | null> {
  const { isWifi, isCellular } = await getNetworkType();

  console.log('[Network] Type:', isWifi ? 'WiFi' : isCellular ? 'Cellular' : 'Unknown');
  console.log('[Network] Candidates:', { internalAddress, externalAddress });

  const candidates: string[] = [];

  if (internalAddress && externalAddress) {
    if (isWifi) {
      candidates.push(internalAddress, externalAddress);
    } else if (isCellular) {
      candidates.push(externalAddress);
    } else {
      candidates.push(internalAddress, externalAddress);
    }
  } else {
    if (internalAddress) candidates.push(internalAddress);
    if (externalAddress) candidates.push(externalAddress);
  }

  for (const candidate of candidates) {
    const alive = await checkServerConnectivity(candidate);
    if (alive) {
      console.log('[Network] Selected:', candidate);
      return candidate;
    }
  }

  console.warn('[Network] No server reachable');
  return null;
}

/**
 * Auto-detect and switch to best server on startup
 */
export async function autoSelectServer(): Promise<string | null> {
  const config = await loadServerConfig();
  if (!config.internal && !config.external) {
    return null;
  }

  const best = await selectBestServer(config.internal, config.external);
  if (best) {
    await AsyncStorage.setItem(ACTIVE_ADDRESS_KEY, toApiBaseUrl(best));
  }
  return best;
}

/**
 * Get the current active server address
 */
export async function getActiveServerAddress(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_ADDRESS_KEY);
}

/**
 * Set the active server address
 */
export async function setActiveServerAddress(address: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ADDRESS_KEY, toApiBaseUrl(address));
}

export async function getSavedApiBaseUrl(fallback = DEFAULT_API_BASE_URL): Promise<string> {
  const activeAddress = await getActiveServerAddress();
  if (activeAddress) return toApiBaseUrl(activeAddress);

  const config = await loadServerConfig();
  const configuredAddress = config.internal || config.external;
  if (configuredAddress) return toApiBaseUrl(configuredAddress);

  return fallback;
}
