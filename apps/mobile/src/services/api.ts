/**
 * API Service Layer for BookDock Mobile
 * Wraps @bookdock/api-client with mobile-specific handling
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book, User, ApiResponse, TTSVoice } from '@bookdock/api-client';
import type { ReaderPosition } from '@bookdock/ebook-reader';

// Storage keys
const READING_PROGRESS_KEY = 'bookdock-reading-progress';

// Base API configuration
const API_BASE_URL = 'http://10.79.233.188:3000/api';

// Simple cache interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// In-memory cache
const memoryCache = new Map<string, CacheEntry<unknown>>();

// Cache TTL in milliseconds
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Simple fetch wrapper with error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    // Get auth token from storage
    const authData = await AsyncStorage.getItem('bookdock-auth');
    let token: string | null = null;
    if (authData) {
      const parsed = JSON.parse(authData);
      token = parsed.state?.token;
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}

/**
 * Get cached data or fetch fresh
 */
async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<ApiResponse<T>>,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<ApiResponse<T>> {
  // Check memory cache first
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return { success: true, data: cached.data };
  }

  // Fetch fresh data
  const result = await fetcher();
  if (result.success && result.data) {
    memoryCache.set(key, { data: result.data, timestamp: Date.now(), ttl });
  }
  return result;
}

/**
 * Invalidate cache for a specific key pattern
 */
function invalidateCache(pattern?: string): void {
  if (pattern) {
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern)) {
        memoryCache.delete(key);
      }
    }
  } else {
    memoryCache.clear();
  }
}

// ============ Auth API ============

interface AuthResponse {
  user: User;
  token: string;
}

