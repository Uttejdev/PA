import { serverUrl } from "../lib/config";
import type { Profile } from "../lib/profile";
import type { ApiMessage, ServerResponse } from "./conversation";

const TIMEOUT_MS = 120_000;

export async function callServer(body: { messages: ApiMessage[]; profile: Profile }): Promise<ServerResponse> {
  const url = `${serverUrl()}/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(`Can't reach the server at ${serverUrl()}. Is it running on your Mac, and is the phone on the same Wi-Fi?`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Server error ${res.status}`);
  return data as ServerResponse;
}
