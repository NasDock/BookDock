// [API 23+] model/ApiModels.ets — 1:1 对齐 packages/api-client/src/index.ts 的 DTO
// mobile 端 ApiClient 暴露的所有接口类型保持一致,ArkTS 严格类型,无 any/unknown。

// 通用 envelope(默认 void 避免 any/unknown)
export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// PeriodReadingStats / DailyHourStats 用具名 type 替代内联对象字面量
export interface PeriodBreakdownItem {
  label: string;
  date: string;
  durationSecs: number;
}

export interface DailyHourItem {
  hour: number;
  durationSecs: number;
}

// User / Author / Book
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

export type BookFileType = 'epub' | 'pdf' | 'mobi' | 'azw3' | 'txt';

export interface Book {
  id: string;
  title: string;
  author: string;
  authors?: Author[];
  coverUrl?: string;
  format?: string;
  fileType?: BookFileType;
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
  publishedDate?: string;
  /** 后端返回的 JSON 字符串(标签/分类/丛书/简介/作者简介/豆瓣评分/豆瓣链接等) */
  metadata?: string;
}

/** Book.metadata 解析后的结构化字段(对齐 mobile parseMetadata) */
export interface BookMetadata {
  tags?: string[];
  category?: string[];
  series?: string;
  publishedDate?: string;
  published?: string;
  pub_date?: string;
  pages?: number;
  rating?: string;
  doubanUrl?: string;
  summary?: string;
  authorIntro?: string;
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

export type UserRole = 'admin' | 'user';
export type UserMembership = 'free' | 'premium';

export interface User {
  id: string;
  username: string;
  email?: string;
  password?: string;
  role: UserRole;
  membership: UserMembership;
  createdAt: string;
  lastLoginAt?: string;
  storageUsed?: number;
  storageLimit?: number;
}

// Reading
export interface ReadingSession {
  id: string;
  bookId: string;
  userId: string;
  startPosition: number;
  endPosition?: number;
  duration: number;
  startedAt: string;
}

export interface ReadingTimeSummary {
  todaySecs: number;
  weekSecs: number;
  monthSecs: number;
  yearSecs: number;
  totalSecs: number;
}

export type ReadingPeriod = 'day' | 'week' | 'month' | 'year';

export interface PeriodReadingStats {
  period: ReadingPeriod;
  totalDurationSecs: number;
  breakdown: PeriodBreakdownItem[];
}

export interface DailyHourStats {
  date: string;
  hours: DailyHourItem[];
}

// TTS
export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  provider?: string;
}

export interface TTSProvider {
  id: string;
  name: string;
  enabled: boolean;
  type: string;
}

