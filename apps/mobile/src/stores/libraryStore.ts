/**
 * libraryStore.ts — mobile2 版本
 * 直接复制自 mobile/src/stores/libraryStore.ts。
 *
 * 注:SettingsScreen 不直接引用 libraryStore,但因为它管 books / 阅读进度 / collections,
 * 是 mobile 全局的一部分,保持完整。
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { getApiClient, type Book } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';

interface ReadingProgress {
  bookId: string;
  position: ReaderPosition;
  lastReadAt: string;
}

interface LibraryState {
  books: Book[];
  isLoading: boolean;
  error: string | null;
  lastSyncAt: string | null;
  viewMode: 'grid' | 'list';
  sortBy: 'title' | 'author' | 'addedAt' | 'lastReadAt';
  sortOrder: 'asc' | 'desc';

  // Reading progress
  progressMap: Record<string, ReadingProgress>;

  /**
   * 已下载到本地的书籍路径表（key=bookId, value=绝对路径）。
   * 同步查询由 getLocalBookPath 提供——ReaderScreen 渲染前要先决定走本地还是远端，
   * 不可能在 render 阶段 await 异步 IO。
   */
  localBookPaths: Record<string, string>;

  // Actions
  setBooks: (books: Book[]) => void;
  addBook: (book: Book) => void;
  updateBook: (bookId: string, data: Partial<Book>) => void;
  removeBook: (bookId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setSortBy: (sortBy: 'title' | 'author' | 'addedAt' | 'lastReadAt') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;

  /**
   * fetchBooks — 从服务器拉取书库列表。1:1 对齐 mobile 旧版行为。
   * 成功:写入 books / lastSyncAt,清 error。失败:写 error,isLoading=false。
   * 推荐页/书库页都通过 useFocusEffect 调它。
   */
  fetchBooks: () => Promise<void>;

  // Progress actions
  saveProgress: (bookId: string, position: ReaderPosition) => Promise<void>;
  /**
   * saveReadingProgress — saveProgress 的别名。ReaderScreen 1:1 复刻自 mobile，
   * mobile 旧版 store 叫 saveReadingProgress；mobile2 改成 saveProgress 后，
   * 直接补这个别名让 ReaderScreen 无需改 callsite。
   */
  saveReadingProgress: (bookId: string, position: ReaderPosition) => Promise<void>;
  getProgress: (bookId: string) => ReadingProgress | null;
  loadReadingProgress: () => Promise<void>;
  clearProgress: (bookId: string) => Promise<void>;

  // 本地离线阅读相关 — ReaderScreen 用
  /**
   * getLocalBookPath — 同步查一本书的本地绝对路径。未下载返回 null。
   * 真实文件是否仍在磁盘上由调用方用 RNFS.exists 二次确认（用户可能外部删了）。
   */
  getLocalBookPath: (bookId: string) => string | null;
  /**
   * downloadBook — 从远端拉整本书落到 ${DocumentDirectoryPath}/books/${id}.${ext}，
   * 写完更新 localBookPaths 并 persist。返回本地绝对路径。
   */
  downloadBook: (book: Book) => Promise<string>;
  /**
   * removeLocalBook — 删除本地文件 + 清理 localBookPaths。
   * 暂未在 ReaderScreen 调用,留接口方便后续 Settings/书架页做"删除离线缓存"。
   */
  removeLocalBook: (bookId: string) => Promise<void>;
}