const authApi = {
  login: async (email: string, password: string): Promise<ApiResponse<AuthResponse>> => {
    return apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register: async (username: string, email: string, password: string): Promise<ApiResponse<AuthResponse>> => {
    return apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  },

  logout: async (): Promise<ApiResponse<void>> => {
    invalidateCache();
    return apiFetch('/auth/logout', { method: 'POST' });
  },

  refreshToken: async (refreshToken: string): Promise<ApiResponse<AuthResponse>> => {
    return apiFetch<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  getProfile: async (): Promise<ApiResponse<User>> => {
    return getCachedOrFetch('user-profile', () =>
      apiFetch<User>('/auth/me')
    );
  },

  updateProfile: async (data: Partial<User>): Promise<ApiResponse<User>> => {
    invalidateCache('user-profile');
    return apiFetch<User>('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<ApiResponse<void>> => {
    return apiFetch('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  requestPasswordReset: async (email: string): Promise<ApiResponse<void>> => {
    return apiFetch('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
};

// ============ Library/Books API ============

interface BooksListResponse {
  books: Book[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface BooksQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'title' | 'author' | 'addedAt' | 'lastReadAt';
  order?: 'asc' | 'desc';
  fileType?: 'epub' | 'pdf' | 'mobi' | 'txt';
}

const libraryApi = {
  getBooks: async (query: BooksQuery = {}): Promise<ApiResponse<BooksListResponse>> => {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    if (query.search) params.set('search', query.search);
    if (query.sort) params.set('sort', query.sort);
    if (query.order) params.set('order', query.order);
    if (query.fileType) params.set('fileType', query.fileType);

    const queryString = params.toString();
    const cacheKey = `books-${queryString || 'all'}`;

    return getCachedOrFetch(cacheKey, () =>
      apiFetch<BooksListResponse>(`/books?${queryString}`)
    );
  },

  getBook: async (bookId: string): Promise<ApiResponse<Book>> => {
    return getCachedOrFetch(`book-${bookId}`, () =>
      apiFetch<Book>(`/books/${bookId}`)
    );
  },

  addBook: async (bookData: Partial<Book>): Promise<ApiResponse<Book>> => {
    invalidateCache('books-');
    return apiFetch<Book>('/books', {
      method: 'POST',
      body: JSON.stringify(bookData),
    });
  },

  updateBook: async (bookId: string, bookData: Partial<Book>): Promise<ApiResponse<Book>> => {
    invalidateCache('books-');
    invalidateCache(`book-${bookId}`);
    return apiFetch<Book>(`/books/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify(bookData),
    });
  },

  deleteBook: async (bookId: string): Promise<ApiResponse<void>> => {
    invalidateCache('books-');
    invalidateCache(`book-${bookId}`);
    return apiFetch(`/books/${bookId}`, { method: 'DELETE' });
  },

  getBookContent: async (bookId: string): Promise<ApiResponse<string>> => {
    // Returns the actual book file content or download URL
    return apiFetch<string>(`/books/${bookId}/content`);
  },

  searchBooks: async (query: string): Promise<ApiResponse<Book[]>> => {
    return getCachedOrFetch(
      `search-${query}`,
      () => apiFetch<Book[]>(`/books/search?q=${encodeURIComponent(query)}`),
      2 * 60 * 1000 // 2 minutes for search results
    );
  },
};

// ============ Reading Progress API ============

interface ReadingProgressResponse {
  bookId: string;
  progress: ReaderPosition;
  updatedAt: string;
}

const progressApi = {
  getProgress: async (bookId: string): Promise<ApiResponse<ReadingProgressResponse>> => {
    // Try local storage first for faster loading
    try {
      const localData = await AsyncStorage.getItem(`${READING_PROGRESS_KEY}_${bookId}`);
      if (localData) {
        const parsed = JSON.parse(localData);
        return {
          success: true,
          data: {
            bookId,
            progress: parsed.position,
            updatedAt: parsed.lastReadAt,
          },
        };
      }
    } catch (e) {
      // Ignore local storage errors
    }

    return apiFetch<ReadingProgressResponse>(`/progress/${bookId}`);
  },

  saveProgress: async (bookId: string, progress: ReaderPosition): Promise<ApiResponse<void>> => {
    // Always save to local storage immediately for offline support
    try {
      await AsyncStorage.setItem(
        `${READING_PROGRESS_KEY}_${bookId}`,
        JSON.stringify({
          position: progress,
          lastReadAt: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error('Failed to save progress locally:', e);
    }

    // Then sync to server
    return apiFetch(`/progress/${bookId}`, {
      method: 'PUT',
      body: JSON.stringify(progress),
    });
  },

  syncAllProgress: async (): Promise<ApiResponse<ReadingProgressResponse[]>> => {
    // Get all local progress entries and sync them
    try {
      const keys = await AsyncStorage.getAllKeys();
      const progressKeys = keys.filter((k) => k.startsWith(READING_PROGRESS_KEY));
      const localProgress: { bookId: string; progress: ReaderPosition }[] = [];

      for (const key of progressKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          const bookId = key.replace(`${READING_PROGRESS_KEY}_`, '');
          localProgress.push({ bookId, progress: parsed.position });
        }
      }

      return apiFetch<ReadingProgressResponse[]>('/progress/sync', {
        method: 'POST',
        body: JSON.stringify({ progress: localProgress }),
      });
    } catch (e) {
      return {
        success: false,
        error: 'Failed to sync progress',
      };
    }
  },

  deleteProgress: async (bookId: string): Promise<ApiResponse<void>> => {
    // Remove local
    await AsyncStorage.removeItem(`${READING_PROGRESS_KEY}_${bookId}`);
    // Remove from server
    return apiFetch(`/progress/${bookId}`, { method: 'DELETE' });
  },
};

// ============ TTS API ============

interface TTSChapter {
  id: string;
  title: string;
  startOffset: number;
  endOffset: number;
  duration: number;
}

interface TTSBookMeta {
  bookId: string;
  title: string;
  author: string;
  chapters: TTSChapter[];
  totalDuration: number;
  coverUrl?: string;
}

interface TTSChapterContent {
  chapterId: string;
  text: string;
  audioUrl?: string;
}

const ttsApi = {
  getBookMeta: async (bookId: string): Promise<ApiResponse<TTSBookMeta>> => {
    return getCachedOrFetch(`tts-meta-${bookId}`, () =>
      apiFetch<TTSBookMeta>(`/tts/${bookId}/meta`)
    );
  },

  getChapterContent: async (bookId: string, chapterId: string): Promise<ApiResponse<TTSChapterContent>> => {
    return apiFetch<TTSChapterContent>(`/tts/${bookId}/chapters/${chapterId}`);
  },

  getVoices: async (): Promise<ApiResponse<TTSVoice[]>> => {
    return getCachedOrFetch('tts-voices', () =>
      apiFetch<TTSVoice[]>('/tts/voices'),
      30 * 60 * 1000 // 30 minutes for voice list
    );
  },

  generateAudio: async (
    bookId: string,
    chapterId: string,
    voiceId: string,
    options?: {
      speed?: number;
      pitch?: number;
    }
  ): Promise<ApiResponse<{ audioUrl: string }>> => {
    return apiFetch<{ audioUrl: string }>(`/tts/${bookId}/chapters/${chapterId}/audio`, {
      method: 'POST',
      body: JSON.stringify({ voiceId, ...options }),
    });
  },
};

// ============ User/Settings API ============

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  libraryViewMode: 'grid' | 'list';
  defaultFontSize: number;
  defaultLineHeight: number;
  defaultTTSRate: number;
  defaultTTSVoice: string | null;
  autoSaveProgress: boolean;
  notificationsEnabled: boolean;
  readingReminderTime?: string;
}

const userSettingsApi = {
  getSettings: async (): Promise<ApiResponse<UserSettings>> => {
    return getCachedOrFetch('user-settings', () =>
      apiFetch<UserSettings>('/settings')
    );
  },

  updateSettings: async (settings: Partial<UserSettings>): Promise<ApiResponse<UserSettings>> => {
    invalidateCache('user-settings');
    return apiFetch<UserSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },
};

// ============ Collections API ============

interface Collection {
  id: string;
  name: string;
  description?: string;
  bookCount: number;
  books: Book[];
  createdAt: string;
  updatedAt: string;
}

const collectionsApi = {
  getCollections: async (): Promise<ApiResponse<Collection[]>> => {
    return getCachedOrFetch('collections', () =>
      apiFetch<Collection[]>('/collections')
    );
  },

  getCollection: async (collectionId: string): Promise<ApiResponse<Collection>> => {
    return getCachedOrFetch(`collection-${collectionId}`, () =>
      apiFetch<Collection>(`/collections/${collectionId}`)
    );
  },

  createCollection: async (name: string, description?: string): Promise<ApiResponse<Collection>> => {
    invalidateCache('collections');
    return apiFetch<Collection>('/collections', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },

  updateCollection: async (
    collectionId: string,
    data: { name?: string; description?: string }
  ): Promise<ApiResponse<Collection>> => {
    invalidateCache('collections');
    invalidateCache(`collection-${collectionId}`);
    return apiFetch<Collection>(`/collections/${collectionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteCollection: async (collectionId: string): Promise<ApiResponse<void>> => {
    invalidateCache('collections');
    invalidateCache(`collection-${collectionId}`);
    return apiFetch(`/collections/${collectionId}`, { method: 'DELETE' });
  },

  addBookToCollection: async (collectionId: string, bookId: string): Promise<ApiResponse<void>> => {
    invalidateCache(`collection-${collectionId}`);
    return apiFetch(`/collections/${collectionId}/books`, {
      method: 'POST',
      body: JSON.stringify({ bookId }),
    });
  },

  removeBookFromCollection: async (collectionId: string, bookId: string): Promise<ApiResponse<void>> => {
    invalidateCache(`collection-${collectionId}`);
    return apiFetch(`/collections/${collectionId}/books/${bookId}`, {
      method: 'DELETE',
    });
  },
};

// ============ Highlights/Notes API ============

interface Highlight {
  id: string;
  bookId: string;
  chapterId?: string;
  startOffset: number;
  endOffset: number;
  text: string;
  color?: string;
  note?: string;
  createdAt: string;
}

const highlightsApi = {
  getHighlights: async (bookId: string): Promise<ApiResponse<Highlight[]>> => {
    return getCachedOrFetch(`highlights-${bookId}`, () =>
      apiFetch<Highlight[]>(`/books/${bookId}/highlights`)
    );
  },

  createHighlight: async (bookId: string, highlight: Omit<Highlight, 'id' | 'createdAt'>): Promise<ApiResponse<Highlight>> => {
    invalidateCache(`highlights-${bookId}`);
    return apiFetch<Highlight>(`/books/${bookId}/highlights`, {
      method: 'POST',
      body: JSON.stringify(highlight),
    });
  },

  updateHighlight: async (
    bookId: string,
    highlightId: string,
    data: Partial<Highlight>
  ): Promise<ApiResponse<Highlight>> => {
    invalidateCache(`highlights-${bookId}`);
    return apiFetch<Highlight>(`/books/${bookId}/highlights/${highlightId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteHighlight: async (bookId: string, highlightId: string): Promise<ApiResponse<void>> => {
    invalidateCache(`highlights-${bookId}`);
    return apiFetch(`/books/${bookId}/highlights/${highlightId}`, {
      method: 'DELETE',
    });
  },
};

// ============ Export API Client ============

export const apiClient = {
  auth: authApi,
  books: libraryApi,
  progress: progressApi,
  tts: ttsApi,
  settings: userSettingsApi,
  collections: collectionsApi,
  highlights: highlightsApi,

  // Utility methods
  invalidateCache,
  clearCache: () => memoryCache.clear(),
};

export type { BooksQuery, UserSettings };
export type { TTSBookMeta, TTSChapter, TTSChapterContent };
export type { Collection, Highlight };
