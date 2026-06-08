import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

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

export interface TTSVoice {
  id: string;
  name: string;
  /** BCP-47 locale e.g. "en-US" */
  language: string;
  /** @deprecated alias for language, kept for backwards compatibility */
  lang?: string;
  gender: string;
  description?: string;
  sample_rate?: number;
  /** @deprecated legacy field, always false on the new path */
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

class ApiClient {
  private client: AxiosInstance;
  private getAuthToken?: () => string | null;
  private onAuthError?: () => void;
  public readonly baseURL: string;

  constructor(config: ApiClientConfig) {
    this.getAuthToken = config.getAuthToken;
    this.onAuthError = config.onAuthError;
    this.baseURL = config.baseURL;

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use(
      (requestConfig: InternalAxiosRequestConfig) => {
        const token = this.getAuthToken?.();
        if (token && requestConfig.headers) {
          requestConfig.headers.Authorization = `Bearer ${token}`;
        }
        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.onAuthError?.();
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const { data } = await this.client.post('/auth/login', { username, password });
    return data;
  }

  async logout(): Promise<ApiResponse> {
    const { data } = await this.client.post('/auth/logout');
    return data;
  }

  async register(username: string, password: string, confirmPassword: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const { data } = await this.client.post('/auth/register', { username, password, confirmPassword });
    return data;
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    const { data } = await this.client.get('/auth/me');
    return data;
  }

  // Book endpoints
  async getBooks(params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ books: Book[]; total: number; page: number; limit: number; totalPages: number }>> {
    const { data } = await this.client.get('/books', { params });
    return data;
  }

  async getBook(id: string): Promise<ApiResponse<Book>> {
    const { data } = await this.client.get(`/books/${id}`);
    return data;
  }

  async addBook(bookData: Partial<Book>): Promise<ApiResponse<Book>> {
    const { data } = await this.client.post('/books', bookData);
    return data;
  }

  async updateBook(id: string, bookData: Partial<Book>): Promise<ApiResponse<Book>> {
    const { data } = await this.client.put(`/books/${id}`, bookData);
    return data;
  }

  async deleteBook(id: string): Promise<ApiResponse> {
    const { data } = await this.client.delete(`/books/${id}`);
    return data;
  }

  async getBookFile(id: string): Promise<ArrayBuffer> {
    const { data } = await this.client.get(`/books/${id}/download`, { responseType: 'arraybuffer' });
    return data;
  }

  async getChapters(id: string): Promise<ApiResponse<{ title: string; index: number }[]>> {
    const { data } = await this.client.get(`/books/${id}/chapters`);
    return data;
  }

  async getChapterContent(id: string, chapterIndex: number): Promise<ApiResponse<{ title: string; content: string }>> {
    const { data } = await this.client.get(`/books/${id}/content?chapter=${chapterIndex}`);
    return data;
  }

  async getBookFileBlob(id: string): Promise<Blob> {
    const { data } = await this.client.get(`/books/${id}/download`, { responseType: 'blob' });
    return data;
  }

  async downloadBookFile(id: string): Promise<ArrayBuffer> {
    const { data } = await this.client.get(`/books/${id}/download`, { responseType: 'arraybuffer' });
    return data;
  }

  async uploadBookFile(file: File): Promise<ApiResponse<Book>> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await this.client.post('/books/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  // Reading progress
  async updateReadingProgress(bookId: string, progressPct: number, currentChapter?: number, scrollOffset?: number): Promise<ApiResponse> {
    const { data } = await this.client.post(`/reading-progress/books/${bookId}`, {
      progressPct,
      currentChapter,
      scrollOffset,
    });
    return data;
  }

  async getReadingProgress(bookId: string): Promise<ApiResponse<{ progressPct: number; currentChapter?: number; scrollOffset?: number }>> {
    const { data } = await this.client.get(`/reading-progress/books/${bookId}`);
    return data;
  }

  async syncReadingSessions(sessions: ReadingSession[]): Promise<ApiResponse> {
    const { data } = await this.client.post('/reading/sync', { sessions });
    return data;
  }

  // TTS endpoints
  async getTtsProviders(): Promise<ApiResponse<{ providers: TTSProvider[]; default?: string }>> {
    const { data } = await this.client.get('/tts/providers');
    return data;
  }

  async getVoices(provider = 'edge', language?: string): Promise<ApiResponse<TTSVoice[]>> {
    const { data } = await this.client.get('/tts/voices', {
      params: { provider, ...(language ? { language } : {}) },
    });
    return data;
  }

  async synthesizeParagraph(req: SynthesizeParagraphRequest): Promise<ApiResponse<SynthesizeParagraphResult>> {
    const { data } = await this.client.post('/tts/synthesize', req);
    return data;
  }

  // Backwards-compatible raw-blob endpoint
  async convertToSpeech(text: string, voiceId?: string): Promise<Blob> {
    const { data } = await this.client.post(
      '/tts/synthesize-blob',
      { text, voice: voiceId },
      { responseType: 'blob' },
    );
    return data;
  }

  // Reading progress for TTS
  async saveTtsProgress(p: TtsProgressPayload): Promise<ApiResponse<TtsProgressRecord>> {
    const { data } = await this.client.post('/tts/progress', p);
    return data;
  }

  async getTtsProgress(bookId: string, chapterIndex?: number): Promise<ApiResponse<TtsProgressRecord | TtsProgressRecord[] | null>> {
    const { data } = await this.client.get('/tts/progress', {
      params: chapterIndex !== undefined ? { bookId, chapterIndex } : { bookId },
    });
    return data;
  }

  // Chapter paragraphs (the TTS-friendly chapter payload)
  async getChapterParagraphs(id: string, chapterIndex: number): Promise<ApiResponse<ChapterParagraphs>> {
    const { data } = await this.client.get(`/books/${id}/paragraphs`, { params: { chapter: chapterIndex } });
    return data;
  }

  // Admin endpoints
  async getUsers(params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ data: User[]; total: number }>> {
    const { data } = await this.client.get('/admin/users', { params });
    return data;
  }

  async createUser(userData: { username: string; password: string; displayName?: string; role?: string }): Promise<ApiResponse<User>> {
    const { data } = await this.client.post('/admin/users', userData);
    return data;
  }

  async updateUser(id: string, userData: Partial<User>): Promise<ApiResponse<User>> {
    const { data } = await this.client.put(`/admin/users/${id}`, userData);
    return data;
  }

  async deleteUser(id: string): Promise<ApiResponse> {
    const { data } = await this.client.delete(`/admin/users/${id}`);
    return data;
  }

  async getSystemConfig(key: string): Promise<ApiResponse<{ key: string; value: string | null }>> {
    const { data } = await this.client.get(`/admin/config/${key}`);
    return data;
  }

  async setSystemConfig(key: string, value: string): Promise<ApiResponse<{ message: string }>> {
    const { data } = await this.client.put(`/admin/config/${key}`, { value });
    return data;
  }

  async getEbookSources(): Promise<ApiResponse<EbookSource[]>> {
    const { data } = await this.client.get('/admin/ebook-sources');
    return data;
  }

  async addEbookSource(source: Partial<EbookSource>): Promise<ApiResponse<EbookSource>> {
    const { data } = await this.client.post('/admin/ebook-sources', source);
    return data;
  }

  async updateEbookSource(id: string, source: Partial<EbookSource>): Promise<ApiResponse<EbookSource>> {
    const { data } = await this.client.put(`/admin/ebook-sources/${id}`, source);
    return data;
  }

  async deleteEbookSource(id: string): Promise<ApiResponse> {
    const { data } = await this.client.delete(`/admin/ebook-sources/${id}`);
    return data;
  }

  async syncEbookSource(id: string): Promise<ApiResponse<{ added: number; updated: number; removed: number }>> {
    const { data } = await this.client.post(`/admin/ebook-sources/${id}/sync`);
    return data;
  }

  async syncBooks(type: 'full' | 'incremental'): Promise<ApiResponse<{ message: string; added?: number; removed?: number; updated?: number }>> {
    const { data } = await this.client.post(`/books/sync/${type}`);
    return data;
  }

  // Storage info
  async getStorageInfo(): Promise<ApiResponse<{ used: number; limit: number }>> {
    const { data } = await this.client.get('/storage/info');
    return data;
  }

  // Collection APIs
  async getCollections(): Promise<ApiResponse<Collection[]>> {
    const { data } = await this.client.get('/collections');
    return data;
  }

  async getCollection(id: string): Promise<ApiResponse<CollectionDetail>> {
    const { data } = await this.client.get(`/collections/${id}`);
    return data;
  }

  async createCollection(dto: { name: string; description?: string }): Promise<ApiResponse<Collection>> {
    const { data } = await this.client.post('/collections', dto);
    return data;
  }

  async updateCollection(id: string, dto: { name?: string; description?: string }): Promise<ApiResponse<Collection>> {
    const { data } = await this.client.put(`/collections/${id}`, dto);
    return data;
  }

  async deleteCollection(id: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.delete(`/collections/${id}`);
    return data;
  }

  async addBookToCollection(collectionId: string, bookId: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.post(`/collections/${collectionId}/books`, { bookId });
    return data;
  }

  async removeBookFromCollection(collectionId: string, bookId: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.delete(`/collections/${collectionId}/books/${bookId}`);
    return data;
  }

  // Author APIs
  async getAuthors(search?: string): Promise<ApiResponse<Author[]>> {
    const { data } = await this.client.get('/authors', { params: { search } });
    return data;
  }

  async getAuthor(id: string): Promise<ApiResponse<Author>> {
    const { data } = await this.client.get(`/authors/${id}`);
    return data;
  }

  async getAuthorBooks(id: string): Promise<ApiResponse<Book[]>> {
    const { data } = await this.client.get(`/authors/${id}/books`);
    return data;
  }

  // Recommendation APIs
  async getRecommendations(limit?: number): Promise<ApiResponse<{ books: Book[] }>> {
    const { data } = await this.client.get('/recommendations', { params: { limit } });
    return data;
  }

  // Favorite APIs
  async getFavorites(): Promise<ApiResponse<Book[]>> {
    const { data } = await this.client.get('/favorites');
    return data;
  }

  async checkFavorite(bookId: string): Promise<ApiResponse<{ isFavorite: boolean }>> {
    const { data } = await this.client.get(`/favorites/check/${bookId}`);
    return data;
  }

  async addFavorite(bookId: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.post('/favorites', { bookId });
    return data;
  }

  async removeFavorite(bookId: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.delete(`/favorites/${bookId}`);
    return data;
  }

  // ── Note APIs ────────────────────────────────────────────────────────────────

  async createNote(dto: {
    bookId: string;
    chapterId?: string;
    text: string;
    note?: string;
    cfi?: string;
    percentage?: number;
    color?: string;
    author?: string;
    bookTitle?: string;
  }): Promise<ApiResponse<Note>> {
    const { data } = await this.client.post('/notes', dto);
    return data;
  }

  async getNotes(params?: {
    page?: number;
    limit?: number;
    bookId?: string;
    author?: string;
  }): Promise<ApiResponse<{ items: Note[]; total: number; page: number; limit: number }>> {
    const { data } = await this.client.get('/notes', { params });
    return data;
  }

  async getNotesByBook(bookId: string): Promise<ApiResponse<Note[]>> {
    const { data } = await this.client.get(`/notes/book/${bookId}`);
    return data;
  }

  async getNotesByAuthor(author: string): Promise<ApiResponse<Note[]>> {
    const { data } = await this.client.get(`/notes/author/${encodeURIComponent(author)}`);
    return data;
  }

  async updateNote(noteId: string, dto: { note?: string; color?: string; text?: string }): Promise<ApiResponse<Note>> {
    const { data } = await this.client.put(`/notes/${noteId}`, dto);
    return data;
  }

  async deleteNote(noteId: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.delete(`/notes/${noteId}`);
    return data;
  }

  // ── Highlight APIs ─────────────────────────────────────────────────────────

  async createHighlight(dto: CreateHighlightDto): Promise<ApiResponse<any>> {
    const { data } = await this.client.post('/highlights', dto);
    return data;
  }

  async getHighlights(bookId: string): Promise<ApiResponse<any[]>> {
    const { data } = await this.client.get(`/highlights/${bookId}`);
    return data;
  }

  async updateHighlight(highlightId: string, dto: UpdateHighlightDto): Promise<ApiResponse<any>> {
    const { data } = await this.client.put(`/highlights/${highlightId}`, dto);
    return data;
  }

  async deleteHighlight(highlightId: string): Promise<ApiResponse<void>> {
    const { data } = await this.client.delete(`/highlights/${highlightId}`);
    return data;
  }
}

let apiClientInstance: ApiClient | null = null;

export function initApiClient(config: ApiClientConfig): ApiClient {
  apiClientInstance = new ApiClient(config);
  return apiClientInstance;
}

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    throw new Error('ApiClient not initialized. Call initApiClient first.');
  }
  return apiClientInstance;
}

export { ApiClient };
export default ApiClient;
