export type UserRole = 'admin' | 'user' | 'guest';
export const UserRole = {
  admin: 'admin' as UserRole,
  user: 'user' as UserRole,
  guest: 'guest' as UserRole,
};

export type BookFormat = 'epub' | 'pdf' | 'mobi' | 'azw3' | 'fb2' | 'txt' | 'djvu' | 'other';
export const BookFormat = {
  epub: 'epub' as BookFormat,
  pdf: 'pdf' as BookFormat,
  mobi: 'mobi' as BookFormat,
  azw3: 'azw3' as BookFormat,
  fb2: 'fb2' as BookFormat,
  txt: 'txt' as BookFormat,
  djvu: 'djvu' as BookFormat,
  other: 'other' as BookFormat,
};

export type ReadingStatus = 'unread' | 'reading' | 'completed' | 'abandoned';
export const ReadingStatus = {
  unread: 'unread' as ReadingStatus,
  reading: 'reading' as ReadingStatus,
  completed: 'completed' as ReadingStatus,
  abandoned: 'abandoned' as ReadingStatus,
};

export type TtsJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export const TtsJobStatus = {
  pending: 'pending' as TtsJobStatus,
  processing: 'processing' as TtsJobStatus,
  completed: 'completed' as TtsJobStatus,
  failed: 'failed' as TtsJobStatus,
};

export type TtsVoiceGender = 'male' | 'female' | 'neutral';
export const TtsVoiceGender = {
  male: 'male' as TtsVoiceGender,
  female: 'female' as TtsVoiceGender,
  neutral: 'neutral' as TtsVoiceGender,
};
