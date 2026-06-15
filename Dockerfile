# =============================================================================
# BookDock - Single Combined Image
# Server (NestJS) + Web UI (Vite) + TTS (Piper Python) + SQLite
# =============================================================================
# Build:  docker build -t bookdock .
# Run:    docker run -d -p 8088:8088 -v bookdock-data:/data bookdock
# =============================================================================

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.11

# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/server/package.json ./apps/server/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/auth/package.json ./packages/auth/
COPY packages/ebook-reader/package.json ./packages/ebook-reader/
COPY packages/ftp/package.json ./packages/ftp/
COPY packages/smb/package.json ./packages/smb/
COPY packages/tts/package.json ./packages/tts/
COPY packages/ui/package.json ./packages/ui/
COPY packages/webdav/package.json ./packages/webdav/

# Install all dependencies (including devDeps for build)
RUN pnpm install --frozen-lockfile


# ── Stage 2: Web UI Builder ──────────────────────────────────────────────────
FROM deps AS web-builder

WORKDIR /app

# Copy web app source and workspace packages it depends on
COPY apps/desktop ./apps/desktop
COPY packages ./packages
COPY tsconfig.json ./

# Re-run pnpm install offline to fix any dangling symlinks left over
# from the deps stage. With `shamefully-hoist=true` in .npmrc, pnpm
# can leave symlinks under `apps/desktop/node_modules/<pkg>` pointing
# at a `.pnpm/<pkg>@<ver>/` directory that the lockfile never
# actually populated (the real package lives at
# `.pnpm/<pkg>@<ver>_<peer>/node_modules/<pkg>/`). Those dangling
# symlinks break `require('tailwindcss')` and friends from the
# postcss / vite plugins. Re-installing against the same lockfile
# (offline, frozen) reconciles the symlinks without re-downloading.
RUN pnpm install --offline --frozen-lockfile

# Build the web app (browser mode)
RUN pnpm --filter @bookdock/desktop exec vite build


# ── Stage 3: Server Builder ──────────────────────────────────────────────────
FROM deps AS server-builder

WORKDIR /app

# Copy server source and workspace packages
COPY apps/server ./apps/server
COPY packages ./packages
COPY tsconfig.json ./

# Generate Prisma client before building
RUN pnpm --filter @bookdock/server exec prisma generate

# Build workspace packages that require compilation
RUN pnpm --filter @bookdock/ftp --filter @bookdock/smb --filter @bookdock/webdav build

# Build NestJS server
RUN pnpm --filter @bookdock/server exec nest build

# Deploy server to a standalone directory (resolves workspace symlinks)
RUN pnpm deploy --filter=@bookdock/server --prod --legacy /app/server-deploy

# Fix: pnpm deploy doesn't copy hidden .prisma directory
RUN SOURCE_PRISMA=$(find /app/node_modules/.pnpm -path '*/@prisma+client@*/node_modules/.prisma' -type d | head -1) && \
    TARGET_PRISMA=$(find /app/server-deploy/node_modules/.pnpm -path '*/@prisma+client@*/node_modules' -type d | head -1) && \
    if [ -n "$SOURCE_PRISMA" ] && [ -n "$TARGET_PRISMA" ]; then \
      cp -r "$SOURCE_PRISMA" "$TARGET_PRISMA/"; \
    fi


# ── Stage 5: Production Runner ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm AS runner

LABEL org.opencontainers.image.title="BookDock"
LABEL org.opencontainers.image.description="BookDock all-in-one: API + Web + TTS (Edge/Mi)"
LABEL maintainer="BookDock Team"

WORKDIR /app

# Install Python 3.11, pip, runtime deps, and TTS Python packages.
# Edge TTS only needs stdlib + httpx; no heavy native deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    supervisor \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages --no-cache-dir \
    edge-tts \
    httpx \
    fastapi \
    uvicorn \
    pydantic \
    && npm install -g prisma@5.22.0

# Copy deployed server (self-contained with all deps)
COPY --from=server-builder /app/server-deploy ./

# Copy Prisma schema (needed for migrations and client)
COPY --from=server-builder /app/apps/server/prisma ./prisma

# Copy built web UI static files
COPY --from=web-builder /app/apps/desktop/dist ./web

# Copy TTS service code
COPY tts-service ./tts-service

# Create data directories
RUN mkdir -p /data/ebooks /data/audio /data/sources /data/db /app/uploads && \
    chmod -R 755 /data /app

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8088
ENV DATABASE_URL=file:/data/db/bookdock.db
ENV NAS_EBOOK_PATH=/data/ebooks
ENV NAS_AUDIO_PATH=/data/audio
ENV SOURCE_LOCAL_PATH=/data/sources
ENV TTS_SERVICE_URL=http://localhost:5000
ENV TTS_DEFAULT_PROVIDER=edge
ENV TTS_AUDIO_CACHE_DIR=/data/audio
ENV TTS_PORT=5000
ENV EDGE_TTS_ENABLED=1
ENV MI_TTS_ENABLED=1

# Write supervisord config
RUN cat > /etc/supervisor/conf.d/bookdock.conf << 'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:tts]
command=/app/tts-service/start.sh
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:api]
command=node /app/dist/main.js
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

# Create startup script that ensures DB tables exist before starting services
RUN cat > /app/start.sh << 'EOF'
#!/bin/sh
set -eu

# Ensure SQLite database tables are initialized
echo "Initializing database schema..."
prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss
echo "Database schema is ready."

# Start supervisord to manage API + TTS
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/bookdock.conf
EOF
RUN chmod +x /app/start.sh

# Health check for API
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -q --spider http://localhost:8088/health || exit 1

EXPOSE 8088

# Use tini as init, then our startup script
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]
