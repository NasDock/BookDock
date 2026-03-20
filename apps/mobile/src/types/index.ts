// Re-export types from api-client for mobile-specific usage
export type { Book, User, ApiResponse, ReaderConfig, ReaderMode } from '@bookdock/api-client';
export type { ReaderPosition, ReaderFormat } from '@bookdock/ebook-reader';

// Mobile-specific types
export interface LocalBook extends Book {
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
