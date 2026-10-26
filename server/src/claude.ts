import Anthropic from "@anthropic-ai/sdk";
import { systemBlocks } from "./prompt.js";
import { CharacterReply, replyFormat, tools, type ChatRequest, type ChatResponse } from "./schema.js";

export const MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type TurnOptions = {
  // Opus 5.5 defaults to "medium"; set explicitly so it's easy to tune.
  effort?: Effort;
};

export class TruncatedReplyError extends Error {}

// Runs ONE model turn. If Claude asks for tools, we hand the tool_use blocks
// back to the app (the tools live on the phone) and the app calls us again
// with the results. The app keeps the history; this server stores nothing.
export async function runTurn(client: Anthropic, req: ChatRequest, opts: TurnOptions = {}): Promise<ChatResponse> {
  // Streaming avoids HTTP timeouts on long turns; we only need the final message.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    // Re-runs a safety-declined request on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium", format: replyFormat },
    // Caches tools + system + history prefix between turns.
    cache_control: { type: "ephemeral" },
    system: systemBlocks(req.profile),
    tools,
    messages: req.messages as Anthropic.Beta.Messages.BetaMessageParam[],
  });
  const message = await stream.finalMessage();

  switch (message.stop_reason) {
    case "refusal":
      return {
        kind: "refusal",
        reply: { text: "Sorry, I can't help with that one. Want to plan something else?", emotion: "sad", gesture: "none" },
      };
    case "max_tokens":
    case "model_context_window_exceeded":
      throw new TruncatedReplyError(`reply cut off (${message.stop_reason})`);
    case "tool_use": {
      const toolCalls = message.content
        .filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));
      return { kind: "tool_use", assistant: message.content, toolCalls };
    }
    default:
      return { kind: "reply", assistant: message.content, reply: parseReply(message.content) };
  }
}

export function parseReply(content: Anthropic.Beta.Messages.BetaContentBlock[]): CharacterReply {
  const text = content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = CharacterReply.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through: structured output should prevent this, but never crash the chat
  }
  return { text: text.trim() || "Hmm, I lost my train of thought. Could you say that again?", emotion: "calm", gesture: "none" };
}
