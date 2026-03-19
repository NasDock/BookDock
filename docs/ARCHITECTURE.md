# BookDock (书仓) — Technical Architecture

> **Vision**: A self-hosted e-book reading platform for NAS users that puts the library and audio narration directly in your hands — web, mobile, and desktop, all in one cohesive experience.

---

## Table of Contents

1. [Monorepo Structure](#1-monorepo-structure)
2. [Platform App Architecture](#2-platform-app-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Database Schema](#4-database-schema)
5. [API Design](#5-api-design)
6. [Authentication](#6-authentication)
7. [E-Book Parsing](#7-e-book-parsing)
8. [TTS Integration](#8-tts-integration)
9. [Public E-Book Data Sources](#9-public-e-book-data-sources)
10. [Docker Compose](#10-docker-compose)
11. [NAS Deployment](#11-nas-deployment)

---

## 1. Monorepo Structure

```
BookDock/
├── apps/
│   ├── web/                    # React SPA (Vite)
│   ├── mobile/                 # React Native (Expo)
│   └── desktop/                # Tauri (Rust + React)
├── packages/
│   ├── ui/                     # Shared UI component library (Radix + Tailwind)
│   ├── hooks/                  # Shared React hooks (reading, TTS, sync)
│   ├── api-client/             # Typed REST client (TanStack Query wrappers)
│   ├── ebook-parser/           # EPUB/PDF/MOBI parsing (Node.js)
│   ├── tts-core/               # TTS abstraction layer (Web Speech + server)
│   ├── auth/                   # Auth logic (JWT, NAS account binding)
│   ├── types/                  # Shared TypeScript types
│   └── config/                 # Shared ESLint, TypeScript, Vite configs
├── services/                   # Backend Docker services (in repo)
│   ├── api/                    # NestJS REST API server
│   ├── indexer/                # E-book metadata/indexer worker
│   ├── tts/                    # TTS generation service
│   └── auth/                   # Auth microservice (JWT issuer)
├── infra/                      # Docker, nginx, certificates
├── docs/                       # Architecture, runbooks, API spec
├── pnpm-workspace.yaml
└── turbo.json                  # Turborepo pipeline config
```

### Key Conventions

| Concern | Choice |
|---|---|
| Package manager | pnpm (strict, fast, monorepo-native) |
| Build orchestrator | Turborepo |
| Shared TS config | `packages/config` |
| Shared UI primitives | `packages/ui` (Radix UI + Tailwind) |
| API types | `packages/types` (generated from API schema) |
| State sync | TanStack Query + optimistic updates |
| Offline-first (mobile) | expo-sqlite + background sync |
| Desktop window | Tauri v2 (Rust, WebView2 on Windows, WebKit on macOS/Linux) |

---

## 2. Platform App Architecture

### 2.1 Web App (`apps/web`)

```
apps/web/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── LibraryPage.tsx      # Book grid with filters/search
│   │   ├── ReaderPage.tsx       # EPUB/PDF reader view
│   │   ├── AudioPlayerPage.tsx  # TTS playback with chapter nav
│   │   ├── SettingsPage.tsx
│   │   └── AuthPage.tsx
│   ├── components/
│   │   ├── reader/              # epub.js renderer, pdf.js canvas
│   │   ├── library/             # BookCard, ShelfGrid, SearchBar
│   │   ├── tts/                 # Player controls, speed, voice select
│   │   └── ui/                  # Shared UI components
│   ├── hooks/                   # Platform-specific hooks
│   ├── store/                   # Zustand stores (library, reader, player)
│   └── api/                     # TanStack Query hooks → api-client pkg
├── public/
│   └── fonts/
├── vite.config.ts
└── Dockerfile
```

**Stack**: Vite 5, React 18, TanStack Query v5, Zustand, react-router-dom v6, epub.js, pdf.js

**Key behaviors**:
- Lazy-load reader engine (only when a book is opened)
- WebSocket for real-time sync of reading progress across devices
- Service Worker for offline reading of cached EPUB/PDF chapters
- `localStorage` for guest/library state; JWT for authenticated sessions

---

### 2.2 Mobile App (`apps/mobile`)

```
apps/mobile/
├── app/                        # Expo Router file-based routing
│   ├── (tabs)/
│   │   ├── library.tsx
│   │   ├── reader.tsx
│   │   ├── audio.tsx
│   │   └── settings.tsx
│   └── _layout.tsx
├── components/
├── hooks/
├── services/
│   ├── audiobookService.ts     # Background audio playback
│   └── offlineSync.ts         # SQLite + background fetch
├── native/
│   └── TTSModule.ts           # TurboModule for native TTS
├── babel.config.js
└── app.json
```

**Stack**: Expo SDK 52, Expo Router, Tamagui (cross-platform UI), expo-sqlite, expo-av (audio), expo-background-fetch

**Key behaviors**:
- SQLite local database mirrors server books/progress for offline reading
- Background audio playback via `expo-av` (lockscreen controls, Bluetooth headset support)
- Background sync every 15 min when network available
- Native TTS via TurboModule for smoother performance than JS bridge
- Biometric unlock (Face ID / fingerprint) for local library

---

### 2.3 Desktop App (`apps/desktop`)

```
apps/desktop/
├── src/
│   ├── main.tsx                 # Tauri entry
│   ├── App.tsx
│   └── lib/
│       ├── fileSystem.ts        # Native FS access via Tauri APIs
│       └── windowManager.ts    # Multi-window: reader + library
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/           # Tauri IPC commands (Rust)
│   │   └── db.rs               # SQLite via rusqlite
│   ├── Cargo.toml
│   └── tauri.conf.json
└── vite.config.ts
```

**Stack**: Tauri v2, React 18, same UI component library as web (`packages/ui`)

**Key behaviors**:
- Native file system access: drag-and-drop books, watch directories for new files
- SQLite local cache (same schema as mobile) for offline support
- System tray with mini-player for TTS audio
- Global shortcut: `Cmd+Shift+B` to open quick reader overlay
- macOS: Touch Bar support for reader controls
- Native window management: side-by-side library + reader on wide screens

---

## 3. Backend Architecture

All backend services run as Docker containers on the NAS.

### 3.1 Service Map

```
┌─────────────────────────────────────────────────────────┐
│                     NAS Host                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Docker Compose Overlay               │  │
│  │                                                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐           │  │
│  │  │   API   │  │ Indexer │  │   TTS   │           │  │
│  │  │ (NestJS)│  │ (BullMQ)│  │ (Piper) │           │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘           │  │
│  │       │            │            │                 │  │
│  │  ┌────┴────────────┴────────────┴────┐           │  │
│  │  │         PostgreSQL 16             │           │  │
│  │  │  (users, books, progress, cache)  │           │  │
│  │  └───────────────────────────────────┘           │  │
│  │                                                   │  │
│  │  ┌─────────────────┐  ┌────────────────────┐    │  │
│  │  │   Redis 7       │  │  MinIO / NAS FS     │    │  │
│  │  │  (sessions, MQ,  │  │  (ebook storage,   │    │  │
│  │  │   rate limit)    │  │   TTS audio cache) │    │  │
│  │  └─────────────────┘  └────────────────────┘    │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────┐    │  │
│  │  │  Traefik (reverse proxy + Let's Encrypt)│    │  │
│  │  └─────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Service Responsibilities

| Service | Language/Framework | Responsibility |
|---|---|---|
| **api** | NestJS (Node 22, TypeScript) | REST API, WebSocket gateway, file upload, auth |
| **indexer** | Node 22 + BullMQ (Redis-backed) | EPUB/PDF metadata extraction, cover generation, full-text indexing |
| **tts** | Python 3.12 + Piper TTS | Server-side TTS generation, audio caching |
| **auth** | NestJS (JWT-only, stateless) | JWT issuance, token refresh, NAS account binding |

> **Note**: The `auth` service is embedded in the `api` service for simplicity in single-host deployments. On a multi-host NAS cluster, it can be extracted as a separate sidecar.

### 3.3 Data Flow: Book Upload

```
Client (web/mobile/desktop)
  │
  │ POST /api/v1/books/upload (multipart)
  ▼
API Service
  ├── Validates JWT + membership tier
  ├── Saves file to NAS storage (/data/books/{userId}/{bookId}/book.{ext})
  ├── Emits job to Redis queue: "index-book"
  └── Returns 202 Accepted { jobId }
  │
Index Worker (BullMQ)
  ├── Parses EPUB/PDF/MOBI (epub2, pdf-parse, python-mobi)
  ├── Extracts metadata: title, author, ISBN, cover, TOC, language
  ├── Generates cover thumbnail (sharp)
  ├── Extracts plain text for full-text search (pgSQL full-text index)
  └── Updates DB: books table, book_chapters table, book_search (tsvector)
  │
TTS Worker (triggered per-chapter on first audio request)
  ├── Checks TTS cache (book_id + chapter_hash)
  ├── If miss: sends text to Piper TTS service
  ├── Caches audio as MP3/OGG in /data/tts-cache/{bookId}/{chapterId}.mp3
  └── Returns cached URL
```

---

## 4. Database Schema

PostgreSQL 16 with the following schema:

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users & Auth ───────────────────────────────────────────

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT,                        -- NULL for NAS-only accounts
    display_name  TEXT,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,                -- soft delete
    -- NAS account binding
    nas_username  TEXT,                       -- linked NAS system account
    nas_uid       INTEGER,                    -- NAS UID (e.g. 1000)
    -- Membership
    membership_tier TEXT NOT NULL DEFAULT 'free'
                    CHECK (membership_tier IN ('free', 'premium', 'family')),
    membership_expires_at TIMESTAMPTZ
);

-- JWT refresh tokens (short-lived, stored in Redis is preferred;
-- this table is a fallback for session auditing)
CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL,               -- SHA-256 of the raw token
    device_info  TEXT,                       -- User-Agent fingerprint
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Books ───────────────────────────────────────────────────

CREATE TABLE books (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_id       UUID NOT NULL REFERENCES users(id),
    -- File metadata
    filename          TEXT NOT NULL,
    file_path         TEXT NOT NULL,         -- NAS storage path
    file_size         BIGINT NOT NULL,
    file_hash         TEXT,                  -- SHA-256 of raw file
    file_format       TEXT NOT NULL CHECK (file_format IN ('epub','pdf','mobi','azw3')),
    -- Parsed metadata
    title             TEXT,
    author            TEXT,
    isbn              TEXT,
    publisher         TEXT,
    language          TEXT,
    publication_date  DATE,
    description       TEXT,
    cover_path        TEXT,                  -- path to extracted/generated cover
    -- Indexing
    search_vector     TSVECTOR,              -- full-text search (title + author + description)
    chapter_count     INTEGER DEFAULT 0,
    word_count        INTEGER DEFAULT 0,
    -- Status
    index_status      TEXT NOT NULL DEFAULT 'pending'
                       CHECK (index_status IN ('pending','processing','done','failed')),
    index_error       TEXT,
    tts_status        TEXT NOT NULL DEFAULT 'unavailable'
                       CHECK (tts_status IN ('unavailable','pending','generating','done','failed')),
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index on books
CREATE INDEX idx_books_search ON books USING GIN(search_vector);
CREATE INDEX idx_books_uploader ON books(uploader_id);
CREATE INDEX idx_books_title_trgm ON books USING GIN(title gin_trgm_ops);

-- Book chapters (for EPUB navigation + TTS chunking)
CREATE TABLE book_chapters (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id       UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL,
    title         TEXT,
    start_cfi     TEXT,           -- EPUB CFI location
    start_page    INTEGER,        -- PDF page number
    end_cfi       TEXT,
    end_page      INTEGER,
    word_count    INTEGER DEFAULT 0,
    UNIQUE(book_id, chapter_index)
);

CREATE INDEX idx_chapters_book ON book_chapters(book_id);

-- ─── Reading Progress ────────────────────────────────────────

CREATE TABLE reading_progress (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id          UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    -- Location
    location_type    TEXT NOT NULL CHECK (location_type IN ('cfi','page')),
    location_value   TEXT NOT NULL,       -- e.g. "epubcfi(/6/42[...])" or "142"
    -- Context
    scroll_position  INTEGER DEFAULT 0,  -- for PDF reflow
    font_size        INTEGER DEFAULT 100,
    theme            TEXT DEFAULT 'light', -- 'light'|'sepia'|'dark'
    line_height      NUMERIC(3,2) DEFAULT 1.5,
    margin           INTEGER DEFAULT 16,
    -- Stats
    percent_complete NUMERIC(5,2) DEFAULT 0.0,
    time_spent_secs  INTEGER DEFAULT 0,
    last_read_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Unique per user per book
    UNIQUE(user_id, book_id)
);

CREATE INDEX idx_progress_user ON reading_progress(user_id);
CREATE INDEX idx_progress_book ON reading_progress(book_id);

-- ─── Bookmarks ────────────────────────────────────────────────

CREATE TABLE bookmarks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id       UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    location_type TEXT NOT NULL,
    location_value TEXT NOT NULL,
    note          TEXT,
    color         TEXT DEFAULT 'yellow',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Memberships / Plans ──────────────────────────────────────

CREATE TABLE membership_plans (
    id               TEXT PRIMARY KEY,     -- 'free' | 'premium' | 'family'
    name             TEXT NOT NULL,
    max_books        INTEGER NOT NULL,     -- 0 = unlimited
    max_storage_gb   NUMERIC(5,2) NOT NULL,
    tts_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    family_seats     INTEGER DEFAULT 1,
    price_monthly_usd NUMERIC(6,2)
);

-- Pre-populated:
INSERT INTO membership_plans (id, name, max_books, max_storage_gb, tts_enabled, family_seats, price_monthly_usd) VALUES
  ('free',    'Free',     50,   5.0, FALSE, 1,  0.00),
  ('premium', 'Premium',  0,  50.0, TRUE,  1,  4.99),
  ('family',  'Family',   0, 100.0, TRUE,  5,  9.99);

-- Family seat management
CREATE TABLE family_members (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_email  TEXT NOT NULL,
    member_user_id UUID REFERENCES users(id),
    invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at     TIMESTAMPTZ,
    UNIQUE(owner_id, member_email)
);

-- ─── TTS Cache ───────────────────────────────────────────────

CREATE TABLE tts_cache (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id       UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id    UUID NOT NULL REFERENCES book_chapters(id) ON DELETE CASCADE,
    voice_id      TEXT NOT NULL,           -- e.g. "en_US-amy-medium"
    text_hash     TEXT NOT NULL,           -- SHA-256 of source text (for cache invalidation)
    audio_path    TEXT NOT NULL,           -- /data/tts-cache/{bookId}/{chapterId}_{voiceId}.mp3
    duration_ms   INTEGER NOT NULL,
    file_size     BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count  INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ,
    UNIQUE(book_id, chapter_id, voice_id, text_hash)
);

CREATE INDEX idx_tts_cache_book ON tts_cache(book_id);
CREATE INDEX idx_tts_cache_access ON tts_cache(last_accessed);

-- ─── Audit Log ───────────────────────────────────────────────

CREATE TABLE audit_log (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id),
    action     TEXT NOT NULL,              -- 'book.upload' | 'tts.generate' | 'auth.login' ...
    resource   TEXT,
    resource_id UUID,
    metadata   JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_time ON audit_log(created_at DESC);
```

---

## 5. API Design

Base URL: `https://bookdock.local/api/v1`

### 5.1 Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account (email + password) |
| `POST` | `/auth/login` | Login, returns `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Revoke refresh token |
| `POST` | `/auth/nas-bind` | Bind to NAS system account (LDAP / SMB username) |
| `GET` | `/auth/me` | Current user profile |

### 5.2 Books

| Method | Path | Description |
|---|---|---|
| `GET` | `/books` | List user's library (paginated, filterable) |
| `POST` | `/books/upload` | Upload e-book (multipart) |
| `GET` | `/books/:id` | Book metadata |
| `PATCH` | `/books/:id` | Update book metadata |
| `DELETE` | `/books/:id` | Remove book |
| `GET` | `/books/:id/stream` | Stream book file (range-request aware) |
| `GET` | `/books/:id/chapters` | Chapter list with navigation CFI/page anchors |
| `GET` | `/books/:id/chapters/:cid/content` | Chapter text content (for TTS) |
| `GET` | `/books/:id/search?q=` | Full-text search within a book |
| `GET` | `/books/:id/cover` | Cover image |

### 5.3 Reading Progress

| Method | Path | Description |
|---|---|---|
| `GET` | `/progress` | All progress records for current user |
| `PUT` | `/progress/:bookId` | Save reading progress (location, theme, stats) |
| `GET` | `/progress/:bookId` | Get progress for a specific book |
| `GET` | `/progress/activity` | Recent reading activity feed |

### 5.4 Bookmarks

| Method | Path | Description |
|---|---|---|
| `GET` | `/bookmarks` | List bookmarks |
| `POST` | `/bookmarks` | Create bookmark |
| `PATCH` | `/bookmarks/:id` | Update bookmark |
| `DELETE` | `/bookmarks/:id` | Delete bookmark |

### 5.5 TTS

| Method | Path | Description |
|---|---|---|
| `GET` | `/tts/voices` | List available TTS voices |
| `POST` | `/tts/generate` | Trigger TTS generation for a chapter |
| `GET` | `/tts/chapter/:chapterId` | Get audio URL (cached or generating) |
| `GET` | `/tts/chapter/:chapterId/status` | Check generation status |
| `DELETE` | `/tts/chapter/:chapterId/cache` | Purge cached audio |

### 5.6 Public Metadata

| Method | Path | Description |
|---|---|---|
| `GET` | `/metadata/isbn/:isbn` | Fetch metadata by ISBN (Open Library → Google Books fallback) |
| `GET` | `/metadata/search?q=` | Search Open Library / Google Books |
| `GET` | `/metadata/cover/:isbn` | Get cover by ISBN |

### 5.7 Membership

| Method | Path | Description |
|---|---|---|
| `GET` | `/plans` | List available plans |
| `GET` | `/membership` | Current user's membership details |
| `POST` | `/family/invite` | Invite family member |
| `DELETE` | `/family/members/:id` | Remove family member |

### Request/Response Shapes (examples)

**POST /books/upload**
```
Content-Type: multipart/form-data
Authorization: Bearer <jwt>

Response 202:
{
  "jobId": "uuid",
  "book": { "id": "uuid", "filename": "foo.epub", "status": "pending" }
}
```

**PUT /progress/:bookId**
```json
{
  "locationType": "cfi",
  "locationValue": "epubcfi(/6/42[...])",
  "percentComplete": 34.7,
  "timeSpentSecs": 1842,
  "fontSize": 110,
  "theme": "sepia"
}
```

**POST /tts/generate**
```json
// Request
{ "chapterId": "uuid", "voiceId": "en_US-amy-medium" }

// Response 202
{ "jobId": "uuid", "status": "queued", "estimatedSeconds": 30 }
```

---

## 6. Authentication

### 6.1 JWT Strategy

```
┌──────────────────┐      ┌──────────────────┐
│   Client         │      │   API Service    │
│                  │      │                  │
│  accessToken  ───┼─────►│  Verify RS256    │
│  (15min, JWT)    │      │  Check expiry     │
│                  │      │  Extract userId   │
│  refreshToken ───┼────► │  Store token hash │
│  (7d, opaque)    │      │  in DB / Redis   │
└──────────────────┘      └──────────────────┘
```

- **Access Token**: JWT (RS256), 15-minute expiry, contains `{ sub: userId, tier, email }`
- **Refresh Token**: Opaque, stored as hash in `refresh_tokens` table, 7-day expiry, 1:1 device mapping
- **Signing keys**: RSA-2048 key pair generated on first boot; stored at `/data/keys/{private,public}.pem`
- **Rotation**: On every `/auth/refresh`, a new refresh token is issued and the old one is invalidated (rotation)

### 6.2 NAS Account Binding

Users can bind their BookDock account to their NAS system account (e.g., the admin account used for SMB shares):

```
POST /auth/nas-bind
{ "nasUsername": "admin", "nasPassword": "..." }

// Server validates against:
//   1. SMB/CIFS (smbclient) — verify credentials work
//   2. Or LDAP (if NAS supports LDAP auth)
// On success: link nas_username + nas_uid to users table
```

Benefits of binding:
- Single NAS login for file access permissions
- Library folders can be shared via SMB/NFS using existing NAS permissions
- Family members can be managed via NAS user groups

### 6.3 Membership Tier Enforcement

Every API route that accesses paid features checks `membership_tier`:

```typescript
// API Guard pseudocode
function requireTier(tier: 'free' | 'premium' | 'family') {
  const user = getCurrentUser();
  const tierOrder = { free: 0, premium: 1, family: 2 };
  if (tierOrder[user.tier] < tierOrder[tier]) {
    throw new HttpException(402, 'Upgrade to Premium');
  }
}
```

---

## 7. E-Book Parsing

### 7.1 Supported Formats

| Format | Client Library | Server Library | Notes |
|---|---|---|---|
| EPUB 2/3 | `epub.js` | `epub2` + `epub3` (Node) | CFI navigation, reflow |
| PDF | `pdf.js` | `pdf-parse` (Node) | Page-based, annotations |
| MOBI / AZW3 | — (converted) | `python-mobi` (server) | Converted to EPUB for reading |

### 7.2 Server-Side Parsing (Indexer Service)

The indexer extracts:

```typescript
interface ParsedBook {
  metadata: {
    title: string;
    author: string[];
    isbn?: string;
    publisher?: string;
    language?: string;
    publicationDate?: Date;
    description?: string;
    coverImage?: Buffer; // extracted cover
  };
  chapters: {
    title: string;
    startCfi?: string;    // EPUB CFI
    startPage?: number;   // PDF page
    endCfi?: string;
    endPage?: number;
    htmlContent: string;  // rendered HTML
    plainText: string;    // for TTS and search
    wordCount: number;
  }[];
  wordCount: number;
}
```

### 7.3 Client-Side Rendering

**EPUB**: `epub.js` renders in a scrollable div. CFI locations are stable across renders. Supports two-column layout on wide screens.

**PDF**: `pdf.js` renders each page onto a `<canvas>`. Zoom levels: 75%, 100%, 125%, 150%, fit-width. Text layer (`TextLayer` API) enables selection and search.

**Font loading**: Embedded fonts in EPUB are extracted and loaded via `@font-face`. Fallback to system fonts.

### 7.4 Offline Reading

```
Web:     Service Worker caches chapters on read (stale-while-revalidate)
Mobile:  expo-sqlite stores parsed chapter HTML; background sync on reconnect
Desktop: Tauri FS APIs read from local NAS mount
```

---

## 8. TTS Integration

### 8.1 Dual Strategy

```
┌─────────────────────────────────────────────────────────┐
│                    TTS Request Flow                      │
│                                                         │
│  Client                                                 │
│    │                                                    │
│    ├─► Web Speech API (SpeechSynthesis)                │
│    │   - Zero latency (real-time)                      │
│    │   - Works offline for pre-cached voices            │
│    │   - Browser-native voices                         │
│    │   - Fallback: server-side Piper                   │
│    │                                                    │
│    └─► Server TTS (Piper → MP3)                         │
│        - Consistent quality across devices             │
│        - Cached per-chapter, served as static URL      │
│        - Background generation via BullMQ              │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Web Speech API (Client-Side)

```typescript
// packages/tts-core/src/web-speech.ts
interface WebSpeechTTS {
  speak(text: string, options: SpeechOptions): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  onProgress?: (chapter: string, offset: number) => void;
  onEnd?: () => void;
}

interface SpeechOptions {
  voice: SpeechSynthesisVoice;
  rate: number;       // 0.5 – 2.0 (default 1.0)
  pitch: number;      // 0.5 – 2.0 (default 1.0)
  volume: number;     // 0.0 – 1.0 (default 1.0)
  chapterId: string;  // for progress tracking
}
```

**Usage in reader**: The reader page shows a "Listen" button that activates Web Speech TTS. When a chapter is spoken, it highlights the currently-read sentence (sentence boundary detection via locale rules).

### 8.3 Server-Side TTS (Piper)

```dockerfile
# TTS Service Dockerfile (services/tts/Dockerfile)
FROM python:3.12-slim
RUN apt-get update && apt-get install -y libespeak-ng1 piper-tts
COPY voices/ /opt/piper/voices/
COPY server.py /opt/server.py
CMD ["python", "/opt/server.py"]
```

Available voices (selection):

| Voice ID | Language | Style |
|---|---|---|
| `en_US-amy-medium` | English (US) | Neutral female |
| `en_GB-alan-medium` | English (UK) | Neutral male |
| `zh_CN-CHN` | Chinese (Mandarin) | Neutral |
| `zh_TW-Taiwan` | Chinese (Taiwanese) | Neutral |

### 8.4 Audio Caching Strategy

```
TTS Cache URL pattern: /api/v1/tts/chapter/{chapterId}?voice={voiceId}

Cache flow:
  1. Client requests chapter audio
  2. Check tts_cache table in PostgreSQL
  3. If HIT: return signed URL to audio file in MinIO/NAS storage
  4. If MISS: enqueue BullMQ job → TTS worker generates audio → store → return URL
  5. Background job purges cache entries not accessed in 90 days
```

### 8.5 Audio Player UI

- Persistent mini-player (bottom bar on mobile/desktop, side panel on web)
- Controls: play/pause, skip 15s forward/back, speed (0.5×–2.0×), voice select
- Chapter navigation: previous/next chapter
- Sleep timer: 5, 15, 30, 45, 60 min or end of chapter
- Visual waveform (optional, for premium)
- Keyboard shortcuts (desktop/web): Space=play/pause, ←/→=skip

---

## 9. Public E-Book Data Sources

### 9.1 Open Library API (Primary)

```
Base: https://openlibrary.org
Rate limit: ~300 req/min (generous, no key required)
```

| Endpoint | Use case |
|---|---|
| `GET /isbn/{isbn}.json` | ISBN lookup → metadata |
| `GET /search.json?q=` | Full-text search |
| `GET /search.json?author=` | Author search |
| Cover: `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg` | Cover images |

### 9.2 Google Books API (Fallback)

```
Base: https://www.googleapis.com/books/v1
Requires: API key (free tier: 1000 req/day)
```

| Endpoint | Use case |
|---|---|
| `GET /volumes?q=isbn:{isbn}` | ISBN lookup |
| `GET /volumes?q={query}` | General search |

### 9.3 Metadata Enhancement Flow

```
1. On book upload (or manual ISBN entry):
   │
   ├─► Open Library: GET /isbn/{isbn}.json
   │   └── Extract: title, author[], publisher, publish_date, cover_i
   │
   ├─► Google Books (if OL fails or missing fields):
   │   GET /volumes?q=isbn:{isbn}
   │   └── Extract: description, categories, pageCount
   │
   └─► Server fills books table fields
       └── User can edit/correct any field manually
```

### 9.4 LibGen / Anna's Archive (Legal Note)

> **Important**: LibGen and Anna's Archive are primarily known for hosting copyrighted works without authorization. Using their APIs/services for anything other than **public domain** or **openly licensed** works may violate copyright law in many jurisdictions. Use Open Library and Google Books for all metadata needs. BookDock's storage layer should only contain files the user has legally acquired.

---

## 10. Docker Compose

### 10.1 docker-compose.yml (Root)

```yaml
version: "3.9"

x-common-env: &common-env
  TZ: Asia/Shanghai
  NODE_ENV: production

x-paths: &paths
  DATA_ROOT: /data
  BOOKS_DIR: /data/books
  TTS_CACHE_DIR: /data/tts-cache
  KEYS_DIR: /data/keys
  COVERS_DIR: /data/covers

services:

  # ── Traefik (Reverse Proxy) ────────────────────────────────
  traefik:
    image: traefik:v3.0
    container_name: bookdock-traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./infra/traefik/acme.json:/acme.json
      - ./infra/traefik/traefik.yml:/traefik.yml:ro
    networks:
      - bookdock

  # ── PostgreSQL ─────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: bookdock-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: bookdock
      POSTGRES_USER: bookdock
      POSTGRES_PASSWORD: CHANGE_ME_IN_PRODUCTION
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bookdock"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - bookdock

  # ── Redis ──────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: bookdock-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - bookdock

  # ── MinIO (S3-compatible object storage) ──────────────────
  # Used for: ebook file storage, TTS audio cache, cover images
  minio:
    image: minio/minio:latest
    container_name: bookdock-minio
    restart: unless-stopped
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Console
    environment:
      MINIO_ROOT_USER: bookdock
      MINIO_ROOT_PASSWORD: CHANGE_ME_IN_PRODUCTION
      MINIO_DEFAULT_BUCKETS: books,tts      MINIO_DEFAULT_BUCKETS: books,tts-cache,covers
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 15s
      timeout: 10s
      retries: 5
    command: server /data --console-address ":9001"
    networks:
      - bookdock

  # ── API ────────────────────────────────────────────────────
  api:
    build:
      context: ./services/api
      dockerfile: Dockerfile
    container_name: bookdock-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      <<: *common-env
      <<: *paths
      DATABASE_URL: postgresql://bookdock:CHANGE_ME@postgres:5432/bookdock
      REDIS_URL: redis://redis:6379/0
      JWT_PRIVATE_KEY_PATH: /data/keys/private.pem
      JWT_PUBLIC_KEY_PATH: /data/keys/public.pem
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: bookdock
      MINIO_SECRET_KEY: CHANGE_ME
      NAS_MOUNT_ROOT: /data/books
      TRAEFIK_DOMAIN: bookdock.local
    volumes:
      - ./data/books:/data/books:ro
      - ./data/tts-cache:/data/tts-cache
      - ./data/keys:/data/keys:ro
      - ./data/covers:/data/covers
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - bookdock
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.bookdock.rule=Host(`bookdock.local`)"
      - "traefik.http.routers.bookdock.entrypoints=websecure"
      - "traefik.http.services.bookdock.loadbalancer.server.port=3000"

  # ── Indexer (BullMQ worker) ────────────────────────────────
  indexer:
    build:
      context: ./services/indexer
      dockerfile: Dockerfile
    container_name: bookdock-indexer
    restart: unless-stopped
    environment:
      <<: *common-env
      <<: *paths
      DATABASE_URL: postgresql://bookdock:CHANGE_ME@postgres:5432/bookdock
      REDIS_URL: redis://redis:6379/0
    volumes:
      - ./data/books:/data/books:ro
      - ./data/covers:/data/covers
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - bookdock
    deploy:
      replicas: 2

  # ── TTS Service (Piper) ─────────────────────────────────────
  tts:
    build:
      context: ./services/tts
      dockerfile: Dockerfile
    container_name: bookdock-tts
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      <<: *common-env
      VOICES_DIR: /opt/piper/voices
      MAX_CHUNK_WORDS: "1000"          # Split long chapters
    volumes:
      - ./data/tts-cache:/data/tts-cache
      - ./services/tts/voices:/opt/piper/voices:ro
    networks:
      - bookdock

  # ── Volumes ─────────────────────────────────────────────────
volumes:
  postgres_data:
  redis_data:
  minio_data:

  # ── Network ─────────────────────────────────────────────────
networks:
  bookdock:
    driver: bridge
```

### 10.2 Per-Service Dockerfiles

**services/api/Dockerfile**
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY services/api ./services/api
RUN corepack enable pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @bookdock/api build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/services/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**services/indexer/Dockerfile**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile
COPY services/indexer ./services/indexer
COPY packages/ebook-parser ./packages/ebook-parser
COPY packages/types ./packages/types
RUN pnpm --filter @bookdock/indexer build
CMD ["node", "dist/main.js"]
```

**services/tts/Dockerfile**
```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y \
    espeak-ng \
    piper-tts \
    curl \
    && rm -rf /var/lib/apt/lists/*
COPY services/tts/voices/ /opt/piper/voices/
COPY services/tts/server.py /opt/server.py
RUN useradd -m tts
USER tts
WORKDIR /data
EXPOSE 5000
CMD ["python", "/opt/server.py"]
```

### 10.3 Traefik Configuration

```yaml
# infra/traefik/traefik.yml
api:
  dashboard: true
  insecure: true  # Local only; disable in production

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@bookdock.local
      storage: /acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
```

---

## 11. NAS Deployment

### 11.1 Supported NAS Platforms

| Platform | Notes |
|---|---|
| Synology DSM 7+ | Native Docker Compose via Package Center |
| QNAP QTS 5+ | Container Station |
| Unraid 6+ | Native Docker Compose |
| Generic Linux NAS | systemd + Docker Compose |
| TrueNAS Scale | Kubernetes (future) |

### 11.2 Synology DSM Deployment Guide

1. **Install Docker Package** via Package Center
2. **Create shared folder**: `docker/bookdock` (for `data/` subdirectories)
3. **SSH in** as admin, then:
   ```bash
   cd /volume1/docker/bookdock
   git clone https://github.com/your-org/BookDock.git .
   # Place JWT keys or run: openssl genrsa -out data/keys/private.pem 2048
   # Extract public key: openssl rsa -in data/keys/private.pem -pubout -out data/keys/public.pem
   docker compose up -d
   ```
4. **Reverse proxy**: DSM Control Panel → Application Portal → Reverse Proxy
   - Source: `https://bookdock.local` → Target: `http://localhost:3000`
5. **Let Traefik handle TLS** with the Synology wildcard cert or Let's Encrypt

### 11.3 Storage Layout on NAS

```
/volume1/docker/bookdock/
├── data/
│   ├── books/          # User-uploaded ebooks (bind mount to NAS shared folder)
│   ├── tts-cache/       # Generated TTS audio files
│   ├── covers/         # Extracted/generated cover images
│   └── keys/           # JWT RSA key pair (chmod 600)
├── infra/
│   ├── traefik/         # Traefik config + acme.json
│   └── postgres/        # init.sql (schema + seed data)
├── services/
│   ├── api/
│   ├── indexer/
│   └── tts/
├── docker-compose.yml
└── .env                 # secrets (DATABASE_URL, MINIO_SECRET_KEY, etc.)
```

### 11.4 Resource Requirements

| Service | CPU | RAM | Storage |
|---|---|---|---|
| PostgreSQL | 1 core | 512 MB | 10 GB (books DB) |
| Redis | 0.5 core | 128 MB | 1 GB (persistence) |
| MinIO | 1 core | 256 MB | Variable (ebooks + TTS cache) |
| API | 1 core | 256 MB | — |
| Indexer (×2) | 1 core each | 256 MB | — |
| TTS | 1 core | 1 GB | — |
| **Total baseline** | 3 cores | 1.5 GB | Variable |

> **On Synology**: Most mid-range NAS (DS220+, DS920+) handle this comfortably with 4–6 GB RAM. Add RAM if hosting on a low-end 2-bay NAS.

### 11.5 Backup Strategy

```bash
# Nightly cron (DSM Task Scheduler)
#!/bin/bash
BACKUP_DIR="/volume1/backups/bookdock"
DATE=$(date +%Y%m%d)

# DB backup
docker exec bookdock-postgres pg_dump -U bookdock bookdock > "$BACKUP_DIR/db_$DATE.sql"

# MinIO data backup (incremental via rclone)
rclone sync minio:/books "$BACKUP_DIR/books/" --fast-list
rclone sync minio:/tts-cache "$BACKUP_DIR/tts-cache/" --fast-list

# Retain 30 days
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
```

### 11.6 Scaling Considerations

- **More indexing throughput**: increase `indexer` replicas in `docker-compose.yml`
- **More TTS throughput**: scale `tts` service (each instance handles one generation job at a time; use a queue)
- **NAS CPU constraints**: offload heavy tasks (PDF OCR, full-text indexing) to a secondary machine using the same Docker network
- **Family plan / multi-user**: deploy Traefik with per-user rate limiting; consider PgBouncer for connection pooling if >50 concurrent users

---

## Appendix: Package-Level Dependency Graph

```
apps/web ──────► packages/ui
apps/web ──────► packages/hooks
apps/web ──────► packages/api-client
apps/web ──────► packages/types
apps/web ──────► packages/tts-core
apps/web ──────► packages/auth

apps/mobile ───► packages/ui        (Tamagui)
apps/mobile ───► packages/hooks
apps/mobile ───► packages/api-client
apps/mobile ───► packages/types
apps/mobile ───► packages/tts-core

apps/desktop ──► packages/ui
apps/desktop ──► packages/hooks
apps/desktop ──► packages/api-client
apps/desktop ──► packages/types
apps/desktop ──► packages/tts-core

services/api ───────► packages/types
services/indexer ──► packages/types
services/indexer ──► packages/ebook-parser
services/api ───────► packages/auth
```

---

*Last updated: 2026-03-20. Architecture is versioned alongside code in `docs/ARCHITECTURE.md`.*
