import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  BosonVoice,
  ClipStore,
  LOCAL_STT_MODEL,
  LOCAL_TTS_MODEL,
  LOCAL_VOICE,
  LocalVoice,
  STT_MODEL,
  TTS_MODEL,
  voiceFromEnv,
} from "../src/voice.js";

const MP3 = Buffer.from("ID3-fake-mp3-bytes-0123456789");

// Fake Boson API: records requests, answers like the real one.
function fakeBoson() {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url.endsWith("/audio/transcriptions")) return Response.json({ text: " Add a run tomorrow at ten. " });
    if (url.endsWith("/audio/speech")) return new Response(MP3, { headers: { "content-type": "audio/mpeg" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { voice: new BosonVoice({ apiKey: "bai-test", voice: "chloe", fetch: fetchImpl, retryDelayMs: 0 }), requests };
}

async function withServer(fn: (url: string, boson: ReturnType<typeof fakeBoson>) => Promise<void>) {
  const boson = fakeBoson();
  const app = createApp(
    async () => ({ kind: "reply", assistant: [], reply: { text: "Done!", emotion: "happy", gesture: "nod", action: "none" } }),
    { voice: boson.voice, clips: new ClipStore() },
  );
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, boson);
  } finally {
    server.close();
  }
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("voice routes", () => {
  it("POST /transcribe sends the audio to Boson and returns trimmed text", () =>
    withServer(async (url, boson) => {
      const res = await fetch(`${url}/transcribe?language=en`, { method: "POST", headers: { "content-type": "audio/mp4" }, body: Buffer.from("audio") });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ text: "Add a run tomorrow at ten." });
      const form = boson.requests[0].init.body as FormData;
      expect(form.get("model")).toBe(STT_MODEL);
      expect(form.get("language")).toBe("en");
      expect((form.get("file") as File).name).toBe("speech.m4a");
      expect((boson.requests[0].init.headers as Record<string, string>).Authorization).toBe("Bearer bai-test");
    }));

  it("POST /chat with voice returns an audioUrl that serves the spoken reply", () =>
    withServer(async (url, boson) => {
      const res = await post(`${url}/chat`, { messages: [{ role: "user", content: "hi" }], voice: true });
      const data = await res.json();
      expect(data.audioUrl).toMatch(/^\/audio\/[0-9a-f-]+$/);
      const tts = JSON.parse(boson.requests[0].init.body as string);
      expect(tts).toMatchObject({ model: TTS_MODEL, voice: "chloe", input: "Done!", response_format: "mp3" });

      const audio = await fetch(`${url}${data.audioUrl}`);
      expect(audio.headers.get("content-type")).toBe("audio/mpeg");
      expect(Buffer.from(await audio.arrayBuffer())).toEqual(MP3);

      // iOS asks for byte ranges.
      const part = await fetch(`${url}${data.audioUrl}`, { headers: { range: "bytes=0-1" } });
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe(`bytes 0-1/${MP3.length}`);
      expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("ID");
    }));

  it("POST /chat without voice has no audio", () =>
    withServer(async (url, boson) => {
      const data = await (await post(`${url}/chat`, { messages: [{ role: "user", content: "hi" }] })).json();
      expect(data.audioUrl).toBeUndefined();
      expect(boson.requests).toHaveLength(0);
    }));

  it("POST /transcribe rejects an empty body", () =>
    withServer(async (url) => {
      expect((await fetch(`${url}/transcribe`, { method: "POST", headers: { "content-type": "audio/mp4" } })).status).toBe(400);
    }));

  it("POST /speak returns playable audio for a fixed line", () =>
    withServer(async (url, boson) => {
      const data = await (await post(`${url}/speak`, { text: "Good morning!" })).json();
      expect(JSON.parse(boson.requests[0].init.body as string).input).toBe("Good morning!");
      const audio = await fetch(`${url}${data.audioUrl}`);
      expect(Buffer.from(await audio.arrayBuffer())).toEqual(MP3);
      expect((await post(`${url}/speak`, { text: "" })).status).toBe(400);
    }));

  it("unknown audio ids are 404", () =>
    withServer(async (url) => {
      expect((await fetch(`${url}/audio/nope`)).status).toBe(404);
    }));

  it("retries text-to-speech when Boson is busy", async () => {
    let calls = 0;
    const flaky = (async () => (++calls < 3 ? new Response("busy", { status: 429 }) : new Response(MP3))) as unknown as typeof fetch;
    const voice = new BosonVoice({ apiKey: "k", voice: "chloe", fetch: flaky, retryDelayMs: 0 });
    expect(await voice.synthesize("hi")).toEqual(MP3);
    expect(calls).toBe(3);
    const broken = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    await expect(new BosonVoice({ apiKey: "k", voice: "chloe", fetch: broken, retryDelayMs: 0 }).synthesize("hi")).rejects.toThrow(/400/);
  });

  it("explains a missing Boson key", async () => {
    const voice = new BosonVoice({ apiKey: undefined, voice: "chloe" });
    await expect(voice.synthesize("hi")).rejects.toThrow(/BOSON_API_KEY/);
  });
});

describe("local voice provider", () => {
  function recording() {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return url.endsWith("/audio/transcriptions") ? Response.json({ text: " నమస్కారం " }) : new Response(MP3);
    }) as typeof fetch;
    return { requests, fetchImpl };
  }

  it("talks to the local server with no key", async () => {
    const { requests, fetchImpl } = recording();
    const voice = new LocalVoice({ fetch: fetchImpl });
    expect(await voice.transcribe(Buffer.from("a"), "audio/mp4", "te")).toBe("నమస్కారం");
    expect(await voice.synthesize("hi")).toEqual(MP3);
    expect(requests[0].url).toBe("http://127.0.0.1:8000/v1/audio/transcriptions");
    expect((requests[0].init.body as FormData).get("model")).toBe(LOCAL_STT_MODEL);
    expect(requests[0].init.headers).toEqual({});
    expect(JSON.parse(requests[1].init.body as string)).toMatchObject({ model: LOCAL_TTS_MODEL, voice: LOCAL_VOICE, input: "hi" });
  });

  it("explains when the local server isn't running", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(new LocalVoice({ fetch: down }).synthesize("hi")).rejects.toThrow(/voice-server\/start\.sh/);
  });

  it("VOICE_PROVIDER picks the provider", () => {
    expect(voiceFromEnv({ BOSON_API_KEY: "k" })).toMatchObject({ label: "Boson", warning: undefined });
    expect(voiceFromEnv({}).warning).toMatch(/BOSON_API_KEY/);
    const local = voiceFromEnv({ VOICE_PROVIDER: "local", LOCAL_VOICE_URL: "http://mac:9000/v1/" });
    expect(local.voice).toBeInstanceOf(LocalVoice);
    expect(local.label).toBe("local (http://mac:9000/v1/)");
    expect(local.warning).toBeUndefined();
    expect(voiceFromEnv({ VOICE_PROVIDER: "nope", BOSON_API_KEY: "k" }).warning).toMatch(/isn't known/);
  });
});