// 在 RN 里没有原生 Buffer/btoa — 把 ArrayBuffer 转 base64 给 RNFS.writeFile 用
// axios 在 RN 下 responseType:'arraybuffer' 可能返回 Uint8Array / polyfill Buffer,
// 统一按 Uint8Array 处理最稳。
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
  const len = bytes.byteLength;
  let binary = '';
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // RN 0.81 Hermes 内置 btoa（globalThis.btoa），fallback 用手写
  if (typeof (globalThis as any).btoa === 'function') {
    return (globalThis as any).btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    out += chars[b1 >> 2];
    out += chars[((b1 & 0x03) << 4) | (b2 >> 4)];
    out += i + 1 < len ? chars[((b2 & 0x0f) << 2) | (b3 >> 6)] : '=';
    out += i + 2 < len ? chars[b3 & 0x3f] : '=';
  }
  return out;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      isLoading: false,
      error: null,
      lastSyncAt: null,
      viewMode: 'grid',
      sortBy: 'addedAt',
      sortOrder: 'desc',
      progressMap: {},
      localBookPaths: {},

      setBooks: (books) => set({ books, lastSyncAt: new Date().toISOString() }),

      addBook: (book) => set((state) => ({
        books: [...state.books, book],
      })),

      updateBook: (bookId, data) => set((state) => ({
        books: state.books.map((b) => (b.id === bookId ? { ...b, ...data } : b)),
      })),

      removeBook: (bookId) => set((state) => ({
        books: state.books.filter((b) => b.id !== bookId),
      })),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      setViewMode: (viewMode) => set({ viewMode }),

      setSortBy: (sortBy) => set({ sortBy }),

      setSortOrder: (sortOrder) => set({ sortOrder }),

      fetchBooks: async () => {
        set({ isLoading: true, error: null });
        try {
          const api = getApiClient();
          const res = await api.getBooks();
          if (res.success && res.data) {
            // 后端可能返回 {books, total, ...} 或 {items};两种形状都接
            const items = (res.data as any).books ?? (res.data as any).items ?? [];
            set({ books: items, lastSyncAt: new Date().toISOString() });
          } else {
            set({ error: res.error || 'Failed to fetch books' });
          }
        } catch (e: any) {
          set({ error: e?.message || 'Network error' });
        } finally {
          set({ isLoading: false });
        }
      },

      saveProgress: async (bookId, position) => {
        const lastReadAt = new Date().toISOString();
        set((state) => ({
          progressMap: {
            ...state.progressMap,
            [bookId]: { bookId, position, lastReadAt },
          },
        }));

        // Also persist to AsyncStorage for offline-first sync
        try {
          await AsyncStorage.setItem(
            `bookdock-reading-progress_${bookId}`,
            JSON.stringify({ position, lastReadAt })
          );
        } catch (e) {
          console.error('Failed to save reading progress:', e);
        }
      },

      // 别名 — ReaderScreen 调的是这个名
      saveReadingProgress: async (bookId, position) => {
        return get().saveProgress(bookId, position);
      },

      getProgress: (bookId) => {
        return get().progressMap[bookId] || null;
      },

      loadReadingProgress: async () => {
        try {
          const keys = await AsyncStorage.getAllKeys();
          const progressKeys = keys.filter((k) => k.startsWith('bookdock-reading-progress_'));
          const progressMap: Record<string, ReadingProgress> = {};
          for (const key of progressKeys) {
            const data = await AsyncStorage.getItem(key);
            if (data) {
              try {
                const parsed = JSON.parse(data);
                const bookId = key.replace('bookdock-reading-progress_', '');
                progressMap[bookId] = {
                  bookId,
                  position: parsed.position,
                  lastReadAt: parsed.lastReadAt,
                };
              } catch {
                // skip malformed
              }
            }
          }
          set({ progressMap });
        } catch (e) {
          console.error('Failed to load reading progress:', e);
        }
      },

      clearProgress: async (bookId) => {
        set((state) => {
          const newMap = { ...state.progressMap };
          delete newMap[bookId];
          return { progressMap: newMap };
        });
        try {
          await AsyncStorage.removeItem(`bookdock-reading-progress_${bookId}`);
        } catch (e) {
          console.error('Failed to clear reading progress:', e);
        }
      },

      // ─── 本地离线阅读 ──────────────────────────────────────────
      getLocalBookPath: (bookId) => {
        return get().localBookPaths[bookId] ?? null;
      },

      downloadBook: async (book) => {
        const api = getApiClient();
        const arrayBuffer = await api.getBookFile(book.id);
        // 转 base64 给 RNFS.writeFile 的 'base64' 编码路径用
        const base64 = arrayBufferToBase64(arrayBuffer);

        const booksDir = `${RNFS.DocumentDirectoryPath}/books/`;
        const dirExists = await RNFS.exists(booksDir);
        if (!dirExists) {
          await RNFS.mkdir(booksDir);
        }

        const ext = (book.fileType || book.format || 'txt').toLowerCase();
        const safeId = book.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const localPath = `${booksDir}${safeId}.${ext}`;
        await RNFS.writeFile(localPath, base64, 'base64');

        set((state) => ({
          localBookPaths: {
            ...state.localBookPaths,
            [book.id]: localPath,
          },
        }));

        return localPath;
      },

      removeLocalBook: async (bookId) => {
        const path = get().localBookPaths[bookId];
        if (path) {
          try {
            const exists = await RNFS.exists(path);
            if (exists) await RNFS.unlink(path);
          } catch (e) {
            console.error('Failed to remove local book file:', e);
          }
        }
        set((state) => {
          const next = { ...state.localBookPaths };
          delete next[bookId];
          return { localBookPaths: next };
        });
      },
    }),
    {
      name: 'bookdock-library',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        progressMap: state.progressMap,
        localBookPaths: state.localBookPaths,
      }),
    }
  )
);

// Helper function for external components to trigger loading progress
export const loadReadingProgress = async () => {
  return useLibraryStore.getState().loadReadingProgress();
};