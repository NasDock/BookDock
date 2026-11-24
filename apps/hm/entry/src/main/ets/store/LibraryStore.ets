// [API 23+] store/LibraryStore.ets — 1:1 对齐 mobile src/stores/libraryStore.ts
// mobile 用 zustand+persist+AsyncStorage,鸿蒙用 @Observed 单例 + PreferencesStore 持久化。
// 持久化键:LIBRARY_VIEW / LIBRARY_SORT_BY / LIBRARY_SORT_ORDER
// P2 阶段暂不包含 downloadBook/removeLocalBook(等 P5 离线阅读),
// 但保留 localBookPaths 字段位,ReaderScreen 用。
import { Book, BooksListResponse, ApiResponse } from '../model/ApiModels';
import { ApiClient, getApiClient } from '../network/ApiClient';
import { PrefKey, PreferencesStore } from '../utils/PreferencesStore';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0008;
const TAG = 'LibraryStore';

export type LibraryViewMode = 'grid' | 'list';
export type LibrarySortBy = 'title' | 'author' | 'addedAt' | 'lastReadAt';
export type LibrarySortOrder = 'asc' | 'desc';

@Observed
export class LibraryStore {
  private static instance: LibraryStore | null = null;

  books: Book[] = [];
  isLoading: boolean = false;
  error: string | null = null;
  lastSyncAt: string | null = null;
  viewMode: LibraryViewMode = 'grid';
  sortBy: LibrarySortBy = 'addedAt';
  sortOrder: LibrarySortOrder = 'desc';

  // P5 离线阅读占位(暂不读写,P2 保持字段)
  localBookPaths: Map<string, string> = new Map<string, string>();

  private listeners: Array<() => void> = [];

  static shared(): LibraryStore {
    if (!LibraryStore.instance) {
      LibraryStore.instance = new LibraryStore();
    }
    return LibraryStore.instance;
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

  // ─── 初始化:恢复持久化的 view/sort ────────────────────────────
  async load(): Promise<void> {
    const view: string = await PreferencesStore.readString(PrefKey.LIBRARY_VIEW, 'grid');
    const sortBy: string = await PreferencesStore.readString(PrefKey.LIBRARY_SORT_BY, 'addedAt');
    const sortOrder: string = await PreferencesStore.readString(PrefKey.LIBRARY_SORT_ORDER, 'desc');
    this.viewMode = view === 'list' ? 'list' : 'grid';
    if (sortBy === 'title' || sortBy === 'author' || sortBy === 'addedAt' || sortBy === 'lastReadAt') {
      this.sortBy = sortBy;
    }
    this.sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
    this.notify();
  }

  setBooks(books: Book[]): void {
    this.books = books;
    this.lastSyncAt = new Date().toISOString();
    this.notify();
  }

  addBook(book: Book): void {
    const next: Book[] = this.books.concat([book]);
    this.books = next;
    this.notify();
  }

  updateBook(bookId: string, data: Partial<Book>): void {
    this.books = this.books.map((b: Book): Book => {
      if (b.id !== bookId) {
        return b;
      }
      // ArkTS 禁对象 spread,逐字段 merge(仅覆盖 data 里定义了的字段)
      const merged: Book = {
        id: b.id,
        title: data.title ?? b.title,
        author: data.author ?? b.author,
        authors: data.authors ?? b.authors,
        coverUrl: data.coverUrl ?? b.coverUrl,
        format: data.format ?? b.format,
        fileType: data.fileType ?? b.fileType,
        filePath: data.filePath ?? b.filePath,
        fileSize: data.fileSize ?? b.fileSize,
        addedAt: data.addedAt ?? b.addedAt,
        lastReadAt: data.lastReadAt ?? b.lastReadAt,
        readingProgress: data.readingProgress ?? b.readingProgress,
        totalPages: data.totalPages ?? b.totalPages,
        currentPage: data.currentPage ?? b.currentPage,
        description: data.description ?? b.description,
        publisher: data.publisher ?? b.publisher,
        language: data.language ?? b.language,
        isbn: data.isbn ?? b.isbn
      };
      return merged;
    });
    this.notify();
  }

  removeBook(bookId: string): void {
    this.books = this.books.filter((b: Book): boolean => b.id !== bookId);
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

  setViewMode(mode: LibraryViewMode): void {
    this.viewMode = mode;
    void PreferencesStore.writeString(PrefKey.LIBRARY_VIEW, mode);
    this.notify();
  }

  setSortBy(sortBy: LibrarySortBy): void {
    this.sortBy = sortBy;
    void PreferencesStore.writeString(PrefKey.LIBRARY_SORT_BY, sortBy);
    this.notify();
  }

  setSortOrder(order: LibrarySortOrder): void {
    this.sortOrder = order;
    void PreferencesStore.writeString(PrefKey.LIBRARY_SORT_ORDER, order);
    this.notify();
  }

  /** fetchBooks — 对齐 mobile:成功写 books/lastSyncAt 清 error,失败写 error */
  async fetchBooks(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.notify();
    try {
      const api: ApiClient = getApiClient();
      const res: ApiResponse<BooksListResponse> = await api.getBooks();
      if (res.success && res.data) {
        // 后端返回 {books, total, ...} 形状;items 兜底
        const data = res.data;
        let items: Book[] = [];
        if (data.books) {
          items = data.books;
        }
        this.books = items;
        this.lastSyncAt = new Date().toISOString();
      } else {
        this.error = res.error ?? 'Failed to fetch books';
      }
    } catch (err) {
      const msg: string = (err as object)?.['message'] as string ?? 'Network error';
      this.error = msg;
      hilog.error(DOMAIN, TAG, 'fetchBooks fail %{public}s', msg);
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  // ─── P5 占位 ────────────────────────────────────────────────
  getLocalBookPath(bookId: string): string | null {
    const v: string | undefined = this.localBookPaths.get(bookId);
    return v ?? null;
  }
}
