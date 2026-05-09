import { registerAs } from '@nestjs/config';

export const AppConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  jwtSecret: process.env.JWT_SECRET || 'bookdock-dev-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8080',
  corsOrigins: process.env.CORS_ORIGINS || '*',
  nasEbookPath: process.env.NAS_EBOOK_PATH || '/data/ebooks',
  nasAudioPath: process.env.NAS_AUDIO_PATH || '/data/audio',
  sourceLocalPath: process.env.SOURCE_LOCAL_PATH || '/data/sources',
  ttsApiUrl: process.env.TTS_API_URL || 'http://localhost:5000',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
}));
