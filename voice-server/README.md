# Local voice server

Free, open-source speech for Mika that runs on your Mac, so you don't need Boson. It speaks the same API as Boson, so the
Node server only needs a setting changed.

| Job | Model | Languages |
|---|---|---|
| Speech → text | Whisper large-v3-turbo (MLX, on the Mac's GPU) | ~99 |
| Text → speech | Kokoro-82M | English, Hindi, Spanish, French, Italian, Portuguese |
| Text → speech | Meta MMS-TTS | Telugu, Tamil, Kannada, Malayalam, Bengali, Arabic, Russian and more (~1,100 available) |

The reply's language is guessed from its script, so a Telugu reply is spoken by the Telugu voice. Text written in the Latin
alphabet is read as English.

## Run it

You need an Apple Silicon Mac with `uv` and `ffmpeg` installed (`brew install uv ffmpeg`).

```bash
./voice-server/start.sh
```

The first run downloads the Python packages and about 2 GB of models, which takes a few minutes. After that it works
offline. Wait for `models ready` to appear.

Then, in `server/.env`, set:

```
VOICE_PROVIDER=local
```

and restart the Node server. It prints `voice: local (...)` when it starts.

## Make it yours

- **Mika's voice:** set `LOCAL_VOICE` in `server/.env` to any English Kokoro voice, such as `af_bella` or `bf_emma`. The
  full list is in hexgrad/Kokoro-82M's `VOICES.md` on Hugging Face.
- **More languages:** add an entry to the `MMS` table in `server.py`, mapping a language code to an MMS code (for example
  `"my": "mya"` for Burmese).
- **A different Whisper model:** start the server with `WHISPER_MODEL=mlx-community/whisper-large-v3-mlx` for a little more
  accuracy (it's slower), or point it at your own fine-tuned model.
