/// <reference types="jest" />
import { runUserTurn } from "../chat/conversation";
import { isMeaningful } from "../voice/filter";
import { greeting } from "../voice/greeting";
import { Vad, type VadEvent } from "../voice/vad";

// Feeds a timeline of [durationMs, dB] segments at 100ms steps; returns events with times.
function run(vad: Vad, segments: [number, number][]) {
  const events: [VadEvent, number][] = [];
  let t = 0;
  for (const [ms, db] of segments) {
    for (let i = 0; i < ms; i += 100, t += 100) {
      const e = vad.push(db, t);
      if (e) events.push([e, t]);
    }
  }
  return events;
}

describe("Vad", () => {
  it("detects an utterance after learning the room's noise", () => {
    const events = run(new Vad(), [
      [1000, -55], // quiet room
      [2000, -25], // talking
      [1500, -55], // quiet again
    ]);
    expect(events.map((e) => e[0])).toEqual(["speech_start", "speech_end"]);
    const [, endAt] = events[1];
    expect(endAt).toBeGreaterThanOrEqual(3000 + 1000);
    expect(endAt).toBeLessThan(3000 + 1400);
  });

  it("ignores short clicks", () => {
    const events = run(new Vad({ noSpeechTimeoutMs: 3000 }), [
      [1000, -55],
      [100, -20], // a tap on the phone
      [3000, -55],
    ]);
    expect(events.map((e) => e[0])).toEqual(["no_speech"]);
  });

  it("works in a noisy room", () => {
    const events = run(new Vad(), [
      [1000, -32], // café background
      [1500, -14], // talking over it
      [1500, -32],
    ]);
    expect(events.map((e) => e[0])).toEqual(["speech_start", "speech_end"]);
  });

  it("doesn't end the turn on a short pause between words", () => {
    const events = run(new Vad(), [
      [500, -55],
      [1000, -25],
      [600, -55], // brief pause
      [1000, -25],
      [1500, -55],
    ]);
    expect(events.map((e) => e[0])).toEqual(["speech_start", "speech_end"]);
    expect(events[1][1]).toBeGreaterThan(3100);
  });

  it("cuts off very long turns", () => {
    const events = run(new Vad({ maxUtteranceMs: 5000 }), [
      [500, -55],
      [10_000, -25],
    ]);
    expect(events.map((e) => e[0])).toEqual(["speech_start", "speech_end"]);
    expect(events[1][1]).toBeLessThan(6000);
  });

  it("treats missing metering as silence", () => {
    const vad = new Vad({ noSpeechTimeoutMs: 1000 });
    let event: VadEvent = null;
    for (let t = 0; t <= 1000 && !event; t += 100) event = vad.push(undefined, t);
    expect(event).toBe("no_speech");
  });
});

describe("voice turns", () => {
  it("asks the server for audio and returns the audioUrl", async () => {
    const bodies: any[] = [];
    const res = await runUserTurn(
      [],
      "hi",
      { name: "", goals: "", routines: "", language: "en" },
      {
        callServer: async (b) => {
          bodies.push(b);
          return { kind: "reply", assistant: [], reply: { text: "Hey!", emotion: "happy", gesture: "wave", action: "none" }, audioUrl: "/audio/abc" };
        },
        runTool: async () => ({ ok: true, result: null }),
      },
      { voice: true },
    );
    expect(bodies[0].voice).toBe(true);
    expect(res.audioUrl).toBe("/audio/abc");
  });
});

describe("greeting", () => {
  it("greets by time of day and first name", () => {
    expect(greeting("Uttej Kotyada", new Date(2026, 9, 27, 8, 0), 0)).toBe("Good morning, Uttej! What's on your mind?");
    expect(greeting("", new Date(2026, 9, 27, 20, 0), 0.99)).toBe("Good evening! I'm listening whenever you're ready.");
    expect(greeting("Uttej", new Date(2026, 9, 27, 2, 0), 0)).toMatch(/^Hey, you're up late, Uttej!/);
  });
});

describe("isMeaningful", () => {
  it("keeps real answers, even short ones", () => {
    for (const t of ["Wake me up at seven", "no", "yes", "ok", "Bye Mika!", "నమస్తే"]) expect(isMeaningful(t, 900)).toBe(true);
  });
  it("drops noise, fillers and very short sounds", () => {
    for (const t of ["", "嗯哼哼哼哼哼。", "Hmm.", "mm-hmm", "uh um", "you", "..."]) expect(isMeaningful(t, 900)).toBe(false);
    expect(isMeaningful("Wake me up at seven", 200)).toBe(false);
  });
});
