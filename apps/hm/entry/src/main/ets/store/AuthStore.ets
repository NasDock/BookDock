// [API 23+] store/AuthStore.ets — 1:1 对齐 mobile src/stores/authStore.ts
// mobile 用 zustand+persist+AsyncStorage,鸿蒙用 @Observed 单例 + PreferencesStore 持久化。
// 持久化键对齐 mobile zustand persist partialize:
//   user, token, isAuthenticated, plusUser, isVip, vipTier, vipExpiresAt
// 兼容的 key: bookdock-auth 整体 → 拆分到 PrefKey.AUTH_USER / AUTH_TOKEN / PLus_TOKEN / PLus_USER / VIP_TIER / VIP_EXPIRES
import { ApiResponse, User } from '../model/ApiModels';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { ApiClient, getApiClient } from '../network/ApiClient';
import {
  plusGetMe,
  setPlusToken,
  removePlusToken,
  setPlusUnauthorizedHandler,
  ISuccessResponse
} from '../network/PlusClient';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0007;
const TAG = 'AuthStore';

// AuthStore 的 Plus 用户对象(mobile 端 any 类型 → ArkTS 严格用具体字段)
export interface PlusUser {
  id?: string | number;
  vipTier?: string;
  level?: string;
  isVip?: boolean;
  expiredAt?: string;
  vipExpiresAt?: string;
}

@Observed
export class AuthStore {
  private static instance: AuthStore | null = null;

  user: User | null = null;
  token: string | null = null;
  isAuthenticated: boolean = false;
  isLoading: boolean = false;
  error: string | null = null;
  plusUser: PlusUser | null = null;
  isVip: boolean = false;
  vipTier: string | null = null;
  vipExpiresAt: string | null = null;

  // 让外部订阅当前状态变化(mobile useAuthStore hook 是订阅者模式,鸿蒙用 refresh 同步)
  private listeners: Array<() => void> = [];

  static shared(): AuthStore {
    if (!AuthStore.instance) {
      AuthStore.instance = new AuthStore();
    }
    return AuthStore.instance;
  }

  private notify(): void {
    const arr: Array<() => void> = this.listeners;
    for (const l of arr) {
      l();
    }
  }

