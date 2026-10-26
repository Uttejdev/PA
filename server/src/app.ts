import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { TruncatedReplyError } from "./claude.js";
import { ChatRequest, type ChatResponse } from "./schema.js";
import { VoiceError, type ClipStore, type Voice } from "./voice.js";

export type TurnRunner = (req: ChatRequest) => Promise<ChatResponse>;
export type VoiceDeps = { voice: Voice; clips: ClipStore };

export function createApp(runTurn: TurnRunner, voiceDeps?: VoiceDeps) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // One line per request in the server window, e.g. "POST /chat 200 3.9s".
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (req.path === "/health") return;
      const path = req.path.startsWith("/audio/") ? "/audio" : req.path;
      console.log(`${req.method} ${path} ${res.statusCode} ${((Date.now() - started) / 1000).toFixed(1)}s`);
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/chat", async (req, res) => {
    const parsed = ChatRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.issues });
      return;
    }
    try {
      const result = await runTurn(parsed.data);
      if (result.kind === "tool_use") log("tools", result.toolCalls.map((t) => t.name).join(", "));
      else log(result.kind === "refusal" ? "declined" : "mika", `${result.reply.text} [${result.reply.emotion}, ${result.reply.gesture}]`);
      // Start speaking the final reply right away; the phone fetches it next.
      if (parsed.data.voice && voiceDeps && result.kind !== "tool_use") {
        const id = voiceDeps.clips.add(voiceDeps.voice.synthesize(result.reply.text));
        res.json({ ...result, audioUrl: `/audio/${id}` });
        return;
      }
      res.json(result);
    } catch (err) {
      sendError(res, "chat", err);
    }
  });

  // Speak a fixed line (e.g. the greeting when the app opens) without asking Claude.
  app.post("/speak", async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!voiceDeps || !text || text.length > 500) {
      res.status(400).json({ error: voiceDeps ? "send { text } (up to 500 characters)" : "voice is not configured" });
      return;
    }
    log("mika", text);
    res.json({ audioUrl: `/audio/${voiceDeps.clips.add(voiceDeps.voice.synthesize(text))}` });
  });

  // Body is the raw recording, e.g. Content-Type: audio/mp4 for the iPhone's .m4a.
  app.post("/transcribe", express.raw({ type: "audio/*", limit: "15mb" }), async (req, res) => {
    if (!voiceDeps) {
      res.status(400).json({ error: "voice is not configured" });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "send the recording as the request body with an audio/* Content-Type" });
      return;
    }
    try {
      const language = typeof req.query.language === "string" ? req.query.language : undefined;
      const text = await voiceDeps.voice.transcribe(req.body, req.headers["content-type"] ?? "audio/mp4", language);
      log("heard", text || "(nothing)");
      res.json({ text });
    } catch (err) {
      sendError(res, "transcribe", err);
    }
  });

  app.get("/audio/:id", async (req, res) => {
    const clip = voiceDeps?.clips.get(req.params.id);
    if (!clip) {
      res.status(404).json({ error: "audio not found or expired" });
      return;
    }
    let audio: Buffer;
    try {
      audio = await clip;
    } catch (err) {
      sendError(res, "audio", err);
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    // iOS's player asks for byte ranges, so honour simple "bytes=a-b" requests.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
      if (start > end || start >= audio.length) {
        res.status(416).setHeader("Content-Range", `bytes */${audio.length}`).end();
        return;
      }
      res.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${audio.length}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.end(audio.subarray(start, end + 1));
      return;
    }
    res.setHeader("Content-Length", String(audio.length));
    res.end(audio);
  });

  return app;
}

// Shown only in the server window on your Mac.
const log = (label: string, text: string) =>
  console.log(`  ${label}: ${text.length > 160 ? text.slice(0, 157) + "..." : text}`);

function sendError(res: express.Response, route: string, err: unknown) {
  const { status, message } = describeError(err);
  console.error(`[${route}] ${status}: ${message}`);
  res.status(status).json({ error: message });
}

function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof TruncatedReplyError) return { status: 502, message: err.message };
  if (err instanceof VoiceError) return { status: 502, message: err.message };
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 500, message: "The server's Anthropic API key is missing or invalid. Check server/.env." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Claude is rate limited; try again shortly." };
  if (err instanceof Anthropic.BadRequestError) return { status: 502, message: `Claude rejected the request: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Couldn't reach Claude. Is the Mac online?" };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Claude API error ${err.status}: ${err.message}` };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}
