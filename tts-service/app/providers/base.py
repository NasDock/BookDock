"""TTS Provider base class.

Define the contract every TTS provider must implement.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, asdict
from typing import AsyncIterator, Optional


@dataclass
class VoiceInfo:
    """Metadata about a single TTS voice."""
    id: str
    name: str
    language: str
    gender: str  # 'male' | 'female' | 'neutral'
    description: str = ""
    sample_rate: int = 24000

    def to_dict(self) -> dict:
        return asdict(self)


class ProviderError(Exception):
    """Raised when a TTS provider operation fails."""
    def __init__(self, message: str, status_code: int = 502, provider: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider


class TTSProvider(abc.ABC):
    """Abstract base class for TTS providers.

    Implementations must override `name`, `list_voices`, and `synthesize`.
    The default `synthesize_stream` falls back to `synthesize`; override
    only if the underlying service supports real streaming.
    """

    #: provider name used in API calls (e.g. "edge", "mi", "azure")
    name: str = "base"

    #: whether this provider is currently enabled (configurable at runtime)
    enabled: bool = True

    @abc.abstractmethod
    async def list_voices(self, language: Optional[str] = None) -> list[VoiceInfo]:
        """Return voices available on this provider."""

    @abc.abstractmethod
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
        """Synthesize `text` with the given `voice` and return raw audio bytes."""

    async def synthesize_stream(
        self,
        text: str,
        voice: str,
        *,
        rate: float = 1.0,
        pitch: float = 1.0,
        volume: float = 1.0,
        audio_format: str = "mp3",
    ) -> AsyncIterator[bytes]:
        """Stream synthesized audio. Default: yield full buffer from synthesize()."""
        data = await self.synthesize(
            text, voice, rate=rate, pitch=pitch, volume=volume, audio_format=audio_format
        )
        yield data

    async def health(self) -> dict:
        """Return provider-level health info."""
        return {
            "name": self.name,
            "enabled": self.enabled,
            "status": "ok" if self.enabled else "disabled",
        }
