"""Mi (Xiaomi) TTS provider.

The Xiaomi TTS endpoint shape was not finalized at implementation time;
this stub documents the expected interface and provides a working
default that returns a clear error if used without configuration.

To enable, set environment variables:
  MI_TTS_ENDPOINT  - REST endpoint URL
  MI_TTS_API_KEY    - API key (or set per-user via NestJS config)
  MI_TTS_TIMEOUT    - request timeout in seconds (default 20)
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Optional

import httpx

from .base import TTSProvider, VoiceInfo, ProviderError

logger = logging.getLogger("tts.mi")


# Conservative default voice list; real voices should be fetched from
# the provider's voice listing API when configured.
_DEFAULT_VOICES: list[VoiceInfo] = [
    VoiceInfo(id="mi-xiaoyou-female", name="小友（女）", language="zh-CN", gender="female", description="小米 TTS 女声"),
    VoiceInfo(id="mi-xiaoyou-male", name="小友（男）", language="zh-CN", gender="male", description="小米 TTS 男声"),
    VoiceInfo(id="mi-bingxin-female", name="冰心（女）", language="zh-CN", gender="female", description="小米 TTS 情感女声"),
]


class MiTTSProvider(TTSProvider):
    """Xiaomi / MI AI TTS provider.

    NOTE: the actual REST contract needs to be filled in once the target
    endpoint is known. This implementation does the following:
      1. POSTs `{text, voice, audio_format}` to the configured endpoint.
      2. Expects either raw audio bytes OR a JSON `{audio_b64: "..."}`.
    Adjust `_call_remote` to match the real API.
    """

    name = "mi"
    enabled = True

    def __init__(
        self,
        endpoint: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 20.0,
    ) -> None:
        self.endpoint = endpoint or os.environ.get("MI_TTS_ENDPOINT", "")
        self.api_key = api_key or os.environ.get("MI_TTS_API_KEY", "")
        self.timeout = float(os.environ.get("MI_TTS_TIMEOUT", str(timeout)))

    @property
    def configured(self) -> bool:
        return bool(self.endpoint and self.api_key)

    async def health(self) -> dict:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "status": "ok" if self.configured else "needs_config",
            "configured": self.configured,
        }

    async def list_voices(self, language: Optional[str] = None) -> list[VoiceInfo]:
        if not self.configured:
            # Return the static default list so the UI can show something;
            # actual synthesis will fail until endpoint/key are set.
            return list(_DEFAULT_VOICES)
        # When fully configured, ideally call a /voices endpoint here.
        return list(_DEFAULT_VOICES)

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
                "Mi TTS is not configured. Set MI_TTS_ENDPOINT and MI_TTS_API_KEY, "
                "or configure per-user key in BookDock settings.",
                status_code=503,
                provider=self.name,
            )
        if not text or not text.strip():
            raise ProviderError("text is empty", status_code=400, provider=self.name)

        return await self._call_remote(text, voice, rate, pitch, volume, audio_format)

    async def _call_remote(
        self,
        text: str,
        voice: str,
        rate: float,
        pitch: float,
        volume: float,
        audio_format: str,
    ) -> bytes:
        """Make the actual HTTP call. Override once the contract is known."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "text": text,
            "voice": voice,
            "rate": rate,
            "pitch": pitch,
            "volume": volume,
            "format": audio_format,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(self.endpoint, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise ProviderError(
                f"Mi TTS request failed: {exc}", status_code=502, provider=self.name
            ) from exc

        if resp.status_code != 200:
            raise ProviderError(
                f"Mi TTS returned {resp.status_code}: {resp.text[:200]}",
                status_code=502,
                provider=self.name,
            )

        ctype = resp.headers.get("content-type", "").lower()
        if ctype.startswith("audio/") or ctype == "application/octet-stream":
            return resp.content
        try:
            data = resp.json()
            b64 = data.get("audio_b64") or data.get("audio") or data.get("data")
            if b64:
                return base64.b64decode(b64)
        except Exception:
            pass
        return resp.content
