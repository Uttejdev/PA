"""Mika's local voice server: open-source speech-to-text and text-to-speech on this Mac.

Speaks the same OpenAI-style audio API as Boson, so server/ only changes its base URL:
  POST /v1/audio/transcriptions  (multipart: file, model, language?)  -> {"text": "..."}
  POST /v1/audio/speech          (json: input, voice, language?, response_format) -> audio bytes

Speech-to-text: Whisper large-v3-turbo via MLX (Apple Silicon GPU), ~99 languages.
Text-to-speech: Kokoro for the languages it covers, Meta MMS-TTS for other scripts
(Telugu, Tamil, Kannada, Bengali, Arabic, Russian, ...). The language is taken from the
request, or guessed from the text's script.

Run with ./start.sh. Models download from Hugging Face on first use, then work offline.
"""

from __future__ import annotations

import io
import logging
import os
import subprocess
import tempfile
import threading
import time
import unicodedata

import numpy as np
import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

log = logging.getLogger("voice")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")

WHISPER_REPO = os.environ.get("WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")

# Kokoro's language codes and a default voice for each (see hexgrad/Kokoro-82M VOICES.md).
KOKORO = {
    "en": ("a", "af_heart"),
    "es": ("e", "ef_dora"),
    "fr": ("f", "ff_siwis"),
    "hi": ("h", "hf_alpha"),
    "it": ("i", "if_sara"),
    "pt": ("p", "pf_dora"),
}

# Meta MMS-TTS checkpoints (facebook/mms-tts-<iso639-3>) for languages Kokoro lacks.
# Any of the ~1,100 MMS languages can be added here.
MMS = {
    "te": "tel", "ta": "tam", "kn": "kan", "ml": "mal", "bn": "ben", "gu": "guj", "pa": "pan",
    "mr": "mar", "or": "ory", "ur": "urd", "ar": "ara", "fa": "fas", "ru": "rus", "uk": "ukr",
    "ko": "kor", "th": "tha", "vi": "vie", "de": "deu", "nl": "nld", "tr": "tur", "id": "ind",
    "sw": "swh", "el": "ell", "he": "heb", "ne": "npi", "si": "sin", "am": "amh",
}

# Unicode script -> language, for guessing when the request doesn't say.
SCRIPTS = {
    "TELUGU": "te", "TAMIL": "ta", "KANNADA": "kn", "MALAYALAM": "ml", "BENGALI": "bn",
    "GUJARATI": "gu", "GURMUKHI": "pa", "ORIYA": "or", "DEVANAGARI": "hi", "ARABIC": "ar",
    "CYRILLIC": "ru", "HANGUL": "ko", "THAI": "th", "GREEK": "el", "HEBREW": "he",
    "SINHALA": "si", "ETHIOPIC": "am",
}

app = FastAPI(title="Mika voice server")
_lock = threading.Lock()  # MLX and torch models aren't safe to call concurrently
_kokoro: dict = {}
_mms: dict = {}


def guess_language(text: str) -> str:
    counts: dict[str, int] = {}
    for ch in text:
        if not ch.isalpha():
            continue
        name = unicodedata.name(ch, "")
        lang = next((code for script, code in SCRIPTS.items() if name.startswith(script)), "en")
        counts[lang] = counts.get(lang, 0) + 1
    return max(counts, key=counts.get) if counts else "en"


def kokoro_speak(text: str, lang: str, voice: str | None) -> tuple[np.ndarray, int]:
    from kokoro import KPipeline

    code, default_voice = KOKORO[lang]
    if code not in _kokoro:
        _kokoro[code] = KPipeline(lang_code=code, repo_id="hexgrad/Kokoro-82M")
    # A voice's first letter is its language code; only honour voices that match.
    voice = voice if voice and voice[0] == code else default_voice
    chunks = [audio.numpy() for _, _, audio in _kokoro[code](text, voice=voice) if audio is not None]
    return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32), 24_000


def mms_speak(text: str, lang: str) -> tuple[np.ndarray, int]:
    import torch
    from transformers import AutoTokenizer, VitsModel

    repo = f"facebook/mms-tts-{MMS[lang]}"
    if repo not in _mms:
        _mms[repo] = (VitsModel.from_pretrained(repo), AutoTokenizer.from_pretrained(repo))
    model, tokenizer = _mms[repo]
    if getattr(tokenizer, "is_uroman", False):  # some MMS voices expect romanized input
        import uroman

        text = uroman.Uroman().romanize_string(text)
    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        wave = model(**inputs).waveform[0].numpy()
    return wave, model.config.sampling_rate


def encode(wave: np.ndarray, rate: int, fmt: str) -> tuple[bytes, str]:
    buf = io.BytesIO()
    sf.write(buf, wave, rate, format="WAV")
    if fmt == "wav":
        return buf.getvalue(), "audio/wav"
    mp3 = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-f", "mp3", "-b:a", "96k", "pipe:1"],
        input=buf.getvalue(), capture_output=True, check=True,
    ).stdout
    return mp3, "audio/mpeg"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/audio/transcriptions")
def transcribe(file: UploadFile = File(...), model: str = Form(""), language: str = Form("")):
    import mlx_whisper

    suffix = os.path.splitext(file.filename or "")[1] or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp.flush()
        started = time.time()
        with _lock:
            result = mlx_whisper.transcribe(tmp.name, path_or_hf_repo=WHISPER_REPO, language=language or None)
    text = result.get("text", "").strip()
    log.info("heard [%s] in %.2fs: %s", result.get("language"), time.time() - started, text[:120])
    return {"text": text, "language": result.get("language")}


class SpeechRequest(BaseModel):
    input: str
    model: str = "kokoro"
    voice: str | None = None
    language: str | None = None
    response_format: str = "mp3"


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest):
    text = req.input.strip()
    if not text:
        raise HTTPException(400, "input is empty")
    lang = (req.language or guess_language(text)).lower()
    started = time.time()
    with _lock:
        if lang in KOKORO:
            wave, rate = kokoro_speak(text, lang, req.voice)
        elif lang in MMS:
            wave, rate = mms_speak(text, lang)
        else:
            raise HTTPException(400, f"no local voice for language '{lang}'; add it to KOKORO or MMS in server.py")
    audio, mime = encode(wave, rate, req.response_format)
    log.info("spoke [%s] %d chars in %.2fs", lang, len(text), time.time() - started)
    return Response(audio, media_type=mime)


def warm_up():
    """Load Whisper and the English voice up front so Mika's first reply isn't slow."""
    try:
        import mlx_whisper

        silence = np.zeros(16_000, dtype=np.float32)
        with _lock:
            mlx_whisper.transcribe(silence, path_or_hf_repo=WHISPER_REPO)
            kokoro_speak("Hi.", "en", None)
        log.info("models ready")
    except Exception:
        log.exception("warm-up failed (models will load on first request)")


if __name__ == "__main__":
    import uvicorn

    threading.Thread(target=warm_up, daemon=True).start()
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
