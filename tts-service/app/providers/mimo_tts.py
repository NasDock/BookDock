"""Xiaomi MiMo TTS provider.

OpenAI-compatible TTS endpoint exposed at api.xiaomimimo.com.

Reference (publicly documented at the time of integration):
  POST {base_url}/audio/speech
  Headers: Authorization: Bearer <MIMO_API_KEY>
  Body (JSON):
    {
      "model": "mimo-tts",          # or another model id the user configured
      "input": "<text>",
      "voice": "<voice-id>",
      "response_format": "mp3"      # or "wav" / "opus" / "pcm"
    }

  Response: raw audio bytes (Content-Type: audio/mpeg or audio/wav)

The base URL is configurable via the MI_TTS_ENDPOINT env var so the
provider can be repointed at a self-hosted MiMo-compatible gateway
without code changes. The request/response shape stays the same.
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

import httpx

from .base import TTSProvider, VoiceInfo, ProviderError

logger = logging.getLogger("tts.mimo")

# Default to the public MiMo endpoint. Override via MI_TTS_ENDPOINT.
DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1"

# Default voice list — MiMo is small (Chinese-focused); these ids match
# the values that have appeared in the MiMo reference docs. Users can
# request a /voices endpoint from the upstream when one is available.
_DEFAULT_VOICES: list[VoiceInfo] = [
    VoiceInfo(id="female-shaonv",   name="少女音",   language="zh-CN", gender="female", description="MiMo · 少女音"),
    VoiceInfo(id="female-yujie",   name="御姐音",   language="zh-CN", gender="female", description="MiMo · 御姐音"),
    VoiceInfo(id="male-qingnian",  name="青年音",   language="zh-CN", gender="male",   description="MiMo · 青年音"),
    VoiceInfo(id="male-chengshu",  name="成熟音",   language="zh-CN", gender="male",   description="MiMo · 成熟音"),
    VoiceInfo(id="neutral-zhiyu",  name="治愈音",   language="zh-CN", gender="neutral", description="MiMo · 治愈音"),
    VoiceInfo(id="en-female-aria", name="Aria (en)", language="en-US", gender="female", description="MiMo · English female"),
    VoiceInfo(id="en-male-guy",    name="Guy (en)",  language="en-US", gender="male",   description="MiMo · English male"),
]


class MimoTTSProvider(TTSProvider):
    """Xiaomi MiMo TTS provider (OpenAI-compatible /v1/audio/speech)."""

    name = "mi"  # keep the same public id so existing clients work
    enabled = True

    def __init__(
        self,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 20.0,
    ) -> None:
        # endpoint can be either the full path (/v1/audio/speech) or just
        # the base (/v1). We normalise to base + /audio/speech.
        raw = (endpoint or os.environ.get("TTS_MIMO_ENDPOINT", "") or os.environ.get("MI_TTS_ENDPOINT", "")).strip().rstrip("/")
        if raw.endswith("/audio/speech"):
            self.base_url = raw[: -len("/audio/speech")]
        elif raw:
            self.base_url = raw
        else:
            self.base_url = DEFAULT_BASE_URL
        self.audio_path = os.environ.get("TTS_MIMO_AUDIO_PATH", "") or os.environ.get("MI_TTS_AUDIO_PATH", "/audio/speech")

        self.api_key = api_key or os.environ.get("TTS_MIMO_API_TOKEN", "") \
            or os.environ.get("MIMO_API_KEY", "") \
            or os.environ.get("MI_TTS_API_KEY", "")
        self.model = model or os.environ.get("TTS_MIMO_MODEL", "") \
            or os.environ.get("MI_TTS_MODEL", "mimo-tts")
        self.timeout = float(os.environ.get("TTS_MIMO_TIMEOUT", "") or os.environ.get("MI_TTS_TIMEOUT", str(timeout)))

    @property
    def endpoint(self) -> str:
        return f"{self.base_url}{self.audio_path}"

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def health(self) -> dict:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "status": "ok" if self.configured else "needs_config",
            "configured": self.configured,
            "endpoint": self.endpoint,
            "model": self.model,
        }

    async def list_voices(self, language: Optional[str] = None) -> list[VoiceInfo]:
        # If MiMo later exposes a /voices endpoint, fetch it here.
        # For now return the static default list.
        voices = list(_DEFAULT_VOICES)
        if language:
            lang = language.lower()
            voices = [v for v in voices if v.language.lower().startswith(lang)]
        return voices

    async def synthesize(
        self,
        text: str,
        voice: str,
        *,
        rate: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
        audio_format: str = "mp3",
    ) -> bytes:
        if not self.configured:
            raise ProviderError(
                "MiMo TTS is not configured. Set TTS_MIMO_API_TOKEN (or "
                "MIMO_API_KEY / MI_TTS_API_KEY) and TTS_MIMO_ENDPOINT (or "
                "MI_TTS_ENDPOINT) in the environment.",
                status_code=503,
                provider=self.name,
            )
        if not text or not text.strip():
            raise ProviderError("text is empty", status_code=400, provider=self.name)

        # OpenAI-compatible /v1/audio/speech request shape
        payload = {
            "model": self.model,
            "input": text,
            "voice": voice,
            "response_format": _normalize_format(audio_format),
            # Optional knobs — MiMo ignores fields it doesn't recognise,
            # so passing them is safe even if the upstream contract is
            # older/newer.
            "speed": rate,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "audio/mpeg, audio/wav, application/octet-stream;q=0.9, */*;q=0.5",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(self.endpoint, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"MiMo TTS request failed: {exc}", status_code=502, provider=self.name
            ) from exc

        if resp.status_code != 200:
            # Try to surface the upstream error message verbatim
            err_text = resp.text[:500]
            try:
                err_json = resp.json()
                err_text = (
                    err_json.get("error", {}).get("message")
                    or err_json.get("message")
                    or err_text
                )
            except Exception:
                pass
            raise ProviderError(
                f"MiMo TTS {resp.status_code}: {err_text}",
                status_code=resp.status_code if resp.status_code in (401, 403, 429) else 502,
                provider=self.name,
            )

        ctype = resp.headers.get("content-type", "").lower()
        if ctype.startswith("audio/") or ctype == "application/octet-stream":
            return resp.content
        # Some gateways return JSON-wrapped audio
        try:
            data = resp.json()
            b64 = data.get("audio_b64") or data.get("audio") or data.get("data")
            if isinstance(b64, str):
                return base64.b64decode(b64)
        except Exception:
            pass
        return resp.content


def _normalize_format(fmt: str) -> str:
    """Map our internal format name to MiMo's expected value."""
    f = (fmt or "mp3").lower()
    if f in ("mp3", "mpeg"):
        return "mp3"
    if f in ("wav",):
        return "wav"
    if f in ("opus",):
        return "opus"
    if f in ("pcm",):
        return "pcm"
    return "mp3"
