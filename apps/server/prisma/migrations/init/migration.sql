-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "last_used_at" DATETIME,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_sort" TEXT,
    "bio" TEXT,
    "avatar_url" TEXT,
    "birth_date" TEXT,
    "death_date" TEXT,
    "nationality" TEXT,
    "source" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "book_authors" (
    "book_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("book_id", "author_id"),
    FOREIGN KEY ("author_id") REFERENCES "authors" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "book_tags" (
    "book_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("book_id", "tag_id"),
    FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "chapter_id" TEXT,
    "cfi" TEXT,
    "percentage" REAL,
    "start_offset" INTEGER,
    "end_offset" INTEGER,
    "text" TEXT,
    "title" TEXT,
    "location" TEXT NOT NULL,
    "location_type" TEXT NOT NULL DEFAULT 'cfi',
    "type" TEXT NOT NULL DEFAULT 'bookmark',
    "author" TEXT,
    "book_title" TEXT,
    "note" TEXT,
    "highlight_text" TEXT,
    "highlight_color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "author_sort" TEXT,
    "description" TEXT,
    "isbn" TEXT,
    "publisher" TEXT,
    "published_date" DATETIME,
    "language" TEXT NOT NULL DEFAULT 'en',
    "format" TEXT NOT NULL DEFAULT 'other',
    "file_path" TEXT NOT NULL,
    "file_hash" TEXT,
    "file_size" BIGINT,
    "page_count" INTEGER,
    "cover_url" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cover_url" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "indexer_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_path" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" DATETIME
);

-- CreateTable
CREATE TABLE "reading_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "book_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "epub_cfi" TEXT,
    "pdf_page" INTEGER,
    "mobi_location" INTEGER,
    "progress_pct" REAL NOT NULL DEFAULT 0,
    "current_chapter" INTEGER,
    "scroll_offset" INTEGER,
    "time_spent_secs" INTEGER NOT NULL DEFAULT 0,
    "last_read_at" DATETIME,
    "bookmark_note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tts_audio_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "book_id" TEXT NOT NULL,
    "user_id" TEXT,
    "file_path" TEXT NOT NULL,
    "file_url" TEXT,
    "file_size" BIGINT,
    "duration_secs" REAL,
    "voice" TEXT,
    "sample_rate" INTEGER,
    "start_cfi" TEXT,
    "end_cfi" TEXT,
    "content_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tts_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "book_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "voice" TEXT NOT NULL DEFAULT 'en_US-lessac-medium',
    "gender" TEXT NOT NULL DEFAULT 'neutral',
    "sampleRate" INTEGER NOT NULL DEFAULT 22050,
    "start_cfi" TEXT,
    "end_cfi" TEXT,
    "output_path" TEXT,
    "output_url" TEXT,
    "file_size" BIGINT,
    "duration_secs" REAL,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    FOREIGN KEY ("book_id") REFERENCES "books" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "avatar_url" TEXT,
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_login_at" DATETIME,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT
);

-- CreateTable
CREATE TABLE "vip_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'free',
    "expired_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vip_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash" ASC);

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id" ASC);

-- CreateIndex
CREATE INDEX "authors_name_idx" ON "authors"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "authors_name_key" ON "authors"("name" ASC);

-- CreateIndex
CREATE INDEX "book_authors_author_id_idx" ON "book_authors"("author_id" ASC);

-- CreateIndex
CREATE INDEX "book_authors_book_id_idx" ON "book_authors"("book_id" ASC);

-- CreateIndex
CREATE INDEX "book_tags_tag_id_idx" ON "book_tags"("tag_id" ASC);

-- CreateIndex
CREATE INDEX "book_tags_book_id_idx" ON "book_tags"("book_id" ASC);

-- CreateIndex
CREATE INDEX "bookmarks_book_title_idx" ON "bookmarks"("book_title" ASC);

