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

# ── Stage 4: TTS Model Downloader ────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS tts-model-builder

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Download default voice model (HuggingFace - GitHub release 404)
ENV PIPER_MODEL_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
ENV PIPER_MODEL_JSON_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

RUN mkdir -p /models && \
    curl -L --fail -o /models/voice.onnx "$PIPER_MODEL_URL" && \
    curl -L --fail -o /models/voice.onnx.json "$PIPER_MODEL_JSON_URL"


# ── Stage 5: Production Runner ───────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm AS runner

LABEL org.opencontainers.image.title="BookDock"
LABEL org.opencontainers.image.description="BookDock all-in-one: API + Web + TTS"
LABEL maintainer="BookDock Team"

WORKDIR /app

# Install Python 3.11, pip, runtime deps, and TTS Python packages directly
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    python3.11-venv \
    libespeak1 \
    libsndfile1 \
    espeak-ng \
    sox \
    libsox-fmt-mp3 \
    supervisor \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages --no-cache-dir \
    piper-tts \
    onnxruntime \
    fastapi \
    uvicorn \
    pydantic \
    aiofiles

# Copy voice model
COPY --from=tts-model-builder /models /models

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
ENV TTS_API_URL=http://localhost:5000
ENV NAS_EBOOK_PATH=/data/ebooks
ENV NAS_AUDIO_PATH=/data/audio
ENV SOURCE_LOCAL_PATH=/data/sources
ENV PIPER_VOICE_PATH=/models/voice.onnx
ENV PIPER_SAMPLE_RATE=22050
ENV PIPER_PORT=5000

# Write supervisord config
RUN cat > /etc/supervisor/conf.d/bookdock.conf << 'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:tts]
command=python3 -m uvicorn tts_service:app --host 0.0.0.0 --port 5000 --app-dir /app/tts-service
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PIPER_VOICE_PATH="/models/voice.onnx",PIPER_SAMPLE_RATE="22050",PIPER_PORT="5000"

[program:api]
command=node /app/dist/main.js
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="8088",DATABASE_URL="file:/data/db/bookdock.db",TTS_API_URL="http://localhost:5000",NAS_EBOOK_PATH="/data/ebooks",NAS_AUDIO_PATH="/data/audio",SOURCE_LOCAL_PATH="/data/sources"
EOF

# Health check for API
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -q --spider http://localhost:8088/api/health || exit 1

EXPOSE 8088

# Use tini as init, then supervisord to manage both processes
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/bookdock.conf"]
