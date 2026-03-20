// Re-export types from api-client for mobile-specific usage
export type { Book, User, ApiResponse } from '@bookdock/api-client';
export type { ReaderPosition, ReaderConfig, ReaderMode, ReaderFormat } from '@bookdock/ebook-reader';
import type { ReaderPosition } from '@bookdock/ebook-reader';

// Mobile-specific types - explicit definition to avoid module resolution issues
export interface LocalBook {
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
  localPath?: string;
  isDownloaded: boolean;
  lastSyncedAt?: string;
}

export interface ReadingState {
  bookId: string;
  position: ReaderPosition;
  lastReadAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
