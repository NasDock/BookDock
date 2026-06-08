import { registerAs } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const DEFAULT_JWT_SECRET = 'bookdock-dev-secret-change-in-production';
const JWT_SECRET_FILE = process.env.JWT_SECRET_FILE || '/data/db/.jwt_secret';

function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  try {
    if (existsSync(JWT_SECRET_FILE)) {
      return readFileSync(JWT_SECRET_FILE, 'utf-8').trim();
    }
  } catch {
    // ignore read errors
  }

  const generated = randomBytes(32).toString('hex');

  try {
    const dir = dirname(JWT_SECRET_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(JWT_SECRET_FILE, generated, { mode: 0o600 });
  } catch {
    // if we can't write (e.g., dev environment without /data/db),
    // just use the generated secret in memory
  }

  return generated;
}

export const AppConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8088', 10),
  jwtSecret: resolveJwtSecret(),
  jwtExpiry: process.env.JWT_EXPIRY || '7d',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8088',
  corsOrigins: process.env.CORS_ORIGINS || '*',
  nasEbookPath: process.env.NAS_EBOOK_PATH || '/data/ebooks',
  nasAudioPath: process.env.NAS_AUDIO_PATH || '/data/audio',
  sourceLocalPath: process.env.SOURCE_LOCAL_PATH || '/data/sources',
  cachePath: process.env.CACHE_PATH || '',
  // TTS service integration
  ttsServiceUrl: process.env.TTS_SERVICE_URL || 'http://localhost:5000',
  ttsDefaultProvider: process.env.TTS_DEFAULT_PROVIDER || 'edge',
  ttsAudioCacheDir: process.env.TTS_AUDIO_CACHE_DIR || '/data/audio',
  ttsMaxTextLength: parseInt(process.env.TTS_MAX_TEXT_LENGTH || '3000', 10),
  ttsMaxRequestTimeoutMs: parseInt(process.env.TTS_MAX_REQUEST_TIMEOUT_MS || '30000', 10),
}));
