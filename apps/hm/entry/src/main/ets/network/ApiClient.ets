// [API 23+] network/ApiClient.ets — 1:1 对齐 mobile @bookdock/api-client 的 55 个方法
// envelope: { success, data?, error?, message? }  — 复刻 mobile Response 拦截器
// 401 → onAuthError 回调; 授权头 → Bearer token; baseURL 可动态切换(对齐 mobile setApiBaseUrl)。
import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';
import {
  AddFavoritePayload,
  ApiResponse,
  Author,
  AuthorsQuery,
  AuthLoginPayload,
  AuthRegisterPayload,
  Book,
  BookLastReadPayload,
  BookLastReadRecord,
  BooksListResponse,
  BooksQuery,
  ChapterContentResponse,
  ChapterListItem,
  ChapterParagraphs,
  ChapterQuery,
  Collection,
  CollectionDetail,
  ConvertToSpeechPayload,
  CreateCollectionDto,
  CreateHighlightDto,
  CreateNoteDto,
  CreateUserDto,
  DailyHoursQuery,
  DailyHourStats,
  EbookSource,
  FavoriteCheckResponse,
  LoginResponse,
  Note,
  NotesListResponse,
  NotesQuery,
  Paragraph,
  PeriodReadingStats,
  PeriodStatsQuery,
  ReadingProgressResponse,
  ReadingSession,
  ReadingTimeSummary,
  ReadingPeriod,
  RecommendationsQuery,
  RecommendationsResponse,
  RecordReadingSessionPayload,
  StorageInfoResponse,
  SyncBooksPayload,
  SyncBooksResponse,
  SyncEbookSourceResponse,
  SyncReadingSessionsPayload,
  SyncResultResponse,
  SynthesizeParagraphRequest,
  SynthesizeParagraphResult,
  SystemConfigPayload,
  SystemConfigQuery,
  SystemConfigResponse,
  TtsProgressQuery,
  TtsProvidersResponse,
  TTSProvider,
  TTSVoice,
  TtsProgressPayload,
  TtsProgressRecord,
  UpdateCollectionDto,
  UpdateHighlightDto,
  UpdateNoteDto,
  UpdateReadingProgressPayload,
  UsersListResponse,
  UsersQuery,
  User,
  VoicesQuery
} from '../model/ApiModels';

const DOMAIN = 0x0001;
const TAG = 'ApiClient';

// http 抛出的错误对象类型(ArkTS 严格模式禁止 unknown / any)
interface ErrorLike {
  message: string;
}

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  getAuthToken?: () => string | null;
  onAuthError?: () => void;
}

// 请求参数显式类型(ArkTS 严格模式禁止 Record / 内联对象字面量作为类型)
// query 值支持 string / number / boolean,headers 仅 string
export type StringMap = object;
export type QueryValueMap = object;

export interface ApiRequestOptions {
  query?: QueryValueMap;
  headers?: StringMap;
  responseType?: http.HttpDataType;
}

interface HttpRawResult {
  statusCode: number;
  body: ArrayBuffer | null;
}

// http.HttpResponse.result 的可能类型(ArkTS 严格模式不能用 HttpResponse['result'])
type HttpResponseBody = string | ArrayBuffer | object;

// ─── 单例 ─────────────────────────────────────────────────────────

let apiClientInstance: ApiClient | null = null;

export class ApiClient {
  private baseURL: string;
  private timeout: number;
  private getAuthToken?: () => string | null;
  private onAuthError?: () => void;

  constructor(config: ApiClientConfig) {
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.timeout = config.timeout ?? 30000;
    this.getAuthToken = config.getAuthToken;
    this.onAuthError = config.onAuthError;
  }

  /** 服务器 base URL(去掉 /api 后缀),对齐 mobile serverBaseURL,用于拼装音频/封面等静态资源 */
  get serverBaseURL(): string {
    return this.baseURL.replace(/\/api$/, '');
  }

  /** 切换后端地址(mobile setApiBaseUrl 的 1:1 对齐) */
  setBaseURL(url: string): void {
    this.baseURL = url.replace(/\/+$/, '');
  }

  getBaseURL(): string {
    return this.baseURL;
  }

