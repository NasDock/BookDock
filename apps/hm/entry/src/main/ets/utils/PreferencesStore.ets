// [API 23+] utils/PreferencesStore.ets — 1:1 对齐 mobile zustand+AsyncStorage 持久化行为
// 单一 store 文件,key 集中管理;读写采用 JSON 序列化,覆盖 string / number / boolean / object / array。
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { util } from '@kit.ArkTS';

const DOMAIN = 0x0002;
const TAG = 'PreferencesStore';
const STORE_NAME = 'bookdock-hm';

// preferences.Preferences.getAll 返回的 value 包装
interface PreferencesValue {
  value: string | number | boolean;
}

// 持久化键集中管理(mobile 端持久化键对齐 — 来自 zustand persist 的 name + subKey)
export class PrefKey {
  static readonly AUTH_TOKEN = 'auth_token';
  static readonly AUTH_USER = 'auth_user';
  static readonly PLus_TOKEN = 'plus_token';
  static readonly PLus_USER = 'plus_user';
  static readonly PLus_USER_ID = 'plus_user_id';
  static readonly VIP_TIER = 'vip_tier';
  static readonly VIP_EXPIRES = 'vip_expires';
  static readonly THEME_MODE = 'theme_mode'; // light / dark / system
  static readonly LIBRARY_VIEW = 'library_view_mode'; // grid / list
  static readonly LIBRARY_SORT_BY = 'library_sort_by';
  static readonly LIBRARY_SORT_ORDER = 'library_sort_order';
  static readonly READER_PREFS = 'reader_prefs'; // fontSize/lineHeight/theme 等
  static readonly TTS_PREFS = 'tts_prefs';
  static readonly READING_PROGRESS = 'reading_progress'; // 整体表 + 单书粒度
  static readonly LOCAL_BOOK_PATHS = 'local_book_paths';
  static readonly API_BASE_URL = 'api_base_url';
  static readonly FIRST_LAUNCH = 'first_launch';
  // P1 网络配置(mobile bookdock_server_config / bookdock_server_address 对齐)
  static readonly SERVER_CONFIG = 'server_config';
  static readonly ACTIVE_API_BASE_URL = 'active_api_base_url';
  // P1 凭据缓存(creds_BookDock_{apiBaseUrl},自动回填用户名密码)
  static readonly CRED_PREFIX = 'creds_';
}

interface PreferencesHolder {
  store: preferences.Preferences;
}

let holder: PreferencesHolder | null = null;
let initPromise: Promise<PreferencesHolder> | null = null;

async function ensureStore(context: common.UIAbilityContext): Promise<PreferencesHolder> {
  if (holder) {
    return holder;
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    const store = await preferences.getPreferences(context, STORE_NAME);
    holder = { store };
    return holder;
  })();
  return initPromise;
}

export class PreferencesStore {
  private static context: common.UIAbilityContext | null = null;

  /** 在 EntryAbility.onCreate 内调用一次,后续所有接口直接拿 context */
  static init(context: common.UIAbilityContext): void {
    PreferencesStore.context = context;
  }

  private static async getHolder(): Promise<PreferencesHolder> {
    if (!PreferencesStore.context) {
      throw new Error('PreferencesStore not initialized. Call PreferencesStore.init(context) in EntryAbility.onCreate.');
    }
    return ensureStore(PreferencesStore.context);
  }

  // ─── 基础读写 ─────────────────────────────────────────────────

  static async readString(key: string, fallback: string = ''): Promise<string> {
    const h = await PreferencesStore.getHolder();
    return (await h.store.get(key, fallback)) as string;
  }

  static async readNumber(key: string, fallback: number = 0): Promise<number> {
    const h = await PreferencesStore.getHolder();
    return (await h.store.get(key, fallback)) as number;
  }

  static async readBool(key: string, fallback: boolean = false): Promise<boolean> {
    const h = await PreferencesStore.getHolder();
    return (await h.store.get(key, fallback)) as boolean;
  }

  static async readObject<T>(key: string, fallback: T): Promise<T> {
    const raw = await PreferencesStore.readString(key, '');
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'readObject parse fail key=%{public}s', key);
      return fallback;
    }
  }

  static async writeString(key: string, value: string): Promise<void> {
    const h = await PreferencesStore.getHolder();
    await h.store.put(key, value);
    await h.store.flush();
  }

  static async writeNumber(key: string, value: number): Promise<void> {
    const h = await PreferencesStore.getHolder();
    await h.store.put(key, value);
    await h.store.flush();
  }

  static async writeBool(key: string, value: boolean): Promise<void> {
    const h = await PreferencesStore.getHolder();
    await h.store.put(key, value);
    await h.store.flush();
  }

  static async writeObject<T>(key: string, value: T): Promise<void> {
    const json = JSON.stringify(value);
    await PreferencesStore.writeString(key, json);
  }

  static async delete(key: string): Promise<void> {
    const h = await PreferencesStore.getHolder();
    await h.store.delete(key);
    await h.store.flush();
  }

  static async has(key: string): Promise<boolean> {
    const h = await PreferencesStore.getHolder();
    return (await h.store.has(key));
  }

  static async clear(): Promise<void> {
    const h = await PreferencesStore.getHolder();
    await h.store.clear();
    await h.store.flush();
  }

  // ─── 工具:删除多个 key ────────────────────────────────────────

  static async deleteMany(keys: string[]): Promise<void> {
    for (const k of keys) {
      await PreferencesStore.delete(k);
    }
  }

  // ─── 工具:导出字符串集合(用于恢复一次历史值) ───────────────

  static async exportAll(): Promise<Map<string, string>> {
    const h = await PreferencesStore.getHolder();
    const all = await h.store.getAll();
    const out: Map<string, string> = new Map();
    // Object.keys + Object.values 是同步遍历的两条平行数组,通过下标对齐避免 Record 的 [key] 索引访问
    const allKeys: string[] = Object.keys(all);
    const allValues: object[] = Object.values(all);
    for (let i = 0; i < allKeys.length; i++) {
      const k: string = allKeys[i];
      const v: object = allValues[i];
      const entry: PreferencesValue = v as PreferencesValue;
      const rawVal = entry.value;
      if (typeof rawVal === 'string') {
        out.set(k, rawVal);
      } else if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
        out.set(k, String(rawVal));
      }
    }
    return out;
  }
}
