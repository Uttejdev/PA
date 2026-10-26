import { serverUrl } from "../lib/config";
import type { ChatBody, ServerResponse } from "./conversation";

const CHAT_TIMEOUT_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 30_000;

async function request(path: string, init: RequestInit, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${serverUrl()}${path}`, { ...init, signal: controller.signal });
  } catch {
    throw new Error(`Can't reach the server at ${serverUrl()}. Is it running on your Mac, and is the phone on the same Wi-Fi?`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Server error ${res.status}`);
  return data;
}

export function callServer(body: ChatBody): Promise<ServerResponse> {
  return request(
    "/chat",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    CHAT_TIMEOUT_MS,
  );
}

/** Sends a recording (raw bytes) to the server's speech-to-text. */
export async function transcribe(audio: ArrayBuffer, mimeType = "audio/mp4", language = "en"): Promise<string> {
  const data = await request(
    `/transcribe?language=${encodeURIComponent(language)}`,
    { method: "POST", headers: { "content-type": mimeType }, body: audio },
    TRANSCRIBE_TIMEOUT_MS,
  );
  return String(data.text ?? "").trim();
}

/** Full URL for a server-relative audio path like /audio/abc. */
export const audioUrl = (path: string) => `${serverUrl()}${path}`;

/** Has the server speak a fixed line; returns a server-relative audio path. */
export async function speak(text: string): Promise<string> {
  const data = await request(
    "/speak",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) },
    TRANSCRIBE_TIMEOUT_MS,
  );
  return String(data.audioUrl);
}
