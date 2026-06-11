"""TTS Provider implementations.

Each provider must subclass `TTSProvider` from `base.py` and
register itself with `ProviderRegistry` in `app/registry.py`.
"""
from .base import TTSProvider, VoiceInfo, ProviderError
from .edge_tts import EdgeTTSProvider
from .mi_tts import MiTTSProvider
from .mimo_tts import MimoTTSProvider

__all__ = [
    "TTSProvider",
    "VoiceInfo",
    "ProviderError",
    "EdgeTTSProvider",
    "MiTTSProvider",
    "MimoTTSProvider",
]
