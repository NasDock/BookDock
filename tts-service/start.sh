#!/bin/sh
set -eu

# Export all TTS_MIMO_* env vars so uvicorn child inherits them
export EDGE_TTS_ENABLED="${EDGE_TTS_ENABLED:-1}"
export MI_TTS_ENABLED="${MI_TTS_ENABLED:-1}"
export TTS_PORT="${TTS_PORT:-5000}"

[ -n "${TTS_MIMO_API_TOKEN:-}" ] && export TTS_MIMO_API_TOKEN
[ -n "${TTS_MIMO_MODEL:-}" ]     && export TTS_MIMO_MODEL
[ -n "${TTS_MIMO_ENDPOINT:-}" ]  && export TTS_MIMO_ENDPOINT
[ -n "${TTS_MIMO_AUDIO_PATH:-}" ] && export TTS_MIMO_AUDIO_PATH
[ -n "${TTS_MIMO_TIMEOUT:-}" ]   && export TTS_MIMO_TIMEOUT

# Legacy aliases (also forwarded for backward compat)
[ -n "${MIMO_API_KEY:-}" ]       && export MIMO_API_KEY
[ -n "${MI_TTS_API_KEY:-}" ]     && export MI_TTS_API_KEY
[ -n "${MI_TTS_ENDPOINT:-}" ]    && export MI_TTS_ENDPOINT
[ -n "${MI_TTS_MODEL:-}" ]       && export MI_TTS_MODEL
[ -n "${MI_TTS_AUDIO_PATH:-}" ]  && export MI_TTS_AUDIO_PATH
[ -n "${MI_TTS_TIMEOUT:-}" ]     && export MI_TTS_TIMEOUT

exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "${TTS_PORT}" --app-dir /app/tts-service
