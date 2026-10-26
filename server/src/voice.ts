import { randomUUID } from "node:crypto";

// Speech-to-text and text-to-speech over an OpenAI-style audio API
// (POST /audio/transcriptions and /audio/speech). Two providers speak it:
//  - Boson AI (https://docs.boson.ai), hosted; the key lives only in server/.env.
//  - The local open-source voice server in voice-server/ (Whisper + Kokoro/MMS),
//    which runs on this Mac and needs no key.
// VOICE_PROVIDER in server/.env picks one (see voiceFromEnv).

const BASE_URL = "https://api.boson.ai/v1";
export const STT_MODEL = "higgs-stt-3.1";
export const TTS_MODEL = "higgs-tts-3";

export const LOCAL_BASE_URL = "http://127.0.0.1:8000/v1";
export const LOCAL_STT_MODEL = "whisper-large-v3-turbo";
export const LOCAL_TTS_MODEL = "kokoro";
export const LOCAL_VOICE = "af_heart";

export class VoiceError extends Error {}

const TTS_ATTEMPTS = 3;

export type Voice = {
  /** `language` is an ISO-639-1 code like "en"; without it the language is guessed (often wrongly for short clips). */
  transcribe(audio: Buffer, mimeType: string, language?: string): Promise<string>;
  /** Returns MP3 bytes. */
  synthesize(text: string): Promise<Buffer>;
};

export type VoiceConfig = {
  apiKey: string | undefined;
  voice: string;
  fetch?: typeof fetch; // injectable for tests
  retryDelayMs?: number; // tests use 0
};

type Endpoint = VoiceConfig & {
  name: string;
  baseUrl: string;
  sttModel: string;
  ttsModel: string;
  missingKey?: string; // error shown when a key is required but absent
  unreachable?: string; // error shown when the server can't be reached
};

export class OpenAIVoice implements Voice {
  constructor(private cfg: Endpoint) {}

  private headers(): Record<string, string> {
    if (this.cfg.apiKey) return { Authorization: `Bearer ${this.cfg.apiKey}` };
    if (this.cfg.missingKey) throw new VoiceError(this.cfg.missingKey);
    return {};
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await (this.cfg.fetch ?? fetch)(`${this.cfg.baseUrl}${path}`, init);
    } catch (err) {
      throw new VoiceError(this.cfg.unreachable ?? `Couldn't reach ${this.cfg.name} at ${this.cfg.baseUrl}: ${String(err)}`);
    }
  }

  async transcribe(audio: Buffer, mimeType: string, language?: string): Promise<string> {
    const form = new FormData();
    form.append("model", this.cfg.sttModel);
    if (language && /^[a-z]{2}$/.test(language)) form.append("language", language);
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${extensionFor(mimeType)}`);
    const res = await this.fetch("/audio/transcriptions", { method: "POST", headers: this.headers(), body: form });
    if (!res.ok) throw new VoiceError(`Speech-to-text failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  }

  async synthesize(text: string): Promise<Buffer> {
    // Boson's free preview is sometimes "busy" (429) for a moment, so retry.
    for (let attempt = 1; ; attempt++) {
      const res = await this.fetch("/audio/speech", {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.cfg.ttsModel, voice: this.cfg.voice, input: text, response_format: "mp3" }),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= TTS_ATTEMPTS) throw new VoiceError(`Text-to-speech failed (${res.status}): ${await res.text()}`);
      await new Promise((r) => setTimeout(r, this.cfg.retryDelayMs ?? 700 * attempt));
    }
  }
}

export class BosonVoice extends OpenAIVoice {
  constructor(cfg: VoiceConfig) {
    super({
      ...cfg,
      name: "Boson",
      baseUrl: BASE_URL,
      sttModel: STT_MODEL,
      ttsModel: TTS_MODEL,
      missingKey: "The server has no Boson API key. Put BOSON_API_KEY in server/.env and restart.",
    });
  }
}

export type LocalVoiceConfig = Partial<VoiceConfig> & { baseUrl?: string; sttModel?: string; ttsModel?: string };

/** The open-source voice server in voice-server/, or anything else with an OpenAI-style audio API. */
export class LocalVoice extends OpenAIVoice {
  constructor(cfg: LocalVoiceConfig = {}) {
    const baseUrl = (cfg.baseUrl || LOCAL_BASE_URL).replace(/\/+$/, "");
    super({
      apiKey: cfg.apiKey,
      voice: cfg.voice || LOCAL_VOICE,
      fetch: cfg.fetch,
      retryDelayMs: cfg.retryDelayMs,
      name: "the local voice server",
      baseUrl,
      sttModel: cfg.sttModel || LOCAL_STT_MODEL,
      ttsModel: cfg.ttsModel || LOCAL_TTS_MODEL,
      unreachable: `Couldn't reach the local voice server at ${baseUrl}. Start it with voice-server/start.sh, or set VOICE_PROVIDER=boson in server/.env.`,
    });
  }
}

/** Picks the voice provider from server/.env. `warning` is printed at startup when something is missing. */
export function voiceFromEnv(env: Record<string, string | undefined>): { voice: Voice; label: string; warning?: string } {
  const provider = (env.VOICE_PROVIDER || "boson").toLowerCase();
  if (provider === "local") {
    const voice = new LocalVoice({
      baseUrl: env.LOCAL_VOICE_URL,
      apiKey: env.LOCAL_VOICE_API_KEY,
      sttModel: env.LOCAL_STT_MODEL,
      ttsModel: env.LOCAL_TTS_MODEL,
      voice: env.LOCAL_VOICE,
    });
    return { voice, label: `local (${env.LOCAL_VOICE_URL || LOCAL_BASE_URL})` };
  }
  const warning =
    provider !== "boson"
      ? `VOICE_PROVIDER=${env.VOICE_PROVIDER} isn't known (use "boson" or "local"), so using Boson.`
      : !env.BOSON_API_KEY
        ? "BOSON_API_KEY is not set, so voice won't work. Add it to .env (get one at boson.ai/workspace), or set VOICE_PROVIDER=local."
        : undefined;
  return { voice: new BosonVoice({ apiKey: env.BOSON_API_KEY, voice: env.BOSON_VOICE || "chloe" }), label: "Boson", warning };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  return "audio";
}

// Replies are synthesized as soon as Claude answers; the phone then fetches
// GET /audio/:id. Keeping the audio here briefly lets the phone's player
// make the range requests it likes, and avoids base64 in the chat response.
const CLIP_TTL_MS = 5 * 60_000;

export class ClipStore {
  private clips = new Map<string, { audio: Promise<Buffer>; expires: number }>();

  add(audio: Promise<Buffer>): string {
    this.sweep();
    const id = randomUUID();
    audio.catch(() => {}); // errors surface when the clip is fetched
    this.clips.set(id, { audio, expires: Date.now() + CLIP_TTL_MS });
    return id;
  }

  get(id: string): Promise<Buffer> | undefined {
    this.sweep();
    return this.clips.get(id)?.audio;
  }

  private sweep() {
    const now = Date.now();
    for (const [id, clip] of this.clips) if (clip.expires < now) this.clips.delete(id);
  }
}
