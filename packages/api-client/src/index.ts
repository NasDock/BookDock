import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  fileType: 'epub' | 'pdf' | 'mobi' | 'txt';
  filePath: string;
  fileSize: number;
  addedAt: string;
  lastReadAt?: string;
  readingProgress?: number;
  totalPages?: number;
  currentPage?: number;
  description?: string;
  publisher?: string;
  language?: string;
  isbn?: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
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
  lang: string;
  local: boolean;
}

export interface EbookSource {
  id: string;
  name: string;
  type: 'local' | 'webdav' | 'smb' | 'ftp';
  url?: string;
  host?: string;
  basePath?: string;
  username?: string;
  enabled: boolean;
  autoSync: boolean;
  syncIntervalSecs: number;
  formats: string[];
  lastSyncAt?: string;
  lastError?: string;
  bookCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceFileItem {
  path: string;
  name: string;
  size: number;
  lastModified: string;
  isDirectory: boolean;
}

export interface SyncResult {
  sourceId: string;
  status: 'success' | 'partial' | 'failed';
  booksAdded: number;
  booksUpdated: number;
  booksFailed: number;
  errors?: string[];
  syncedAt: string;
}

// ─── Bookmark & Highlight Types ──────────────────────────────────────────────

export interface Bookmark {
  id: string;
  userId: string;
  bookId: string;
  chapterId?: string;
  cfi?: string;
  percentage?: number;
  note?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Highlight {
  id: string;
  userId: string;
  bookId: string;
  chapterId?: string;
  cfi: string;
  startOffset: number;
  endOffset: number;
  text: string;
  color?: string;
  note?: string;
  createdAt: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  serverInfo?: string;
  error?: string;
}

export type SourceType = 'webdav' | 'smb' | 'ftp';

export interface WebDAVConfig {
  url: string;
  username?: string;
  password?: string;
  rejectUnauthorized?: boolean;
  basePath?: string;
}

export interface SMBConfig {
  share: string;
  username?: string;
  password?: string;
  domain?: string;
  port?: number;
  basePath?: string;
}

export interface FTPConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  secure?: boolean;
  rejectUnauthorized?: boolean;
  basePath?: string;
}

export interface CreateSourceInput {
  name: string;
  type: SourceType;
  webdavConfig?: WebDAVConfig;
  smbConfig?: SMBConfig;
  ftpConfig?: FTPConfig;
  autoSync?: boolean;
  syncIntervalSecs?: number;
  formats?: string[];
}

// ─── Membership Types ────────────────────────────────────────────────────────

export type MembershipPlan = 'free' | 'annual' | 'lifetime';

export interface MembershipPlanDto {
  id: MembershipPlan;
  name: string;
  description: string;
  price: number; // in cents
  currency: string;
  interval: string;
  features: string[];
  badge?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  plan: MembershipPlan;
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string;
  autoRenew: boolean;
  createdAt: string;
}

export type PaymentMethod = 'simulated' | 'wechat' | 'alipay';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  plan: MembershipPlan;
  method: PaymentMethod;
  status: PaymentStatus;
  tradeNo?: string;
  qrCode?: string;
  qrCodeExpiredAt?: string;
  paidAt?: string;
  createdAt: string;
}

export interface Usage {
  userId: string;
  plan: MembershipPlan;
  storageUsedBytes: bigint;
  storageLimitBytes: bigint;
  ttsUsedMin: number;
  ttsLimitMin: number;
  booksUploaded: number;
  booksLimit: number;
  collectionsCount: number;
  collectionsLimit: number;
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

