/**
 * Network utilities for server address auto-switching
 * Inspired by AudioDock's sourceUtils.ts
 */

export interface ServerConfig {
  internal: string;
  external: string;
  name?: string;
}

const STORAGE_KEY = 'bookdock_server_config';
const ACTIVE_SERVER_KEY = 'bookdock_server_address';
const DEFAULT_API_BASE_URL = 'http://localhost:8088/api';

export function toApiBaseUrl(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

/**
 * Load saved server config from localStorage
 */
export function loadServerConfig(): ServerConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
 * Save server config to localStorage
 */
export function saveServerConfig(config: ServerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
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
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${address.replace(/\/+$/, '')}/hello`, {
      method: 'GET',
      signal: controller.signal,
      // Allow CORS errors to pass through if server responds
      mode: 'cors',
    });

    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 500;
  } catch {
    // Network error or timeout
    return false;
  }
}

/**
 * Get current network type (best effort)
 */
export function getNetworkType(): { isWifi: boolean; isCellular: boolean; type: string } {
  const conn = (navigator as any).connection;
  const type = conn?.type || 'unknown';

  // In browser, we can only infer from connection type
  const isWifi = type === 'wifi' || type === 'ethernet';
  const isCellular = ['2g', '3g', '4g', '5g', 'cellular'].includes(type);

  return { isWifi, isCellular, type };
}

/**
 * Select the best server address based on network conditions
 * - WiFi: prefer internal, fallback to external
 * - Cellular: prefer external only
 * - Unknown: try both
 */
export async function selectBestServer(
  internalAddress: string,
  externalAddress: string,
): Promise<string | null> {
  const { isWifi, isCellular } = getNetworkType();

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
 * Returns the selected address or null
 */
export async function autoSelectServer(): Promise<string | null> {
  const config = loadServerConfig();
  if (!config.internal && !config.external) {
    return null;
  }

  const best = await selectBestServer(config.internal, config.external);
  if (best) {
    localStorage.setItem(ACTIVE_SERVER_KEY, toApiBaseUrl(best));
  }
  return best;
}

/**
 * Get the current active server address
 */
export function getActiveServerAddress(): string | null {
  return localStorage.getItem(ACTIVE_SERVER_KEY);
}

/**
 * Set the active server address
 */
export function setActiveServerAddress(address: string): void {
  localStorage.setItem(ACTIVE_SERVER_KEY, toApiBaseUrl(address));
}

export function getSavedApiBaseUrl(fallback = DEFAULT_API_BASE_URL): string {
  const activeAddress = getActiveServerAddress();
  if (activeAddress) return toApiBaseUrl(activeAddress);

  const config = loadServerConfig();
  const configuredAddress = config.internal || config.external;
  if (configuredAddress) return toApiBaseUrl(configuredAddress);

  return fallback;
}
