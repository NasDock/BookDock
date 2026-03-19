-- =============================================================================
-- BookDock Database Initialization Script
-- Run automatically on first Postgres startup via docker-entrypoint-initdb.d
-- =============================================================================
-- This script creates the complete database schema for BookDock.
-- It is idempotent - safe to run multiple times.
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');
CREATE TYPE book_format AS ENUM ('epub', 'pdf', 'mobi', 'azw3', 'fb2', 'txt', 'djvu', 'other');
CREATE TYPE reading_status AS ENUM ('unread', 'reading', 'completed', 'abandoned');
CREATE TYPE tts_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE tts_voice_gender AS ENUM ('male', 'female', 'neutral');

-- =============================================================================
-- TABLES
-- =============================================================================

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(200),
    role            user_role DEFAULT 'user',
    avatar_url      TEXT,
    preferences     JSONB DEFAULT '{}',  -- {theme, font_size, tts_voice, ...}
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ,
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- ── Books (Library) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(500) NOT NULL,
    author          VARCHAR(500),
    author_sort     VARCHAR(500),  -- Normalized for sorting
    description     TEXT,
    isbn            VARCHAR(20),
    publisher       VARCHAR(300),
    published_date  DATE,
    language        VARCHAR(10) DEFAULT 'en',
    format          book_format NOT NULL DEFAULT 'other',
    file_path       TEXT NOT NULL,           -- Relative to NAS_EBOOK_PATH
    file_hash       VARCHAR(64),              -- SHA-256 of file for deduplication
    file_size       BIGINT,
    page_count      INTEGER,
    cover_url       TEXT,
    -- Metadata extracted during indexing
    metadata        JSONB DEFAULT '{}',       -- {toc, sections, word_count, ...}
    -- Full-text search vector
    fts_vector      TSVECTOR,
    -- Statistics
    read_count      INTEGER DEFAULT 0,
    download_count  INTEGER DEFAULT 0,
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    -- Soft delete
    is_deleted      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_author ON books(author);
CREATE INDEX idx_books_author_sort ON books(author_sort);
CREATE INDEX idx_books_format ON books(format);
CREATE INDEX idx_books_language ON books(language);
CREATE INDEX idx_books_isbn ON books(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX idx_books_created ON books(created_at DESC);
CREATE INDEX idx_books_fil_hash ON books(file_hash) WHERE file_hash IS NOT NULL;
CREATE INDEX idx_books_fts ON books USING GIN(fts_vector);

-- Trigger to auto-update fts_vector
CREATE OR REPLACE FUNCTION books_update_fts() RETURNS trigger AS $$
BEGIN
    NEW.fts_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.author, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_fts_trigger
    BEFORE INSERT OR UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION books_update_fts();

-- ── Collections / Shelves ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    cover_url   TEXT,
    is_public   BOOLEAN DEFAULT FALSE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collections_user ON collections(user_id);

-- ── Collection Items (Books in Collections) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    collection_id   UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    sort_order      INTEGER DEFAULT 0,
    added_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(collection_id, book_id)
);

CREATE INDEX idx_collection_items_collection ON collection_items(collection_id);
CREATE INDEX idx_collection_items_book ON collection_items(book_id);

-- ── Reading Progress ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_progress (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    status          reading_status DEFAULT 'unread',
    -- Position (format-specific)
    epub_cfi        TEXT,          -- EPUB: CFI location
    pdf_page        INTEGER,       -- PDF: page number
    mobi_location   INTEGER,       -- Mobi: byte offset
    -- Progress metrics
    progress_pct    NUMERIC(5,2) DEFAULT 0,  -- 0.00 to 100.00
    time_spent_secs INTEGER DEFAULT 0,       -- Total reading time
    last_read_at    TIMESTAMPTZ,
    -- Bookmark
    bookmark_note   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, book_id)
);

CREATE INDEX idx_reading_progress_user ON reading_progress(user_id);
CREATE INDEX idx_reading_progress_book ON reading_progress(book_id);
CREATE INDEX idx_reading_progress_last_read ON reading_progress(last_read_at DESC);

-- ── Bookmarks ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    title           VARCHAR(200),
    location        TEXT NOT NULL,           -- Format-specific location string
    location_type   VARCHAR(20) DEFAULT 'cfi',  -- cfi, page, offset
    note            TEXT,
    highlight_text  TEXT,                     -- For highlights
    highlight_color VARCHAR(20),              -- e.g. 'yellow', 'green', 'blue'
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_book ON bookmarks(book_id);

