import { normalizeEmotion, normalizeGesture, type Emotion, type Gesture } from "../character/mapping";
import type { Profile } from "../lib/profile";
import { sentLine } from "../lib/time";

// Shapes of the server's /chat contract (see server/src/schema.ts).
// Content blocks are kept opaque: the app stores whatever the server returns
// and sends it back unchanged, which the API requires for thinking blocks.
export type ContentBlock = { type: string; [key: string]: unknown };
export type ApiMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };
export type CharacterReply = { text: string; emotion: Emotion; gesture: Gesture };
export type ToolCall = { id: string; name: string; input: unknown };

export type ServerResponse =
  | { kind: "tool_use"; assistant: ContentBlock[]; toolCalls: ToolCall[] }
  | { kind: "reply"; assistant: ContentBlock[]; reply: CharacterReply }
  | { kind: "refusal"; reply: CharacterReply };

export type TurnDeps = {
  callServer: (body: { messages: ApiMessage[]; profile: Profile }) => Promise<ServerResponse>;
  runTool: (name: string, input: unknown) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
  onToolStart?: (name: string) => void;
  now?: () => Date;
};

export type TurnResult = { history: ApiMessage[]; reply: CharacterReply; toolsUsed: string[] };

// Enough rounds for "check calendar, then add 3 events, then set a reminder".
export const MAX_TOOL_ROUNDS = 8;

// Runs one user turn to completion: sends the message, executes any tools
// Claude asks for on this phone, loops until Claude gives a final reply.
// History is only ever appended to. If the turn fails or is declined, the
// returned history is the original one, so a bad turn never sticks.
export async function runUserTurn(
  history: ApiMessage[],
  userText: string,
  profile: Profile,
  deps: TurnDeps,
): Promise<TurnResult> {
  const now = deps.now?.() ?? new Date();
  const working: ApiMessage[] = [...history, { role: "user", content: `${sentLine(now)}\n${userText}` }];
  const toolsUsed: string[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await deps.callServer({ messages: working, profile });

    if (res.kind === "refusal") return { history, reply: clean(res.reply), toolsUsed };

    working.push({ role: "assistant", content: res.assistant });
    if (res.kind === "reply") return { history: working, reply: clean(res.reply), toolsUsed };

    // All results go back in ONE user message, in the order Claude asked.
    const results: ContentBlock[] = [];
    for (const call of res.toolCalls) {
      deps.onToolStart?.(call.name);
      toolsUsed.push(call.name);
      const outcome = await deps.runTool(call.name, call.input);
      results.push(
        outcome.ok
          ? { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(outcome.result ?? null) }
          : { type: "tool_result", tool_use_id: call.id, content: outcome.error, is_error: true },
      );
    }
    working.push({ role: "user", content: results });
  }

  return {
    history,
    reply: { text: "I got a bit tangled up doing all that. Could you ask me again, one step at a time?", emotion: "worried", gesture: "tilt_head" },
    toolsUsed,
  };
}

function clean(reply: CharacterReply): CharacterReply {
  return { text: String(reply.text ?? ""), emotion: normalizeEmotion(reply.emotion), gesture: normalizeGesture(reply.gesture) };
}
