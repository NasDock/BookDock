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
  path?: string;
  enabled: boolean;
  lastSyncAt?: string;
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
