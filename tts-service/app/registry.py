"""Provider registry — holds the singleton instances of each TTS provider."""
from __future__ import annotations

import logging
import os
from typing import Optional

from .providers import EdgeTTSProvider, MiTTSProvider, TTSProvider

logger = logging.getLogger("tts.registry")


class ProviderRegistry:
    """Holds TTS provider instances and looks them up by name."""

    def __init__(self) -> None:
        self._providers: dict[str, TTSProvider] = {}

    def register(self, provider: TTSProvider) -> None:
        if provider.name in self._providers:
            logger.warning("Replacing existing provider: %s", provider.name)
        self._providers[provider.name] = provider
        logger.info("Registered provider: %s (enabled=%s)", provider.name, provider.enabled)

    def get(self, name: str) -> TTSProvider:
        if name not in self._providers:
            raise KeyError(f"Unknown TTS provider: {name}. Available: {list(self._providers)}")
        return self._providers[name]

    def list_names(self) -> list[str]:
        return list(self._providers.keys())

    def all(self) -> list[TTSProvider]:
        return list(self._providers.values())


registry = ProviderRegistry()


def build_default_registry() -> ProviderRegistry:
    """Build the default registry: Edge (always on) + Mi (env-configured).

    Registers them on the module-level singleton so endpoints see them.
    """
    edge = EdgeTTSProvider()
    edge.enabled = os.environ.get("EDGE_TTS_ENABLED", "1") not in ("0", "false", "False")
    registry.register(edge)

    mi = MiTTSProvider(
        endpoint=os.environ.get("MI_TTS_ENDPOINT"),
        api_key=os.environ.get("MI_TTS_API_KEY"),
    )
    mi.enabled = os.environ.get("MI_TTS_ENABLED", "1") not in ("0", "false", "False")
    registry.register(mi)

    return registry


def get_registry() -> ProviderRegistry:
    """Lazy accessor used by FastAPI endpoints."""
    if not registry.list_names():
        build_default_registry()
    return registry
