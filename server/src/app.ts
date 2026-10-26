import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { TruncatedReplyError } from "./claude.js";
import { ChatRequest, type ChatResponse } from "./schema.js";

export type TurnRunner = (req: ChatRequest) => Promise<ChatResponse>;

export function createApp(runTurn: TurnRunner) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

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
      res.json(await runTurn(parsed.data));
    } catch (err) {
      const { status, message } = describeError(err);
      console.error(`[chat] ${status}: ${message}`);
      res.status(status).json({ error: message });
    }
  });

  return app;
}

function describeError(err: unknown): { status: number; message: string } {
  if (err instanceof TruncatedReplyError) return { status: 502, message: err.message };
  if (err instanceof Anthropic.AuthenticationError)
    return { status: 500, message: "The server's Anthropic API key is missing or invalid. Check server/.env." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "Claude is rate limited; try again shortly." };
  if (err instanceof Anthropic.BadRequestError) return { status: 502, message: `Claude rejected the request: ${err.message}` };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Couldn't reach Claude. Is the Mac online?" };
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Claude API error ${err.status}: ${err.message}` };
  return { status: 500, message: err instanceof Error ? err.message : String(err) };
}
