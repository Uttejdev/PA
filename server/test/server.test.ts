import type Anthropic from "@anthropic-ai/sdk";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { MODEL, parseReply, runTurn } from "../src/claude.js";
import { tools, type ChatRequest } from "../src/schema.js";

type Msg = Partial<Anthropic.Beta.Messages.BetaMessage>;

// Minimal stand-in for the SDK client: records the request, returns a canned message.
function fakeClient(message: Msg) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          calls.push(params);
          return { finalMessage: async () => message };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const req: ChatRequest = {
  messages: [{ role: "user", content: "[Sent Mon 26 Oct 2026 14:30, America/Los_Angeles, UTC-07:00]\nHi!" }],
  profile: { name: "Uttej", goals: "Run a 10k", routines: "Gym Tue/Thu" },
};

describe("runTurn", () => {
  it("sends the expected request", async () => {
    const { client, calls } = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"text":"Hey!","emotion":"happy","gesture":"wave"}', citations: null }],
    });
    await runTurn(client, req);
    const p = calls[0] as any;
    expect(p.model).toBe(MODEL);
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toContain("server-side-fallback-2026-07-01");
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.tool_choice).toBeUndefined(); // forced tool_choice is a 400 on Opus 5.5
    expect(p.system[1].text).toContain("Uttej");
    expect(p.system[0].text).not.toContain("Uttej"); // persona block stays cacheable
  });

  it("parses a final reply", async () => {
    const { client } = fakeClient({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: '{"text":"Hey Uttej!","emotion":"excited","gesture":"cheer"}', citations: null },
      ],
    });
    const res = await runTurn(client, req);
    expect(res.kind).toBe("reply");
    if (res.kind !== "reply") return;
    expect(res.reply).toEqual({ text: "Hey Uttej!", emotion: "excited", gesture: "cheer" });
    expect(res.assistant[0].type).toBe("thinking"); // returned untouched for the app to store
  });

  it("hands tool calls back to the app", async () => {
    const { client } = fakeClient({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "toolu_1", name: "reminder_list", input: {} },
        { type: "tool_use", id: "toolu_2", name: "note_search", input: { query: "gym" } },
      ] as any,
    });
    const res = await runTurn(client, req);
    expect(res.kind).toBe("tool_use");
    if (res.kind !== "tool_use") return;
    expect(res.toolCalls.map((t) => t.name)).toEqual(["reminder_list", "note_search"]);
  });

  it("turns a refusal into a gentle reply", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", content: [] });
    const res = await runTurn(client, req);
    expect(res.kind).toBe("refusal");
  });

  it("rejects truncated replies", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", content: [] });
    await expect(runTurn(client, req)).rejects.toThrow(/cut off/);
  });
});

describe("parseReply", () => {
  it("falls back to calm/none when the text isn't valid JSON", () => {
    expect(parseReply([{ type: "text", text: "plain words", citations: null }])).toEqual({
      text: "plain words",
      emotion: "calm",
      gesture: "none",
    });
  });
});

describe("tool schemas", () => {
  it("are strict and closed", () => {
    for (const t of tools) {
      expect(t.strict).toBe(true);
      expect(t.input_schema.additionalProperties).toBe(false);
      expect(t.input_schema.required).toEqual(Object.keys(t.input_schema.properties ?? {}));
    }
  });
});

describe("HTTP", () => {
  async function withServer(fn: (url: string) => Promise<void>) {
    const app = createApp(async () => ({ kind: "reply", assistant: [], reply: { text: "ok", emotion: "calm", gesture: "nod" } }));
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
    }
  }

  it("POST /chat returns the turn result", () =>
    withServer(async (url) => {
      const res = await fetch(`${url}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).reply.gesture).toBe("nod");
    }));

  it("POST /chat rejects a bad body", () =>
    withServer(async (url) => {
      const res = await fetch(`${url}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      });
      expect(res.status).toBe(400);
    }));
});
