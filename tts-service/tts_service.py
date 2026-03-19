"""
BookDock TTS Service
====================
FastAPI-based TTS worker using Piper (ONNX-based neural TTS).

Endpoints:
  GET  /health          - Health check
  GET  /voices          - List available voices
  POST /synthesize      - Synthesize speech from text
       Body: { "text": str, "voice": str, "sample_rate": int }
       Returns: audio/wav or audio/mp3

Environment Variables:
  PIPER_VOICE_PATH  - Path to .onnx voice model file
  PIPER_SAMPLE_RATE - Output sample rate (default: 22050)
  REDIS_URL         - Redis URL for job queue (future use)
"""

import os
import io
import hashlib
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import piper_tts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tts_service")

# ── Config ────────────────────────────────────────────────────────────────────
VOICE_PATH = os.environ.get("PIPER_VOICE_PATH", "/models/voice.onnx")
SAMPLE_RATE = int(os.environ.get("PIPER_SAMPLE_RATE", "22050"))
PORT = int(os.environ.get("PIPER_PORT", "5000"))

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="BookDock TTS Service",
    description="Piper TTS engine for BookDock audio reading",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load Piper model at startup ───────────────────────────────────────────────
_model = None


def load_model():
    global _model
    if _model is None:
        logger.info(f"Loading Piper model from {VOICE_PATH}")
        _model = piper_tts.PiperModel.load(VOICE_PATH)
        logger.info("Model loaded successfully")
    return _model


@app.on_event("startup")
async def startup():
    try:
        load_model()
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        # Don't raise - allow server to start for health check


# ── Models ────────────────────────────────────────────────────────────────────
class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100000)
    voice: str = Field(default=os.environ.get("PIPER_MODEL", "en_US-lessac-medium"))
    sample_rate: int = Field(default=SAMPLE_RATE, ge=8000, le=48000)
    output_format: str = Field(default="wav", pattern="^(wav|mp3)$")


class VoiceInfo(BaseModel):
    name: str
    language: str
    sample_rate: int
    description: str


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """Health check endpoint."""
    status = "ready" if _model is not None else "loading"
    return {
        "status": status,
        "model_loaded": _model is not None,
        "voice_path": VOICE_PATH,
        "sample_rate": SAMPLE_RATE,
    }


@app.get("/voices")
async def list_voices():
    """List available TTS voices."""
    # This would be dynamic based on installed models
    voices = [
        VoiceInfo(
            name="en_US-lessac-medium",
            language="en-US",
            sample_rate=22050,
            description="American English, medium quality (recommended)",
        ),
        VoiceInfo(
            name="en_US-amy-medium",
            language="en-US",
            sample_rate=22050,
            description="American English, female voice",
        ),
        VoiceInfo(
            name="en_GB-semaine-medium",
            language="en-GB",
            sample_rate=22050,
            description="British English, medium quality",
        ),
    ]
    return {"voices": voices, "default": "en_US-lessac-medium"}


@app.post("/synthesize")
async def synthesize(
    request: SynthesizeRequest,
    background_tasks: BackgroundTasks,
):
    """
    Synthesize speech from text.

    Returns audio in WAV format (16-bit PCM, mono).
    """
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="TTS model not yet loaded. Try again shortly.",
        )

    try:
        logger.info(f"Synthesizing {len(request.text)} chars with voice {request.voice}")

        # Run synthesis
        with io.BytesIO() as wav_io:
            _model.synthesize(
                request.text,
                wav_io,
                sample_rate=request.sample_rate,
            )
            audio_bytes = wav_io.getvalue()

        # Compute content hash for caching
        content_hash = hashlib.sha256(audio_bytes).hexdigest()[:16]

        logger.info(
            f"Synthesized {len(audio_bytes)} bytes, hash={content_hash}, "
            f"duration={len(audio_bytes)/(request.sample_rate*2):.1f}s"
        )

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Length": str(len(audio_bytes)),
                "X-Content-Hash": content_hash,
                "X-Sample-Rate": str(request.sample_rate),
            },
        )

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.post("/synthesize-stream")
async def synthesize_stream(request: SynthesizeRequest):
    """
    Streaming synthesis for long texts.

    Returns a streaming response as audio is generated.
    """
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail="TTS model not yet loaded",
        )

    def generate():
        try:
            # Piper doesn't natively stream, but we chunk output
            with io.BytesIO() as wav_io:
                _model.synthesize(
                    request.text,
                    wav_io,
                    sample_rate=request.sample_rate,
                )
                audio_bytes = wav_io.getvalue()
            yield audio_bytes
        except Exception as e:
            logger.error(f"Streaming synthesis failed: {e}")

    return Response(
        content=generate(),
        media_type="audio/wav",
        headers={
            "X-Sample-Rate": str(request.sample_rate),
            "Transfer-Encoding": "chunked",
        },
    )


# ── Job Queue Support (for background TTS generation) ─────────────────────────
class TtsJobRequest(BaseModel):
    job_id: str
    text: str
    voice: str = "en_US-lessac-medium"
    sample_rate: int = 22050
    output_path: str


@app.post("/jobs/enqueue")
async def enqueue_job(request: TtsJobRequest, background_tasks: BackgroundTasks):
    """
    Enqueue a TTS job for background processing.
    Used for pre-generating audio for entire books.
    """
    # Future: push to Redis queue
    # For now, process inline
    background_tasks.add_task(process_job, request)
    return JSONResponse({"job_id": request.job_id, "status": "queued"})


async def process_job(job: TtsJobRequest):
    """Background job processor."""
    try:
        with io.BytesIO() as wav_io:
            _model.synthesize(job.text, wav_io, sample_rate=job.sample_rate)
            audio_bytes = wav_io.getvalue()

        # Save to output path
        os.makedirs(os.path.dirname(job.output_path), exist_ok=True)
        with open(job.output_path, "wb") as f:
            f.write(audio_bytes)

        logger.info(f"Job {job.job_id} completed: {job.output_path}")

    except Exception as e:
        logger.error(f"Job {job.job_id} failed: {e}")


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