  constructor(config: ApiClientConfig) {
    this.getAuthToken = config.getAuthToken;
    this.onAuthError = config.onAuthError;

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

  async register(username: string, password: string, email?: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const { data } = await this.client.post('/auth/register', { username, password, email });
    return data;
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    const { data } = await this.client.get('/auth/me');
    return data;
  }

  // Phone + SMS Auth
  async sendSmsCode(phone: string): Promise<ApiResponse<{ message: string; expiresIn?: number }>> {
    const { data } = await this.client.post('/auth/send-sms', { phone });
    return data;
  }

  async loginWithPhone(phone: string, code: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const { data } = await this.client.post('/auth/login/phone', { phone, code });
    return data;
  }

  async registerWithPhone(phone: string, code: string, username?: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const { data } = await this.client.post('/auth/register/phone', { phone, code, username });
    return data;
  }

  // Membership endpoints
  async getMembershipPlans(): Promise<ApiResponse<MembershipPlanDto[]>> {
    const { data } = await this.client.get('/membership/plans');
    return data;
  }

  async getMembershipPlan(planId: string): Promise<ApiResponse<MembershipPlanDto>> {
    const { data } = await this.client.get(`/membership/plans/${planId}`);
    return data;
  }

  async getSubscription(): Promise<ApiResponse<Subscription | null>> {
    const { data } = await this.client.get('/membership/subscription');
    return data;
  }

  async getUsage(): Promise<ApiResponse<Usage>> {
    const { data } = await this.client.get('/membership/usage');
    return data;
  }

  // Payment endpoints
  async createPayment(plan: MembershipPlan, method: PaymentMethod): Promise<ApiResponse<Payment>> {
    const { data } = await this.client.post('/membership/payment', { plan, method });
    return data;
  }

  async getPayment(paymentId: string): Promise<ApiResponse<Payment>> {
    const { data } = await this.client.get(`/membership/payment/${paymentId}`);
    return data;
  }

  async getPayments(): Promise<ApiResponse<Payment[]>> {
    const { data } = await this.client.get('/membership/payments');
    return data;
  }

  async pollPayment(paymentId: string): Promise<ApiResponse<Payment>> {
    const { data } = await this.client.get(`/membership/payment/${paymentId}/poll`);
    return data;
  }

  async simulatePaymentSuccess(paymentId: string): Promise<ApiResponse<Payment>> {
    const { data } = await this.client.post(`/membership/payment/${paymentId}/simulate`);
    return data;
  }

  // Book endpoints
  async getBooks(params?: { page?: number; limit?: number; search?: string }): Promise<ApiResponse<{ books: Book[]; total: number; page: number }>> {
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

  async getBookFile(id: string): Promise<Blob> {
    const { data } = await this.client.get(`/books/${id}/file`, { responseType: 'blob' });
    return data;
  }

  // Reading progress
  async updateReadingProgress(bookId: string, progress: number, currentPage?: number): Promise<ApiResponse> {
    const { data } = await this.client.put(`/books/${bookId}/progress`, { progress, currentPage });
    return data;
  }

  async getReadingProgress(bookId: string): Promise<ApiResponse<{ progress: number; currentPage?: number }>> {
    const { data } = await this.client.get(`/books/${bookId}/progress`);
    return data;
  }

  async syncReadingSessions(sessions: ReadingSession[]): Promise<ApiResponse> {
    const { data } = await this.client.post('/reading/sync', { sessions });
    return data;
  }

  // TTS endpoints
  async getVoices(): Promise<ApiResponse<TTSVoice[]>> {
    const { data } = await this.client.get('/tts/voices');
    return data;
  }

  async convertToSpeech(text: string, voiceId: string): Promise<Blob> {
    const { data } = await this.client.post('/tts/convert', { text, voiceId }, { responseType: 'blob' });
    return data;
  }

  // Admin endpoints
  async getUsers(params?: { page?: number; limit?: number }): Promise<ApiResponse<{ users: User[]; total: number }>> {
    const { data } = await this.client.get('/admin/users', { params });
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

  // Storage info
  async getStorageInfo(): Promise<ApiResponse<{ used: number; limit: number }>> {
    const { data } = await this.client.get('/storage/info');
    return data;
  }

  // ─── Source (NAS) Management ────────────────────────────────────────────────

  async getSources(): Promise<ApiResponse<EbookSource[]>> {
    const { data } = await this.client.get('/sources');
    return data;
  }

  async getSource(id: string): Promise<ApiResponse<EbookSource>> {
    const { data } = await this.client.get(`/sources/${id}`);
    return data;
  }

  async createSource(source: CreateSourceInput): Promise<ApiResponse<EbookSource>> {
    const { data } = await this.client.post('/sources', source);
    return data;
  }

  async updateSource(id: string, source: Partial<CreateSourceInput>): Promise<ApiResponse<EbookSource>> {
    const { data } = await this.client.put(`/sources/${id}`, source);
    return data;
  }

  async deleteSource(id: string): Promise<ApiResponse> {
    const { data } = await this.client.delete(`/sources/${id}`);
    return data;
  }

  async testSourceConnection(id: string): Promise<ApiResponse<ConnectionTestResult>> {
    const { data } = await this.client.post(`/sources/${id}/test`);
    return data;
  }

  async testSourceConfig(source: CreateSourceInput): Promise<ApiResponse<ConnectionTestResult>> {
    const { data } = await this.client.post('/sources/test-config', source);
    return data;
  }

  async getSourceFiles(id: string, path: string = '/'): Promise<ApiResponse<SourceFileItem[]>> {
    const { data } = await this.client.get(`/sources/${id}/files`, { params: { path } });
    return data;
  }

  async syncSource(id: string): Promise<ApiResponse<SyncResult>> {
    const { data } = await this.client.post(`/sources/${id}/sync`);
    return data;
  }

  // ─── Bookmark & Highlight endpoints ────────────────────────────────────────

  async getBookmarks(bookId: string): Promise<ApiResponse<Bookmark[]>> {
    const { data } = await this.client.get(`/bookmarks/${bookId}`);
    return data;
  }

  async createBookmark(bookmark: {
    bookId: string;
    chapterId?: string;
    cfi?: string;
    percentage?: number;
    note?: string;
    color?: string;
  }): Promise<ApiResponse<Bookmark>> {
    const { data } = await this.client.post('/bookmarks', bookmark);
    return data;
  }

  async updateBookmark(
    bookmarkId: string,
    update: { note?: string; color?: string },
  ): Promise<ApiResponse<Bookmark>> {
    const { data } = await this.client.put(`/bookmarks/${bookmarkId}`, update);
    return data;
  }

  async deleteBookmark(bookmarkId: string): Promise<ApiResponse> {
    const { data } = await this.client.delete(`/bookmarks/${bookmarkId}`);
    return data;
  }

  async getHighlights(bookId: string): Promise<ApiResponse<Highlight[]>> {
    const { data } = await this.client.get(`/highlights/${bookId}`);
    return data;
  }

  async createHighlight(highlight: {
    bookId: string;
    chapterId?: string;
    cfi: string;
    startOffset: number;
    endOffset: number;
    text: string;
    color?: string;
    note?: string;
  }): Promise<ApiResponse<Highlight>> {
    const { data } = await this.client.post('/highlights', highlight);
    return data;
  }

  async updateHighlight(
    highlightId: string,
    update: { note?: string; color?: string },
  ): Promise<ApiResponse<Highlight>> {
    const { data } = await this.client.put(`/highlights/${highlightId}`, update);
    return data;
  }

  async deleteHighlight(highlightId: string): Promise<ApiResponse> {
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