  subscribe(l: () => void): () => void {
    this.listeners.push(l);
    return () => {
      const idx: number = this.listeners.indexOf(l);
      if (idx >= 0) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  // ─── 初始化:恢复持久化的 token/user ────────────────────────────

  async load(): Promise<void> {
    const t: string = await PreferencesStore.readString(PrefKey.AUTH_TOKEN, '');
    const uRaw: string = await PreferencesStore.readString(PrefKey.AUTH_USER, '');
    if (t) {
      this.token = t;
      this.isAuthenticated = true;
    }
    if (uRaw) {
      try {
        this.user = JSON.parse(uRaw) as User;
      } catch {
        this.user = null;
      }
    }
    const plusToken: string = await PreferencesStore.readString(PrefKey.PLus_TOKEN, '');
    if (plusToken) {
      setPlusToken(plusToken);
    }
    const plusUserRaw: string = await PreferencesStore.readString(PrefKey.PLus_USER, '');
    if (plusUserRaw) {
      try {
        this.plusUser = JSON.parse(plusUserRaw) as PlusUser;
      } catch {
        this.plusUser = null;
      }
    }
    this.vipTier = await PreferencesStore.readString(PrefKey.VIP_TIER, '');
    const expires: string = await PreferencesStore.readString(PrefKey.VIP_EXPIRES, '');
    this.vipExpiresAt = expires ? expires : null;
    this.isVip = this.vipTier === 'BASIC' || this.vipTier === 'LIFETIME';

    // 注册 plus 401 处理器:token 失效时清掉 +UI 后续读 AuthStore 自查
    setPlusUnauthorizedHandler((): void => {
      void this.clearPlusAuth();
    });
    this.notify();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.notify();
  }

  setError(error: string | null): void {
    this.error = error;
    this.notify();
  }

  setUser(user: User | null): void {
    this.user = user;
    this.isAuthenticated = !!user;
    this.notify();
  }

  setToken(token: string | null): void {
    this.token = token;
    this.notify();
  }

  /** mobile useAuthStore().login(user, token) 对齐 */
  async login(user: User, token: string): Promise<void> {
    this.user = user;
    this.token = token;
    this.isAuthenticated = true;
    this.isLoading = false;
    this.error = null;
    await PreferencesStore.writeString(PrefKey.AUTH_TOKEN, token);
    await PreferencesStore.writeObject<User>(PrefKey.AUTH_USER, user);
    this.notify();
  }

  /** mobile useAuthStore().logout() 对齐 — 同时清 4 个 plus 相关 key */
  async logout(): Promise<void> {
    this.user = null;
    this.token = null;
    this.isAuthenticated = false;
    this.error = null;
    this.plusUser = null;
    this.isVip = false;
    this.vipTier = null;
    this.vipExpiresAt = null;
    await PreferencesStore.delete(PrefKey.AUTH_TOKEN);
    await PreferencesStore.delete(PrefKey.AUTH_USER);
    await PreferencesStore.delete(PrefKey.PLus_TOKEN);
    await PreferencesStore.delete(PrefKey.PLus_USER);
    await PreferencesStore.delete(PrefKey.PLus_USER_ID);
    await PreferencesStore.delete(PrefKey.VIP_TIER);
    await PreferencesStore.delete(PrefKey.VIP_EXPIRES);
    removePlusToken();
    this.notify();
  }

  /** mobile restoreAuth() — token 已从磁盘恢复,verify 一下 */
  async restoreAuth(): Promise<void> {
    if (!this.token) {
      this.isLoading = false;
      await this.clearPlusAuth();
      return;
    }
    try {
      const api: ApiClient = getApiClient();
      const response: ApiResponse<User> = await api.getCurrentUser();
      if (response.success && response.data) {
        this.user = response.data;
        this.isAuthenticated = true;
        this.isLoading = false;
        await PreferencesStore.writeObject<User>(PrefKey.AUTH_USER, response.data);
      } else {
        // token 无效 — 清掉
        this.user = null;
        this.token = null;
        this.isAuthenticated = false;
        this.isLoading = false;
        await PreferencesStore.delete(PrefKey.AUTH_TOKEN);
        await PreferencesStore.delete(PrefKey.AUTH_USER);
        await this.clearPlusAuth();
      }
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'restoreAuth verify fail %{public}s', JSON.stringify(err));
      // 服务器不通时,保留缓存 user 不强制退出
      if (this.user) {
        this.isAuthenticated = true;
        this.isLoading = false;
      } else {
        this.isLoading = false;
      }
    }
    this.notify();
  }

  async refreshUser(): Promise<void> {
    try {
      const api: ApiClient = getApiClient();
      const response: ApiResponse<User> = await api.getCurrentUser();
      if (response.success && response.data) {
        this.user = response.data;
        await PreferencesStore.writeObject<User>(PrefKey.AUTH_USER, response.data);
        this.notify();
      }
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'refreshUser fail %{public}s', JSON.stringify(err));
    }
  }