export interface Paragraph {
  index: number;
  text: string;
  duration?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface ChapterParagraphs {
  chapterIndex: number;
  totalParagraphs: number;
  paragraphs: Paragraph[];
}

export interface SynthesizeParagraphRequest {
  text: string;
  voiceId?: string;
  provider?: string;
  rate?: number;
  pitch?: number;
}

export interface SynthesizeParagraphResult {
  audioUrl?: string;
  audioBase64?: string;
  durationMs?: number;
  contentHash?: string;
  cached?: boolean;
}

export interface TtsProgressPayload {
  bookId: string;
  chapterIndex: number;
  paragraphIndex?: number;
  totalDurationSecs?: number;
  currentProvider?: string;
  currentVoice?: string;
  currentRate?: number;
  status?: string;
  updatedAt?: string;
}

export interface TtsProgressRecord {
  id: string;
  bookId: string;
  chapterIndex: number;
  paragraphIndex?: number;
  totalDurationSecs?: number;
  currentProvider?: string;
  currentVoice?: string;
  currentRate?: number;
  status?: string;
  updatedAt?: string;
}

export interface BookLastReadPayload {
  bookId: string;
  chapterIndex?: number;
  scrollOffset?: number;
  progressPct?: number;
}

export interface BookLastReadRecord {
  bookId: string;
  chapterIndex?: number;
  scrollOffset?: number;
  progressPct?: number;
  lastReadAt: string;
}

// Sources
export type EbookSourceType = 'smb' | 'ftp' | 'webdav' | 'local';

export interface EbookSource {
  id: string;
  name: string;
  type: EbookSourceType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  basePath?: string;
  enabled: boolean;
  lastSyncAt?: string;
}

// Notes / Highlights
export interface Note {
  id: string;
  bookId: string;
  chapterId?: string;
  text: string;
  note?: string;
  cfi?: string;
  percentage?: number;
  color?: string;
  author?: string;
  bookTitle?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateHighlightDto {
  bookId: string;
  chapterIndex?: number;
  text: string;
  cfi?: string;
  color?: string;
  note?: string;
}

export interface UpdateHighlightDto {
  note?: string;
  color?: string;
}

// getCoverImageUrl: 1:1 对齐 mobile 端的 toAbsoluteUrl,提供给 UI 调用
export interface CoverUrlProvider {
  toAbsoluteUrl(path?: string | null): string | undefined;
}

// ─── Auth ──────────────────────────────────────────────────────
export interface AuthLoginPayload {
  username: string;
  password: string;
}

export interface AuthRegisterPayload {
  username: string;
  password: string;
  confirmPassword: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ─── Books ─────────────────────────────────────────────────────
export interface BooksListResponse {
  books: Book[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ChapterListItem {
  title: string;
  index: number;
}

export interface ChapterContentResponse {
  title: string;
  content: string;
}

// ─── Reading Progress ──────────────────────────────────────────
export interface ReadingProgressResponse {
  progressPct: number;
  currentChapter?: number;
  scrollOffset?: number;
}

export interface UpdateReadingProgressPayload {
  progressPct: number;
  currentChapter: number;
  scrollOffset: number;
  durationSecs: number;
}

export interface SyncReadingSessionsPayload {
  sessions: ReadingSession[];
}

export interface RecordReadingSessionPayload {
  bookId: string;
  durationSecs: number;
  hour: number;
}

// ─── TTS ───────────────────────────────────────────────────────
export interface TtsProvidersResponse {
  providers: TTSProvider[];
  default?: string;
}

export interface ConvertToSpeechPayload {
  text: string;
  voice?: string;
}

// ─── Admin / Users ─────────────────────────────────────────────
export interface UsersListResponse {
  data: User[];
  total: number;
}

export interface CreateUserDto {
  username: string;
  password: string;
  displayName?: string;
  role?: string;
}

// ─── System ────────────────────────────────────────────────────
export interface SystemConfigResponse {
  key: string;
  value: string | null;
}

export interface SystemConfigPayload {
  key: string;
  value: string;
}

export interface StorageInfoResponse {
  used: number;
  limit: number;
}

// ─── Ebook Sources / Sync ──────────────────────────────────────
export interface SyncEbookSourceResponse {
  added: number;
  updated: number;
  removed: number;
}

export interface SyncBooksPayload {
  type: 'full' | 'incremental';
}

export interface SyncBooksResponse {
  message?: string;
  added?: number;
  removed?: number;
  updated?: number;
}

// ─── Collections ───────────────────────────────────────────────
export interface CreateCollectionDto {
  name: string;
  description?: string;
}

export interface UpdateCollectionDto {
  name?: string;
  description?: string;
}

// ─── Recommendations / Favorites ───────────────────────────────
export interface RecommendationsResponse {
  books: Book[];
}

export interface FavoriteCheckResponse {
  isFavorite: boolean;
}

// ─── Notes ─────────────────────────────────────────────────────
export interface CreateNoteDto {
  bookId: string;
  chapterId?: string;
  text: string;
  note?: string;
  cfi?: string;
  percentage?: number;
  color?: string;
  author?: string;
  bookTitle?: string;
}

export interface NotesListResponse {
  items: Note[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateNoteDto {
  note?: string;
  color?: string;
  text?: string;
}

// ─── Generic operation result (setSystemConfig / syncBooks) ───
export interface SyncResultResponse {
  message: string;
}

// ─── Query Params（替代 inline interface 字面量）─────────────────────────
// ArkTS strict 禁止 inline interface 作为类型注解,所有 query/payload 字面量必须有 named interface。

export interface BooksQuery {
  search?: string;
  author?: string;
  tag?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface UsersQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface NotesQuery {
  bookId?: string;
  author?: string;
  chapterId?: string;
  page?: number;
  limit?: number;
}

export interface ChapterQuery {
  chapter: number;
}

export interface PeriodStatsQuery {
  period: ReadingPeriod;
  date?: string;
}

export interface DailyHoursQuery {
  date?: string;
}

export interface VoicesQuery {
  provider: string;
  language?: string;
}

export interface TtsProgressQuery {
  bookId: string;
  chapterIndex?: number;
}

export interface SystemConfigQuery {
  key: string;
}

export interface AuthorsQuery {
  search?: string;
}

export interface RecommendationsQuery {
  limit?: number;
}

export interface AddFavoritePayload {
  bookId: string;
}