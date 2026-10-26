/// <reference types="jest" />
import { MAX_TOOL_ROUNDS, runUserTurn, type ServerResponse, type TurnDeps } from "../chat/conversation";
import { buildCharacterHtml } from "../character/characterHtml";
import { EMOTION_FACES, EMOTIONS, GESTURES } from "../character/mapping";
import { parseIso, sentLine, toLocalIso } from "../lib/time";

const profile = { name: "Uttej", goals: "", routines: "", language: "en" };
const now = () => new Date(2026, 9, 26, 14, 30);

function deps(responses: ServerResponse[], overrides: Partial<TurnDeps> = {}) {
  const bodies: any[] = [];
  const d: TurnDeps = {
    callServer: async (body) => {
      bodies.push(structuredClone(body));
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      return next;
    },
    runTool: async (name) => ({ ok: true, result: { ran: name } }),
    now,
    ...overrides,
  };
  return { d, bodies };
}

describe("runUserTurn", () => {
  it("returns a plain reply and appends both turns", async () => {
    const { d, bodies } = deps([
      { kind: "reply", assistant: [{ type: "text", text: "{}" }], reply: { text: "Hi!", emotion: "happy", gesture: "wave" } },
    ]);
    const res = await runUserTurn([], "hello", profile, d);
    expect(res.reply).toEqual({ text: "Hi!", emotion: "happy", gesture: "wave" });
    expect(res.history).toHaveLength(2);
    expect(bodies[0].messages[0].content).toMatch(/^\[Sent Mon 26 Oct 2026 14:30, .+\]\nhello$/);
    expect(bodies[0].profile.name).toBe("Uttej");
  });

  it("runs tools on the device and sends all results back in one message", async () => {
    const ran: string[] = [];
    const { d, bodies } = deps(
      [
        {
          kind: "tool_use",
          assistant: [{ type: "tool_use", id: "a", name: "calendar_list_events", input: {} }, { type: "tool_use", id: "b", name: "reminder_list", input: {} }],
          toolCalls: [
            { id: "a", name: "calendar_list_events", input: { start: "x", end: "y" } },
            { id: "b", name: "reminder_list", input: {} },
          ],
        },
        { kind: "reply", assistant: [{ type: "text", text: "{}" }], reply: { text: "Free all day", emotion: "calm", gesture: "nod" } },
      ],
      {
        runTool: async (name) => {
          ran.push(name);
          return name === "reminder_list" ? { ok: false, error: "boom" } : { ok: true, result: { events: [] } };
        },
      },
    );
    const res = await runUserTurn([], "what's today?", profile, d);
    expect(ran).toEqual(["calendar_list_events", "reminder_list"]);
    const second = bodies[1].messages;
    expect(second).toHaveLength(3); // user, assistant(tool_use), user(tool_results)
    expect(second[2].content).toEqual([
      { type: "tool_result", tool_use_id: "a", content: '{"events":[]}' },
      { type: "tool_result", tool_use_id: "b", content: "boom", is_error: true },
    ]);
    expect(res.history).toHaveLength(4);
    expect(res.toolsUsed).toEqual(["calendar_list_events", "reminder_list"]);
  });

  it("keeps the old history on refusal", async () => {
    const old = [{ role: "user" as const, content: "earlier" }, { role: "assistant" as const, content: [] }];
    const { d } = deps([{ kind: "refusal", reply: { text: "Sorry", emotion: "sad", gesture: "none" } }]);
    const res = await runUserTurn(old, "something", profile, d);
    expect(res.history).toBe(old);
  });

  it("stops after too many tool rounds", async () => {
    const loop: ServerResponse = { kind: "tool_use", assistant: [], toolCalls: [{ id: "x", name: "reminder_list", input: {} }] };
    const { d, bodies } = deps(Array.from({ length: 20 }, () => loop));
    const res = await runUserTurn([], "go", profile, d);
    expect(bodies).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(res.history).toEqual([]);
    expect(res.reply.emotion).toBe("worried");
  });

  it("normalizes unknown emotions/gestures", async () => {
    const { d } = deps([{ kind: "reply", assistant: [], reply: { text: "hm", emotion: "angry" as any, gesture: "dance" as any } }]);
    const res = await runUserTurn([], "x", profile, d);
    expect(res.reply).toEqual({ text: "hm", emotion: "calm", gesture: "none" });
  });

  it("propagates server errors so the caller keeps its history", async () => {
    const { d } = deps([], { callServer: async () => Promise.reject(new Error("offline")) });
    await expect(runUserTurn([], "x", profile, d)).rejects.toThrow("offline");
  });
});

describe("time helpers", () => {
  it("formats local ISO with offset and parses it back", () => {
    const d = new Date(2026, 9, 27, 9, 5, 0);
    const iso = toLocalIso(d);
    expect(iso).toMatch(/^2026-10-27T09:05:00[+-]\d{2}:\d{2}$/);
    expect(parseIso(iso, "t").getTime()).toBe(d.getTime());
  });

  it("rejects invalid dates", () => {
    expect(() => parseIso("next tuesday", "when")).toThrow(/when is not a valid/);
  });

  it("builds the sent line", () => {
    expect(sentLine(new Date(2026, 9, 26, 8, 3), "Asia/Kolkata")).toMatch(/^\[Sent Mon 26 Oct 2026 08:03, Asia\/Kolkata, UTC[+-]\d{2}:\d{2}\]$/);
  });
});

describe("character", () => {
  it("has an expression for every emotion", () => {
    for (const e of EMOTIONS) expect(EMOTION_FACES[e]).toBeDefined();
  });

  it("embeds the gesture list and pinned library versions", () => {
    const html = buildCharacterHtml("https://example.com/m.model3.json");
    for (const g of GESTURES) expect(html).toContain(`"${g}"`);
    expect(html).toContain("pixi.js@6.5.10");
    expect(html).toContain("pixi-live2d-display@0.4.0");
    expect(html).toContain("live2dcubismcore.min.js");
    expect(html).toContain("https://example.com/m.model3.json");
  });
});