-- CreateIndex
CREATE INDEX "bookmarks_author_idx" ON "bookmarks"("author" ASC);

-- CreateIndex
CREATE INDEX "bookmarks_user_id_type_idx" ON "bookmarks"("user_id" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "bookmarks_book_id_idx" ON "bookmarks"("book_id" ASC);

-- CreateIndex
CREATE INDEX "bookmarks_user_id_idx" ON "bookmarks"("user_id" ASC);

-- CreateIndex
CREATE INDEX "books_file_hash_idx" ON "books"("file_hash" ASC);

-- CreateIndex
CREATE INDEX "books_created_at_idx" ON "books"("created_at" DESC);

-- CreateIndex
CREATE INDEX "books_language_idx" ON "books"("language" ASC);

-- CreateIndex
CREATE INDEX "books_format_idx" ON "books"("format" ASC);

-- CreateIndex
CREATE INDEX "books_author_sort_idx" ON "books"("author_sort" ASC);

-- CreateIndex
CREATE INDEX "books_author_idx" ON "books"("author" ASC);

-- CreateIndex
CREATE INDEX "books_title_idx" ON "books"("title" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_book_id_key" ON "collection_items"("collection_id" ASC, "book_id" ASC);

-- CreateIndex
CREATE INDEX "collection_items_book_id_idx" ON "collection_items"("book_id" ASC);

-- CreateIndex
CREATE INDEX "collection_items_collection_id_idx" ON "collection_items"("collection_id" ASC);

-- CreateIndex
CREATE INDEX "collections_user_id_idx" ON "collections"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_book_id_key" ON "favorites"("user_id" ASC, "book_id" ASC);

-- CreateIndex
CREATE INDEX "favorites_book_id_idx" ON "favorites"("book_id" ASC);

-- CreateIndex
CREATE INDEX "favorites_user_id_idx" ON "favorites"("user_id" ASC);

-- CreateIndex
CREATE INDEX "indexer_jobs_created_at_idx" ON "indexer_jobs"("created_at" ASC);

-- CreateIndex
CREATE INDEX "indexer_jobs_status_idx" ON "indexer_jobs"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "reading_progress_user_id_book_id_key" ON "reading_progress"("user_id" ASC, "book_id" ASC);

-- CreateIndex
CREATE INDEX "reading_progress_last_read_at_idx" ON "reading_progress"("last_read_at" DESC);

-- CreateIndex
CREATE INDEX "reading_progress_book_id_idx" ON "reading_progress"("book_id" ASC);

-- CreateIndex
CREATE INDEX "reading_progress_user_id_idx" ON "reading_progress"("user_id" ASC);

-- CreateIndex
CREATE INDEX "sessions_refresh_token_idx" ON "sessions"("refresh_token" ASC);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name" ASC);

-- CreateIndex
CREATE INDEX "tts_audio_files_user_id_idx" ON "tts_audio_files"("user_id" ASC);

-- CreateIndex
CREATE INDEX "tts_audio_files_book_id_idx" ON "tts_audio_files"("book_id" ASC);

-- CreateIndex
CREATE INDEX "tts_jobs_created_at_idx" ON "tts_jobs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "tts_jobs_status_idx" ON "tts_jobs"("status" ASC);

-- CreateIndex
CREATE INDEX "tts_jobs_book_id_idx" ON "tts_jobs"("book_id" ASC);

-- CreateIndex
CREATE INDEX "tts_jobs_user_id_idx" ON "tts_jobs"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vip_members_phone_key" ON "vip_members"("phone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vip_members_user_id_key" ON "vip_members"("user_id" ASC);

-- CreateIndex
CREATE INDEX "vip_orders_order_id_idx" ON "vip_orders"("order_id" ASC);

-- CreateIndex
CREATE INDEX "vip_orders_user_id_idx" ON "vip_orders"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "vip_orders_order_id_key" ON "vip_orders"("order_id" ASC);