-- ── TTS Jobs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tts_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    book_id         UUID REFERENCES books(id) ON DELETE CASCADE,
    -- Job parameters
    status          tts_job_status DEFAULT 'pending',
    voice           VARCHAR(100) DEFAULT 'en_US-lessac-medium',
    gender          tts_voice_gender DEFAULT 'neutral',
    sample_rate     INTEGER DEFAULT 22050,
    -- Ranges to synthesize
    start_cfi       TEXT,           -- EPUB CFI range start
    end_cfi         TEXT,           -- EPUB CFI range end
    -- Result
    output_path     TEXT,           -- Path to generated audio file
    output_url      TEXT,           -- Public URL for streaming
    file_size       BIGINT,
    duration_secs   NUMERIC(10,2),
    -- Error handling
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    max_retries     INTEGER DEFAULT 3,
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_tts_jobs_user ON tts_jobs(user_id);
CREATE INDEX idx_tts_jobs_book ON tts_jobs(book_id);
CREATE INDEX idx_tts_jobs_status ON tts_jobs(status);
CREATE INDEX idx_tts_jobs_created ON tts_jobs(created_at DESC);

-- ── TTS Audio Files (completed TTS outputs) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS tts_audio_files (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id         UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    -- File info
    file_path       TEXT NOT NULL,
    file_url        TEXT,
    file_size       BIGINT,
    duration_secs   NUMERIC(10,2),
    -- Synthesis info
    voice           VARCHAR(100),
    sample_rate     INTEGER,
    start_cfi       TEXT,
    end_cfi         TEXT,
    -- Checksum
    content_hash    VARCHAR(64),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tts_audio_book ON tts_audio_files(book_id);
CREATE INDEX idx_tts_audio_user ON tts_audio_files(user_id);

-- ── Tags ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    color       VARCHAR(20),  -- e.g. '#FF5722'
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS book_tags (
    book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, tag_id)
);

CREATE INDEX idx_book_tags_book ON book_tags(book_id);
CREATE INDEX idx_book_tags_tag ON book_tags(tag_id);

-- ── Sessions (for JWT refresh token tracking) ────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token   VARCHAR(500) NOT NULL,
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(refresh_token);

-- ── API Keys (for third-party integrations) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    key_hash    VARCHAR(64) NOT NULL,
    last_used_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ── Indexer Job Queue (backup for Redis, for reliability) ────────────────────
CREATE TABLE IF NOT EXISTS indexer_jobs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_path   TEXT NOT NULL,
    priority    INTEGER DEFAULT 0,
    status      VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    attempts    INTEGER DEFAULT 0,
    error       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_indexer_jobs_status ON indexer_jobs(status);
CREATE INDEX idx_indexer_jobs_created ON indexer_jobs(created_at);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Book with reading status for a specific user
CREATE OR REPLACE VIEW v_user_library AS
SELECT
    b.*,
    rp.status AS reading_status,
    rp.progress_pct,
    rp.last_read_at,
    rp.epub_cfi AS current_location,
    array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) AS tags,
    c.name AS collection_name
FROM books b
LEFT JOIN reading_progress rp ON rp.book_id = b.id
LEFT JOIN book_tags bt ON bt.book_id = b.id
LEFT JOIN tags t ON t.id = bt.tag_id
LEFT JOIN collection_items ci ON ci.book_id = b.id
LEFT JOIN collections c ON c.id = ci.collection_id AND c.is_public = TRUE
WHERE b.is_deleted = FALSE
GROUP BY b.id, rp.status, rp.progress_pct, rp.last_read_at, rp.epub_cfi, c.name;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER books_updated_at BEFORE UPDATE ON books FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER collections_updated_at BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER reading_progress_updated_at BEFORE UPDATE ON reading_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Full-text search function
CREATE OR REPLACE FUNCTION search_books(query TEXT, limit_count INTEGER DEFAULT 50)
RETURNS TABLE(
    id UUID,
    title VARCHAR,
    author VARCHAR,
    description TEXT,
    cover_url TEXT,
    format book_format,
    language VARCHAR,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.title,
        b.author,
        b.description,
        b.cover_url,
        b.format,
        b.language,
        ts_rank(b.fts_vector, plainto_tsquery('english', query)) AS rank
    FROM books b
    WHERE b.fts_vector @@ plainto_tsquery('english', query)
      AND b.is_deleted = FALSE
    ORDER BY rank DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SEED DATA (optional - disable for production)
-- =============================================================================

-- Default admin user (password: admin123 - CHANGE IMMEDIATELY)
-- Only creates if not exists
INSERT INTO users (email, username, password_hash, display_name, role)
VALUES (
    'admin@bookdock.local',
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.mJ3NqDYx6J5K3i',  -- bcrypt hash of 'admin123'
    'Administrator',
    'admin'
) ON CONFLICT (email) DO NOTHING;
