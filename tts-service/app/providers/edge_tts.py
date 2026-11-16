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


# ─── Friendly display names for Chinese Edge voices ─────────────────────
# Map from ShortName suffix (e.g. "XiaoxiaoNeural" from "zh-CN-XiaoxiaoNeural")
# to a short Chinese display name. Used to replace the verbose
# "Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)"
# default friendly name with a cleaner "晓晓·陆" style label.
# The `id` returned to the client remains the ShortName (unchanged), so
# synthesize calls still work without any client-side remapping.
_ZH_VOICE_NAME_MAP: dict[str, str] = {
    "XiaoxiaoNeural": "晓晓",
    "XiaoyiNeural": "晓伊",
    "YunjianNeural": "云健",
    "YunxiNeural": "云希",
    "YunxiaNeural": "云夏",
    "YunyangNeural": "云扬",
    "XiaochenNeural": "晓辰",
    "XiaohanNeural": "晓涵",
    "XiaomengNeural": "晓梦",
    "XiaomoNeural": "晓墨",
    "XiaoqiuNeural": "晓秋",
    "XiaoruiNeural": "晓睿",
    "XiaoshuangNeural": "晓双",
    "XiaoyanNeural": "晓颜",
    "XiaoyouNeural": "晓悠",
    "XiaozhenNeural": "晓甄",
    "YunfengNeural": "云枫",
    "YunhaoNeural": "云浩",
    "YunyeNeural": "云野",
    "YunzeNeural": "云泽",
    "HiuMaanNeural": "晓曼",
    "WanLungNeural": "云龙",
    "HsiaoChenNeural": "晓臻",
    "HsiaoYuNeural": "晓雨",
    "YunJheNeural": "云哲",
    # Voices added later by Microsoft — only present in newer edge_tts
    # builds. Region tag still comes from the voice's Locale.
    "HiuGaaiNeural": "晓佳",   # zh-HK Cantonese
    "XiaobeiNeural": "晓北",   # zh-CN-liaoning Northeastern Mandarin
    "XiaoniNeural": "晓妮",    # zh-CN-shaanxi Zhongyuan Mandarin (Shaanxi)
}


def _region_tag(locale: str) -> str:
    """Map a BCP-47 locale to a short region tag for Chinese locales.

    Returns "陆" for Simplified Chinese (mainland), "港" for Hong Kong,
    "台" for Taiwan. Empty string for any other locale (so the
    display name stays clean for non-zh voices).
    """
    loc = (locale or "").lower()
    if not loc.startswith("zh"):
        return ""
    if loc.startswith("zh-hk") or "hant-hk" in loc:
        return "港"
    if loc.startswith("zh-tw") or "hant-tw" in loc:
        return "台"
    # All other zh-* locales (zh-CN, zh-Hans, zh-Hant-CN, etc.) are
    # treated as mainland Mandarin.
    return "陆"


def _friendly_zh_voice_name(short_name: str, locale: str) -> Optional[str]:
    """Build a friendly "晓晓·陆" style name for a Chinese Edge voice.

    Returns None if the voice isn't in our translation table — callers
    should fall back to the verbose default FriendlyName in that case.
    """
    # ShortName is "zh-CN-XiaoxiaoNeural" or similar. Extract the part
    # after the last "-" (e.g. "XiaoxiaoNeural").
    voice_id = short_name.rsplit("-", 1)[-1] if short_name else ""
    chinese_name = _ZH_VOICE_NAME_MAP.get(voice_id)
    if not chinese_name:
        return None
    tag = _region_tag(locale)
    return f"{chinese_name}·{tag}" if tag else chinese_name


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
                        # Only show Chinese-region voices (mainland / HK /
                        # TW). Other locales (en, ja, ko, ...) are hidden
                        # to keep the picker focused on BookDock's primary
                        # language.
                        if not locale.lower().startswith("zh"):
                            continue
                        # Replace the verbose default FriendlyName
                        # ("Microsoft Server Speech Text to Speech Voice
                        # (zh-CN, XiaoxiaoNeural)") with a short
                        # "晓晓·陆" style name for Chinese voices we
                        # recognise. The voice `id` (ShortName) is left
                        # unchanged so clients can still pass it to
                        # /synthesize directly.
                        friendly = _friendly_zh_voice_name(short, locale)
                        if not friendly:
                            friendly = v.get("FriendlyName", short)
                        parsed.append(
                            VoiceInfo(
                                id=short,
                                name=friendly,
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
