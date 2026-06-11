"""Microsoft Edge TTS provider.

Uses the public edge-tts library (no authentication required).
Reference: https://github.com/rany2/edge-tts
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from .base import TTSProvider, VoiceInfo, ProviderError

logger = logging.getLogger("tts.edge")


# A curated subset of Edge voices. The real list is fetched dynamically
# via `edge_tts.list_voices()` so this is just a sensible default
# filter for languages commonly used in BookDock.
DEFAULT_VOICE_LANGUAGES = {"en", "zh", "ja", "ko", "es", "fr", "de", "ru", "it"}


# rate / pitch / volume must be strings in edge-tts.
# Convert a multiplier (0.5–2.0) to edge-tts percent string e.g. "+10%" / "-25%"
def _to_rate_str(rate: float) -> str:
    pct = int(round((rate - 1.0) * 100))
    return f"{'+' if pct >= 0 else ''}{pct}%"


def _to_pitch_str(pitch: float) -> str:
    hz = int(round((pitch - 1.0) * 50))  # ±50Hz around default
    return f"{'+' if hz >= 0 else ''}{hz}Hz"


def _to_volume_str(volume: float) -> str:
    pct = int(round((volume - 1.0) * 100))
    return f"{'+' if pct >= 0 else ''}{pct}%"


class EdgeTTSProvider(TTSProvider):
    """Edge TTS (Microsoft) provider. Free, no API key needed."""

    name = "edge"
    enabled = True

    # Cached voice list, populated on first list_voices() call.
    _voice_cache: Optional[list[VoiceInfo]] = None
    _voice_lock = asyncio.Lock()

    async def list_voices(self, language: Optional[str] = None) -> list[VoiceInfo]:
        """Return all Edge voices (optionally filtered by language prefix)."""
        if self._voice_cache is None:
            async with self._voice_lock:
                if self._voice_cache is None:
                    try:
                        import edge_tts
                    except ImportError as exc:
                        raise ProviderError(
                            "edge-tts package not installed", status_code=500, provider=self.name
                        ) from exc
                    try:
                        raw = await edge_tts.list_voices()
                    except Exception as exc:
                        raise ProviderError(
                            f"Failed to list Edge voices: {exc}", status_code=502, provider=self.name
                        ) from exc
                    parsed: list[VoiceInfo] = []
                    for v in raw:
                        short = v.get("ShortName", "")
                        locale = v.get("Locale", "")
                        gender = (v.get("Gender") or "Neutral").lower()
                        # Filter to common languages to keep the list manageable
                        lang_prefix = locale.split("-")[0].lower() if locale else ""
                        if lang_prefix not in DEFAULT_VOICE_LANGUAGES:
                            continue
                        parsed.append(
                            VoiceInfo(
                                id=short,
                                name=v.get("FriendlyName", short),
                                language=locale,
                                gender=gender,
                                description=f"Microsoft Edge TTS — {locale}",
                            )
                        )
                    self._voice_cache = parsed
                    logger.info("Loaded %d Edge voices", len(parsed))

        if language:
            lang = language.lower()
            return [v for v in self._voice_cache if v.language.lower().startswith(lang)]
        return list(self._voice_cache)

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
        if not text or not text.strip():
            raise ProviderError("text is empty", status_code=400, provider=self.name)

        try:
            import edge_tts
        except ImportError as exc:
            raise ProviderError(
                "edge-tts package not installed", status_code=500, provider=self.name
            ) from exc

        # edge-tts only outputs mp3. Ignore requested format mismatch.
        communicate = edge_tts.Communicate(
            text,
            voice=voice,
            rate=_to_rate_str(rate),
            pitch=_to_pitch_str(pitch),
            volume=_to_volume_str(volume),
        )

        chunks: list[bytes] = []
        try:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    chunks.append(chunk["data"])
        except Exception as exc:
            raise ProviderError(
                f"Edge TTS synthesis failed: {exc}", status_code=502, provider=self.name
            ) from exc

        if not chunks:
            raise ProviderError(
                "Edge TTS returned no audio", status_code=502, provider=self.name
            )

        return b"".join(chunks)
