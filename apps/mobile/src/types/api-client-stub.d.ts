/**
 * @bookdock/api-client — mobile2 类型桩
 *
 * 不直接 type-check packages/api-client/src/index.ts(那是个完整的 axios client,API 类型只占一半),
 * 让 mobile2 的 tsc 用更精简的 ambient 类型替代。
 *
 * runtime: metro 会 resolve 到 packages/api-client/src/index.ts 的真实实现,
 * 我们只覆盖类型。
 */

declare module '@bookdock/api-client' {
  export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
  }

  export interface Author {
    id: string;
    name: string;
    nameSort?: string;
    bio?: string;
    avatarUrl?: string;
    birthDate?: string;
    deathDate?: string;
    nationality?: string;
    source?: string;
    bookCount?: number;
    createdAt?: string;
    updatedAt?: string;
  }

  export interface Book {
    id: string;
    title: string;
    author: string;
    authors?: Author[];
    coverUrl?: string;
    format?: string;
    fileType?: 'epub' | 'pdf' | 'mobi' | 'azw3' | 'txt';
    filePath?: string;
    fileSize?: number;
    addedAt?: string;
    lastReadAt?: string;
    readingProgress?: number;
    totalPages?: number;
    currentPage?: number;
    description?: string;
    publisher?: string;
    language?: string;
    isbn?: string;
  }

  export interface Collection {
    id: string;
    name: string;
    description?: string;
    coverUrl?: string;
    bookCount: number;
    createdAt: string;
    updatedAt: string;
  }

  export interface CollectionDetail extends Collection {
    books: Book[];
  }

  export interface User {
    id: string;
    username: string;
    email?: string;
    password?: string;
    role: 'admin' | 'user';
    membership: 'free' | 'premium';
    createdAt: string;
    lastLoginAt?: string;
    storageUsed?: number;
    storageLimit?: number;
  }

  export interface ReadingSession {
    id: string;
    bookId: string;
    userId: string;
    startPosition: number;
    endPosition?: number;
    duration: number;
    startedAt: string;
    endedAt?: string;
  }

  export interface ReadingTimeSummary {
    todaySecs: number;
    weekSecs: number;
    monthSecs: number;
    yearSecs: number;
    totalSecs: number;
  }

  export interface PeriodReadingStats {
    period: 'day' | 'week' | 'month' | 'year';
    totalDurationSecs: number;
    bookCount: number;
    breakdown: Array<{
      label: string;
      durationSecs: number;
      date: string;
    }>;
  }

  export interface DailyHourStats {
    date: string;
    hours: Array<{
      hour: number;
      durationSecs: number;
    }>;
  }

  export interface TTSVoice {
    id: string;
    name: string;
    language: string;
    lang?: string;
    gender: string;
    description?: string;
    sample_rate?: number;
    local?: boolean;
  }

  export interface TTSProvider {
    name: string;
    enabled: boolean;
    status: string;
    configured?: boolean;
  }

  export interface Paragraph {
    id: string;
    index: number;
    text: string;
    charStart: number;
    charEnd: number;
  }

  export interface ChapterParagraphs {
    title: string;
    paragraphs: Paragraph[];
  }

  export interface SynthesizeParagraphRequest {
    bookId?: string;
    paragraphId?: string;
    text: string;
    provider?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
  }

  export interface SynthesizeParagraphResult {
    url: string;
    contentHash: string;
    provider: string;
    voice: string;
    bytes: number;
    cached: boolean;
  }

  export interface TtsProgressPayload {
    bookId: string;
    chapterIndex: number;
    paragraphIndex: number;
    charOffset?: number;
    audioOffsetMs?: number;
    voice?: string;
    provider?: string;
    totalParagraphs?: number;
  }

  export interface TtsProgressRecord {
    id: string;
    userId: string;
    bookId: string;
    chapterIndex: number;
    paragraphIndex: number;
    charOffset: number;
    audioOffsetMs: number;
    voice?: string;
    provider?: string;
    totalParagraphs: number;
    updatedAt: string;
  }

  export interface BookLastReadPayload {
    bookId: string;
    chapterIndex: number;
    paragraphIndex?: number;
    audioOffsetMs?: number;
  }

  export interface BookLastReadRecord {
    id: string;
    userId: string;
    bookId: string;
    chapterIndex: number;
    paragraphIndex: number;
    audioOffsetMs: number;
    updatedAt: string;
  }

  export interface EbookSource {
    id: string;
    name: string;
    type: 'local' | 'webdav' | 'smb' | 'ftp';
    url?: string;
    path?: string;
    enabled: boolean;
    lastSyncAt?: string;
  }

  export interface Note {
    id: string;
    userId: string;
    bookId: string;
    chapterId?: string;
    text: string;
    note?: string;
    color?: string;
    cfi?: string;
    percentage?: number;
    author?: string;
    bookTitle?: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface CreateHighlightDto {
    bookId: string;
    chapterId?: string;
    cfi: string;
    startOffset: number;
    endOffset: number;
    text: string;
    color?: string;
    note?: string;
  }

  export interface UpdateHighlightDto {
    note?: string;
    color?: string;
  }

  export interface ApiClientConfig {
    baseURL: string;
    timeout?: number;
    getAuthToken?: () => string | null;
    onAuthError?: () => void;
  }

  // 兜底:任何没显式声明的 ApiClient 方法/属性都接受 (mobile2 当前只用了少量,
  // 其它方法在 packages/* 里被调用,会被 tsc 扫到但不需要严格类型)
  export interface ApiClient {
    getCurrentUser(): Promise<ApiResponse<User>>;
    deleteUser(id: string): Promise<ApiResponse>;
    toAbsoluteUrl(path?: string | null): string | undefined;
    readonly baseURL: string;
    readonly serverBaseURL: string;
    [method: string]: any;
  }

  export function initApiClient(config: ApiClientConfig): ApiClient;
  export function getApiClient(): ApiClient;
  export default ApiClient;
}