  /** mobile refreshVipStatus — 读缓存 + 调用 plusGetMe */
  async refreshVipStatus(): Promise<boolean> {
    try {
      const storedRaw: string = await PreferencesStore.readString(PrefKey.PLus_USER, '');
      let parsed: PlusUser | null = null;
      if (storedRaw) {
        try {
          parsed = JSON.parse(storedRaw) as PlusUser;
        } catch {
          parsed = null;
        }
      }
      if (!parsed || parsed.id === undefined || parsed.id === null) {
        const idStr: string = await PreferencesStore.readString(PrefKey.PLus_USER_ID, '');
        if (idStr) {
          try {
            const idVal: string | number = JSON.parse(idStr) as string | number;
            parsed = { id: idVal };
          } catch {
            parsed = null;
          }
        }
      }
      if (!parsed || parsed.id === undefined || parsed.id === null) {
        await this.clearPlusAuth();
        return false;
      }
      const idStr = String(parsed.id);
      try {
        const res: ISuccessResponse<PlusUser> =
          await plusGetMe(idStr) as ISuccessResponse<PlusUser>;
        if (res.code === 200 && res.data) {
          const me: PlusUser = res.data;
          const currentTier: string = me.vipTier ?? '';
          const isVipNow: boolean = currentTier === 'BASIC' || currentTier === 'LIFETIME';
          const updated: PlusUser = {
            id: parsed.id,
            vipTier: me.vipTier ?? parsed.vipTier,
            level: currentTier === 'LIFETIME' ? 'lifetime' : currentTier === 'BASIC' ? 'year' : (parsed.level ?? 'free'),
            isVip: isVipNow,
            expiredAt: me.vipExpiresAt ?? parsed.expiredAt,
            vipExpiresAt: me.vipExpiresAt ?? parsed.vipExpiresAt,
          };
          await PreferencesStore.writeObject<PlusUser>(PrefKey.PLus_USER, updated);
          this.isVip = isVipNow;
          this.vipTier = currentTier || null;
          this.vipExpiresAt = me.vipExpiresAt ?? null;
          this.plusUser = updated;
          this.notify();
          return isVipNow;
        }
      } catch {
        // 网络错误走本地缓存兜底
      }
      const cachedTier: string = parsed.vipTier ?? '';
      let tier: string = cachedTier;
      if (!tier && parsed.level === 'lifetime') {
        tier = 'LIFETIME';
      } else if (!tier && parsed.level === 'year') {
        tier = 'BASIC';
      }
      const hasMembershipInfo = !!tier || parsed.isVip === true || !!parsed.expiredAt || !!parsed.vipExpiresAt;
      if (!hasMembershipInfo) {
        return this.isVip;
      }
      const isVipNow: boolean = tier === 'BASIC' || tier === 'LIFETIME' || parsed.isVip === true;
      this.isVip = isVipNow;
      this.vipTier = tier || null;
      this.vipExpiresAt = parsed.expiredAt ?? parsed.vipExpiresAt ?? null;
      this.plusUser = parsed;
      this.notify();
      return isVipNow;
    } catch {
      this.isVip = false;
      this.vipTier = null;
      this.vipExpiresAt = null;
      this.plusUser = null;
      this.notify();
      return false;
    }
  }

  setPlusUser(user: PlusUser | null): void {
    if (user) {
      let tier: string = user.vipTier ?? '';
      if (!tier && user.level === 'lifetime') {
        tier = 'LIFETIME';
      } else if (!tier && user.level === 'year') {
        tier = 'BASIC';
      }
      const isVipNow: boolean = tier === 'BASIC' || tier === 'LIFETIME';
      const updated: PlusUser = {
        id: user.id,
        vipTier: tier || undefined,
        level: user.level,
        isVip: isVipNow,
        expiredAt: user.expiredAt,
        vipExpiresAt: user.vipExpiresAt,
      };
      void PreferencesStore.writeObject<PlusUser>(PrefKey.PLus_USER, updated);
      this.plusUser = updated;
      this.isVip = isVipNow;
      this.vipTier = (tier || null) as string | null;
      this.vipExpiresAt = user.expiredAt ?? user.vipExpiresAt ?? null;
    } else {
      void PreferencesStore.delete(PrefKey.PLus_USER);
      this.plusUser = null;
      this.isVip = false;
      this.vipTier = null;
      this.vipExpiresAt = null;
    }
    this.notify();
  }

  async clearPlusAuth(): Promise<void> {
    await PreferencesStore.delete(PrefKey.PLus_TOKEN);
    await PreferencesStore.delete(PrefKey.PLus_USER);
    await PreferencesStore.delete(PrefKey.PLus_USER_ID);
    removePlusToken();
    this.plusUser = null;
    this.isVip = false;
    this.vipTier = null;
    this.vipExpiresAt = null;
    this.notify();
  }
}

export function getAuthToken(): string | null {
  return AuthStore.shared().token;
}