"""BookDock TTS Service — FastAPI entrypoint.

Endpoints:
  GET  /health                           - service + per-provider health
  GET  /providers                        - list registered provider names
  GET  /providers/{name}/voices          - list voices for a provider
  POST /synthesize                       - synthesize text to audio (mp3/wav)

Run:
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 5000
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .registry import get_registry
from .providers.base import ProviderError, VoiceInfo

logging.basicConfig(
    level=os.environ.get("TTS_LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("tts.main")

# Ensure default providers are registered on import.
get_registry()

app = FastAPI(
    title="BookDock TTS Service",
    description="Provider-pluggable TTS (Edge, Mi, …) for BookDock audio reading.",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="Text to synthesize")
    voice: str = Field(..., description="Voice id (provider-specific)")
    provider: Optional[str] = Field(default=None, description="Provider name; defaults to first enabled")
    rate: float = Field(default=1.0, ge=0.25, le=4.0, description="Rate multiplier (1.0 = normal)")
    pitch: float = Field(default=1.0, ge=0.0, le=2.0, description="Pitch multiplier")
    volume: float = Field(default=1.0, ge=0.0, le=2.0, description="Volume multiplier")
    audio_format: str = Field(default="mp3", pattern="^(mp3|wav)$")


class HealthResponse(BaseModel):
    status: str
    providers: list[dict]


class VoicesResponse(BaseModel):
    provider: str
    voices: list[dict]


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    reg = get_registry()
    provider_info: list[dict] = []
    overall_ok = True
    for prov in reg.all():
        info = await prov.health()
        provider_info.append(info)
        if info.get("status") not in ("ok", "disabled"):
            overall_ok = False
    return HealthResponse(
        status="ok" if overall_ok else "degraded",
        providers=provider_info,
    )


@app.get("/providers")
async def list_providers():
    reg = get_registry()
    return {
        "providers": [
            await p.health() for p in reg.all()
        ],
        "default": _pick_default_provider(reg),
    }


@app.get("/providers/{name}/voices", response_model=VoicesResponse)
async def list_voices(
    name: str,
    language: Optional[str] = Query(default=None, description="Filter by language prefix, e.g. 'zh'"),
) -> VoicesResponse:
    reg = get_registry()
    try:
        prov = reg.get(name)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        voices = await prov.list_voices(language=language)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return VoicesResponse(provider=name, voices=[v.to_dict() for v in voices])


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    reg = get_registry()
    provider_name = request.provider or _pick_default_provider(reg)
    if not provider_name:
        raise HTTPException(status_code=503, detail="No TTS provider available")

    try:
        prov = reg.get(provider_name)
    except KeyError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider_name}. Available: {reg.list_names()}",
        ) from exc

    if not prov.enabled:
        raise HTTPException(status_code=503, detail=f"Provider {provider_name} is disabled")

    started = time.time()
    try:
        audio = await prov.synthesize(
            request.text,
            request.voice,
            rate=request.rate,
            pitch=request.pitch,
            volume=request.volume,
            audio_format=request.audio_format,
        )
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    elapsed = time.time() - started
    logger.info(
        "synthesize provider=%s voice=%s chars=%d bytes=%d elapsed=%.2fs",
        provider_name,
        request.voice,
        len(request.text),
        len(audio),
        elapsed,
    )

    media_type = "audio/mpeg" if request.audio_format == "mp3" else "audio/wav"
    return Response(
        content=audio,
        media_type=media_type,
        headers={
            "Content-Length": str(len(audio)),
            "X-Provider": provider_name,
            "X-Voice": request.voice,
            "X-Elapsed": f"{elapsed:.3f}",
        },
    )


def _pick_default_provider(reg) -> Optional[str]:
    """Return the first enabled provider, or None."""
    for prov in reg.all():
        if prov.enabled:
            return prov.name
    return None


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("TTS_PORT", "5000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