  /** 相对路径 → 绝对 URL,前端用来拼 /covers/xxx.jpg、/audio/xxx.mp3 */
  toAbsoluteUrl(path?: string | null): string | undefined {
    if (!path) {
      return undefined;
    }
    if (/^(https?:|data:|blob:)/i.test(path)) {
      return path;
    }
    if (!path.startsWith('/')) {
      return path;
    }
    return `${this.serverBaseURL}${path}`;
  }

  // ─── 内部 HTTP 封装 ───────────────────────────────────────────────

  private async request<T>(method: http.RequestMethod, path: string, body?: object, opts: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.headers) {
      const input: Record<string, string> = opts.headers as Record<string, string>;
      const inputKeys: string[] = Object.keys(input);
      for (const k of inputKeys) {
        headers[k] = input[k];
      }
    }
    const token = this.getAuthToken?.();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.createHttp();
    const options: http.HttpRequestOptions = {
      method,
      header: headers,
      readTimeout: this.timeout,
      connectTimeout: this.timeout,
      expectDataType: opts.responseType ?? http.HttpDataType.STRING
    };
    if (method === http.RequestMethod.GET) {
      // 鸿蒙 @ohos.net.http 用 extraData 传 query(POST 也兼容)
      if (opts.query) {
        const q: Record<string, string | number | boolean> = opts.query as Record<string, string | number | boolean>;
        const qKeys: string[] = Object.keys(q);
        const parts: string[] = [];
        for (const k of qKeys) {
          const v: string | number | boolean = q[k];
          if (v === undefined || v === null) {
            continue;
          }
          parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
        }
        if (parts.length > 0) {
          options.extraData = parts.join('&');
        }
      }
    } else if (body !== undefined) {
      options.extraData = JSON.stringify(body);
    }
    try {
      const resp = await req.request(url, options);
      if (resp.responseCode === 401) {
        this.onAuthError?.();
      }
      const parsed: ApiResponse<T> = this.parseEnvelope<T>(resp.result as HttpResponseBody);
      return parsed;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'request fail %{public}s %{public}s', method + ' ' + url, this.errMessage(err));
      const failed: ApiResponse<T> = { success: false, error: this.errMessage(err) };
      return failed;
    } finally {
      req.destroy();
    }
  }

  private parseEnvelope<T>(raw: HttpResponseBody): ApiResponse<T> {
    if (typeof raw === 'string') {
      if (!raw) {
        const empty: ApiResponse<T> = { success: false, error: 'Empty response' };
        return empty;
      }
      try {
        return JSON.parse(raw) as ApiResponse<T>;
      } catch {
        const bad: ApiResponse<T> = { success: false, error: 'Invalid JSON: ' + raw.slice(0, 200) };
        return bad;
      }
    }
    if (raw instanceof ArrayBuffer) {
      // 服务器返了裸 buffer,这里只解析 JSON 文本,buffer 路径走 requestRaw
      const empty: ApiResponse<T> = { success: false, error: 'Binary response' };
      return empty;
    }
    if (raw && typeof raw === 'object') {
      return raw as ApiResponse<T>;
    }
    const empty: ApiResponse<T> = { success: false, error: 'Unknown response' };
    return empty;
  }

  private errMessage(err: object | string): string {
    if (typeof err === 'string') {
      return err;
    }
    if (err && typeof err === 'object') {
      const e = err as ErrorLike;
      if (typeof e.message === 'string') {
        return e.message;
      }
    }
    return JSON.stringify(err);
  }

  // ─── Auth ──────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
    const payload: AuthLoginPayload = { username, password };
    return this.request<LoginResponse>(http.RequestMethod.POST, '/auth/login', payload);
  }

  async logout(): Promise<ApiResponse> {
    return this.request(http.RequestMethod.POST, '/auth/logout');
  }

  async register(username: string, password: string, confirmPassword: string): Promise<ApiResponse<LoginResponse>> {
    const payload: AuthRegisterPayload = { username, password, confirmPassword };
    return this.request<LoginResponse>(http.RequestMethod.POST, '/auth/register', payload);
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>(http.RequestMethod.GET, '/auth/me');
  }

  // ─── Books ─────────────────────────────────────────────────────────

  async getBooks(params?: BooksQuery): Promise<ApiResponse<BooksListResponse>> {
    return this.request(http.RequestMethod.GET, '/books', undefined, { query: params });
  }

  async getBook(id: string): Promise<ApiResponse<Book>> {
    return this.request<Book>(http.RequestMethod.GET, `/books/${id}`);
  }

  async addBook(bookData: Partial<Book>): Promise<ApiResponse<Book>> {
    return this.request<Book>(http.RequestMethod.POST, '/books', bookData);
  }

  async updateBook(id: string, bookData: Partial<Book>): Promise<ApiResponse<Book>> {
    return this.request<Book>(http.RequestMethod.PUT, `/books/${id}`, bookData);
  }

  async deleteBook(id: string): Promise<ApiResponse> {
    return this.request(http.RequestMethod.DELETE, `/books/${id}`);
  }

  async getBookFile(id: string): Promise<ArrayBuffer | null> {
    const resp: HttpRawResult = await this.requestRaw(`/books/${id}/download`, http.HttpDataType.ARRAY_BUFFER);
    if (resp.statusCode === 401) {
      this.onAuthError?.();
    }
    return resp.body;
  }

  async downloadBookFile(id: string): Promise<ArrayBuffer | null> {
    return this.getBookFile(id);
  }

  async getBookFileBlob(id: string): Promise<ArrayBuffer | null> {
    return this.getBookFile(id);
  }

  async getChapters(id: string): Promise<ApiResponse<ChapterListItem[]>> {
    return this.request<ChapterListItem[]>(http.RequestMethod.GET, `/books/${id}/chapters`);
  }

  async getChapterContent(id: string, chapterIndex: number): Promise<ApiResponse<ChapterContentResponse>> {
    const q: ChapterQuery = { chapter: chapterIndex };
    return this.request<ChapterContentResponse>(http.RequestMethod.GET, `/books/${id}/content`, undefined, { query: q });
  }

  async getChapterParagraphs(id: string, chapterIndex: number): Promise<ApiResponse<ChapterParagraphs>> {
    const q: ChapterQuery = { chapter: chapterIndex };
    return this.request<ChapterParagraphs>(http.RequestMethod.GET, `/books/${id}/paragraphs`, undefined, { query: q });
  }

  // ─── Reading Progress ─────────────────────────────────────────────

  async updateReadingProgress(bookId: string, progressPct: number, currentChapter?: number, scrollOffset?: number, durationSecs?: number): Promise<ApiResponse> {
    const payload: UpdateReadingProgressPayload = {
      progressPct,
      currentChapter: currentChapter ?? 0,
      scrollOffset: scrollOffset ?? 0,
      durationSecs: durationSecs ?? 0
    };
    return this.request(http.RequestMethod.POST, `/reading-progress/books/${bookId}`, payload);
  }

  async getReadingProgress(bookId: string): Promise<ApiResponse<ReadingProgressResponse>> {
    return this.request(http.RequestMethod.GET, `/reading-progress/books/${bookId}`);
  }

  async syncReadingSessions(sessions: ReadingSession[]): Promise<ApiResponse> {
    const payload: SyncReadingSessionsPayload = { sessions };
    return this.request(http.RequestMethod.POST, '/reading/sync', payload);
  }

  async recordReadingSession(bookId: string, durationSecs: number, hour?: number): Promise<ApiResponse> {
    const payload: RecordReadingSessionPayload = {
      bookId,
      durationSecs,
      hour: hour ?? 0
    };
    return this.request(http.RequestMethod.POST, '/reading-progress/session', payload);
  }

  async getReadingTimeSummary(): Promise<ApiResponse<ReadingTimeSummary>> {
    return this.request<ReadingTimeSummary>(http.RequestMethod.GET, '/reading-progress/time-summary');
  }

  async getPeriodReadingStats(period: ReadingPeriod, date?: string): Promise<ApiResponse<PeriodReadingStats>> {
    const q: PeriodStatsQuery = { period: period };
    if (date !== undefined) {
      q.date = date;
    }
    return this.request<PeriodReadingStats>(http.RequestMethod.GET, '/reading-progress/period-stats', undefined, { query: q });
  }

  async getDailyReadingHours(date?: string): Promise<ApiResponse<DailyHourStats>> {
    const q: DailyHoursQuery = {};
    if (date !== undefined) {
      q.date = date;
    }
    return this.request<DailyHourStats>(http.RequestMethod.GET, '/reading-progress/daily-hours', undefined, { query: q });
  }

  // ─── TTS ──────────────────────────────────────────────────────────

  async getTtsProviders(): Promise<ApiResponse<TtsProvidersResponse>> {
    return this.request(http.RequestMethod.GET, '/tts/providers');
  }

  async getVoices(provider: string = 'edge', language?: string): Promise<ApiResponse<TTSVoice[]>> {
    const q: VoicesQuery = { provider: provider };
    if (language !== undefined) {
      q.language = language;
    }
    return this.request<TTSVoice[]>(http.RequestMethod.GET, '/tts/voices', undefined, { query: q });
  }

  async synthesizeParagraph(req: SynthesizeParagraphRequest): Promise<ApiResponse<SynthesizeParagraphResult>> {
    return this.request<SynthesizeParagraphResult>(http.RequestMethod.POST, '/tts/synthesize', req);
  }

  async convertToSpeech(text: string, voiceId?: string): Promise<ArrayBuffer | null> {
    const payload: ConvertToSpeechPayload = { text };
    if (voiceId !== undefined) {
      payload.voice = voiceId;
    }
    const resp: HttpRawResult = await this.requestRaw('/tts/synthesize-blob', http.HttpDataType.ARRAY_BUFFER, http.RequestMethod.POST, payload);
    if (resp.statusCode === 401) {
      this.onAuthError?.();
    }
    return resp.body;
  }

  async saveTtsProgress(p: TtsProgressPayload): Promise<ApiResponse<TtsProgressRecord>> {
    return this.request<TtsProgressRecord>(http.RequestMethod.POST, '/tts/progress', p);
  }

  async getTtsProgress(bookId: string, chapterIndex?: number): Promise<ApiResponse<TtsProgressRecord | TtsProgressRecord[] | null>> {
    const q: TtsProgressQuery = { bookId: bookId };
    if (chapterIndex !== undefined) {
      q.chapterIndex = chapterIndex;
    }
    return this.request(http.RequestMethod.GET, '/tts/progress', undefined, { query: q });
  }

  async saveBookLastRead(p: BookLastReadPayload): Promise<ApiResponse<BookLastReadRecord>> {
    return this.request<BookLastReadRecord>(http.RequestMethod.POST, '/books/last-read', p);
  }

  async getBookLastRead(bookId: string): Promise<ApiResponse<BookLastReadRecord | null>> {
    return this.request<BookLastReadRecord | null>(http.RequestMethod.GET, `/books/${bookId}/last-read`);
  }

  // ─── Admin / Users ────────────────────────────────────────────────

  async getUsers(params?: UsersQuery): Promise<ApiResponse<UsersListResponse>> {
    return this.request(http.RequestMethod.GET, '/users', undefined, { query: params });
  }

  async createUser(userData: CreateUserDto): Promise<ApiResponse<User>> {
    return this.request<User>(http.RequestMethod.POST, '/users', userData);
  }

  async updateUser(id: string, userData: Partial<User>): Promise<ApiResponse<User>> {
    return this.request<User>(http.RequestMethod.PUT, `/users/${id}`, userData);
  }

  async deleteUser(id: string): Promise<ApiResponse> {
    return this.request(http.RequestMethod.DELETE, `/users/${id}`);
  }

  // ─── System ───────────────────────────────────────────────────────

  async getSystemConfig(key: string): Promise<ApiResponse<SystemConfigResponse>> {
    const q: SystemConfigQuery = { key: key };
    return this.request(http.RequestMethod.GET, '/system/config', undefined, { query: q });
  }

  async setSystemConfig(key: string, value: string): Promise<ApiResponse<SyncResultResponse>> {
    const payload: SystemConfigPayload = { key, value };
    return this.request<SyncResultResponse>(http.RequestMethod.POST, '/system/config', payload);
  }

  async getStorageInfo(): Promise<ApiResponse<StorageInfoResponse>> {
    return this.request(http.RequestMethod.GET, '/system/storage');
  }

  // ─── Ebook Sources ────────────────────────────────────────────────

  async getEbookSources(): Promise<ApiResponse<EbookSource[]>> {
    return this.request<EbookSource[]>(http.RequestMethod.GET, '/ebook-sources');
  }

  async addEbookSource(source: Partial<EbookSource>): Promise<ApiResponse<EbookSource>> {
    return this.request<EbookSource>(http.RequestMethod.POST, '/ebook-sources', source);
  }

  async updateEbookSource(id: string, source: Partial<EbookSource>): Promise<ApiResponse<EbookSource>> {
    return this.request<EbookSource>(http.RequestMethod.PUT, `/ebook-sources/${id}`, source);
  }

  async deleteEbookSource(id: string): Promise<ApiResponse> {
    return this.request(http.RequestMethod.DELETE, `/ebook-sources/${id}`);
  }

  async syncEbookSource(id: string): Promise<ApiResponse<SyncEbookSourceResponse>> {
    return this.request(http.RequestMethod.POST, `/ebook-sources/${id}/sync`);
  }

  async syncBooks(type: 'full' | 'incremental'): Promise<ApiResponse<SyncBooksResponse>> {
    const payload: SyncBooksPayload = { type };
    return this.request(http.RequestMethod.POST, '/books/sync', payload);
  }

  // ─── Collections ───────────────────────────────────────────────────

  async getCollections(): Promise<ApiResponse<Collection[]>> {
    return this.request<Collection[]>(http.RequestMethod.GET, '/collections');
  }

  async getCollection(id: string): Promise<ApiResponse<CollectionDetail>> {
    return this.request<CollectionDetail>(http.RequestMethod.GET, `/collections/${id}`);
  }

  async createCollection(dto: CreateCollectionDto): Promise<ApiResponse<Collection>> {
    return this.request<Collection>(http.RequestMethod.POST, '/collections', dto);
  }

  async updateCollection(id: string, dto: UpdateCollectionDto): Promise<ApiResponse<Collection>> {
    return this.request<Collection>(http.RequestMethod.PUT, `/collections/${id}`, dto);
  }

  async deleteCollection(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(http.RequestMethod.DELETE, `/collections/${id}`);
  }

  async addBookToCollection(collectionId: string, bookId: string): Promise<ApiResponse<void>> {
    return this.request<void>(http.RequestMethod.POST, `/collections/${collectionId}/books/${bookId}`);
  }

  async removeBookFromCollection(collectionId: string, bookId: string): Promise<ApiResponse<void>> {
    return this.request<void>(http.RequestMethod.DELETE, `/collections/${collectionId}/books/${bookId}`);
  }

  // ─── Authors ───────────────────────────────────────────────────────

  async getAuthors(search?: string): Promise<ApiResponse<Author[]>> {
    const q: AuthorsQuery = {};
    if (search !== undefined) {
      q.search = search;
    }
    return this.request<Author[]>(http.RequestMethod.GET, '/authors', undefined, { query: q });
  }

  async getAuthor(id: string): Promise<ApiResponse<Author>> {
    return this.request<Author>(http.RequestMethod.GET, `/authors/${id}`);
  }

  async getAuthorBooks(id: string): Promise<ApiResponse<Book[]>> {
    return this.request<Book[]>(http.RequestMethod.GET, `/authors/${id}/books`);
  }

  // ─── Recommendation / Favorites ───────────────────────────────────

  async getRecommendations(limit?: number): Promise<ApiResponse<RecommendationsResponse>> {
    const q: RecommendationsQuery = {};
    if (limit !== undefined) {
      q.limit = limit;
    }
    return this.request(http.RequestMethod.GET, '/recommendations', undefined, { query: q });
  }

  async getFavorites(): Promise<ApiResponse<Book[]>> {
    return this.request<Book[]>(http.RequestMethod.GET, '/favorites');
  }

  async checkFavorite(bookId: string): Promise<ApiResponse<FavoriteCheckResponse>> {
    return this.request(http.RequestMethod.GET, `/favorites/${bookId}/check`);
  }

  async addFavorite(bookId: string): Promise<ApiResponse<void>> {
    const payload: AddFavoritePayload = { bookId: bookId };
    return this.request<void>(http.RequestMethod.POST, '/favorites', payload);
  }

  async removeFavorite(bookId: string): Promise<ApiResponse<void>> {
    return this.request<void>(http.RequestMethod.DELETE, `/favorites/${bookId}`);
  }

  // ─── Notes ─────────────────────────────────────────────────────────

  async createNote(dto: CreateNoteDto): Promise<ApiResponse<Note>> {
    return this.request<Note>(http.RequestMethod.POST, '/notes', dto);
  }

  async getNotes(params?: NotesQuery): Promise<ApiResponse<NotesListResponse>> {
    return this.request(http.RequestMethod.GET, '/notes', undefined, { query: params });
  }

  async getNotesByBook(bookId: string): Promise<ApiResponse<Note[]>> {
    return this.request<Note[]>(http.RequestMethod.GET, `/notes/book/${bookId}`);
  }

  async getNotesByAuthor(author: string): Promise<ApiResponse<Note[]>> {
    return this.request<Note[]>(http.RequestMethod.GET, `/notes/author/${encodeURIComponent(author)}`);
  }

  async updateNote(noteId: string, dto: UpdateNoteDto): Promise<ApiResponse<Note>> {
    return this.request<Note>(http.RequestMethod.PUT, `/notes/${noteId}`, dto);
  }

  async deleteNote(noteId: string): Promise<ApiResponse<void>> {
    return this.request<void>(http.RequestMethod.DELETE, `/notes/${noteId}`);
  }

  // ─── Highlights ────────────────────────────────────────────────────

  async createHighlight(dto: CreateHighlightDto): Promise<ApiResponse<Note>> {
    return this.request<Note>(http.RequestMethod.POST, '/highlights', dto);
  }

  async getHighlights(bookId: string): Promise<ApiResponse<Note[]>> {
    return this.request<Note[]>(http.RequestMethod.GET, `/highlights/${bookId}`);
  }

  async updateHighlight(highlightId: string, dto: UpdateHighlightDto): Promise<ApiResponse<Note>> {
    return this.request<Note>(http.RequestMethod.PUT, `/highlights/${highlightId}`, dto);
  }

  async deleteHighlight(highlightId: string): Promise<ApiResponse<void>> {
    return this.request<void>(http.RequestMethod.DELETE, `/highlights/${highlightId}`);
  }

  // ─── 原始 HTTP(给 ArrayBuffer 路径用) ─────────────────────────────

  private async requestRaw(path: string, dataType: http.HttpDataType, method: http.RequestMethod = http.RequestMethod.GET, body?: object): Promise<HttpRawResult> {
    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getAuthToken?.();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.createHttp();
    const options: http.HttpRequestOptions = {
      method,
      header: headers,
      readTimeout: this.timeout,
      connectTimeout: this.timeout,
      expectDataType: dataType
    };
    if (body !== undefined) {
      options.extraData = JSON.stringify(body);
    }
    try {
      const resp = await req.request(url, options);
      const resultObj: object = resp.result as object;
      let buf: ArrayBuffer | null = null;
      if (resultObj instanceof ArrayBuffer) {
        buf = resultObj;
      } else if (typeof resultObj === 'string' && (resultObj as string).length > 0 && dataType === http.HttpDataType.ARRAY_BUFFER) {
        // 兜底:服务器返回了字符串,转成 ArrayBuffer
        const encoder = new util.TextEncoder();
        const encRes: Uint8Array = encoder.encodeInto(resultObj as string);
        // Uint8Array.buffer 类型是 ArrayBufferLike(包含 ArrayBuffer / SharedArrayBuffer),此处结构化赋值给 ArrayBuffer 需 cast
        buf = encRes.buffer as ArrayBuffer;
      }
      const ok: HttpRawResult = { statusCode: resp.responseCode, body: buf };
      return ok;
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'requestRaw fail %{public}s', this.errMessage(err));
      const fail: HttpRawResult = { statusCode: -1, body: null };
      return fail;
    } finally {
      req.destroy();
    }
  }
}

// 单例导出(对齐 mobile initApiClient / getApiClient)
export function initApiClient(config: ApiClientConfig): ApiClient {
  apiClientInstance = new ApiClient(config);
  return apiClientInstance;
}

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    const notInit: ApiClient = new ApiClient({ baseURL: 'http://localhost:8088/api' });
    apiClientInstance = notInit;
  }
  return apiClientInstance;
}