import { randomUUID } from "node:crypto";

// Speech-to-text and text-to-speech via Boson AI (https://docs.boson.ai).
// The key lives only in server/.env, like the Anthropic key.

const BASE_URL = "https://api.boson.ai/v1";
export const STT_MODEL = "higgs-stt-3.1";
export const TTS_MODEL = "higgs-tts-3";

export class VoiceError extends Error {}

export type VoiceConfig = {
  apiKey: string | undefined;
  voice: string;
  fetch?: typeof fetch; // injectable for tests
};

export class BosonVoice {
  constructor(private cfg: VoiceConfig) {}

  private key(): string {
    if (!this.cfg.apiKey) throw new VoiceError("The server has no Boson API key. Put BOSON_API_KEY in server/.env and restart.");
    return this.cfg.apiKey;
  }

  private get fetch() {
    return this.cfg.fetch ?? fetch;
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append("model", STT_MODEL);
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `speech.${extensionFor(mimeType)}`);
    const res = await this.fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key()}` },
      body: form,
    });
    if (!res.ok) throw new VoiceError(`Speech-to-text failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  }

  async synthesize(text: string): Promise<Buffer> {
    const res = await this.fetch(`${BASE_URL}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: TTS_MODEL, voice: this.cfg.voice, input: text, response_format: "mp3" }),
    });
    if (!res.ok) throw new VoiceError(`Text-to-speech failed (${res.status}): ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
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
