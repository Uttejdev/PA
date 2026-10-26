import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { networkInterfaces } from "node:os";
import { createApp } from "./app.js";
import { runTurn } from "./claude.js";
import type { ChatRequest } from "./schema.js";
import { ClipStore, voiceFromEnv } from "./voice.js";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and paste your key into it.");
}

const client = new Anthropic();
const port = Number(process.env.PORT ?? 8787);

const { voice, label: voiceLabel, warning: voiceWarning } = voiceFromEnv(process.env);
if (voiceWarning) console.warn(voiceWarning);

const runner = async (req: ChatRequest) => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The server has no Anthropic API key. Put it in server/.env and restart the server.");
  return runTurn(client, req);
};

// Listen on all interfaces so the iPhone on the same Wi-Fi can reach the Mac.
createApp(runner, { voice, clips: new ClipStore() }).listen(port, "0.0.0.0", () => {
  console.log(`Companion server running on port ${port} (voice: ${voiceLabel})`);
  for (const addr of Object.values(networkInterfaces()).flat()) {
    if (addr && addr.family === "IPv4" && !addr.internal) console.log(`  Phone URL: http://${addr.address}:${port}`);
  }
});
