import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// The app maps `emotion` to a VRM expression and `gesture` to an animation.
// Keep these lists in sync with app/src/character/mapping.ts.
export const EMOTIONS = ["happy", "worried", "thinking", "excited", "calm", "sad", "surprised"] as const;
export const GESTURES = ["nod", "wave", "tilt_head", "cheer", "think", "none"] as const;

export const CharacterReply = z.object({
  text: z.string(),
  emotion: z.enum(EMOTIONS),
  gesture: z.enum(GESTURES),
});
export type CharacterReply = z.infer<typeof CharacterReply>;

// JSON schema sent as output_config.format, so every final reply is
// guaranteed to be {text, emotion, gesture}.
export const replyFormat: Anthropic.Beta.Messages.BetaJSONOutputFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "What the character says to the user. Plain text, no markdown." },
      emotion: { type: "string", enum: [...EMOTIONS] },
      gesture: { type: "string", enum: [...GESTURES] },
    },
    required: ["text", "emotion", "gesture"],
    additionalProperties: false,
  },
};

export const TOOL_NAMES = [
  "calendar_list_events",
  "calendar_create_event",
  "reminder_create",
  "reminder_list",
  "note_create",
  "note_search",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const isoDateTime = (what: string) => ({
  type: "string",
  description: `${what}, ISO 8601 with the user's UTC offset, e.g. 2026-10-27T09:00:00-07:00`,
});

// These tools run on the phone, not here: the server returns tool_use blocks
// to the app, the app executes them and sends the results back.
// `strict: true` guarantees the inputs match these schemas exactly.
export const tools: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: "calendar_list_events",
    description:
      "List events from the user's phone calendar between two times. Use this before planning a day, " +
      "answering 'what's on my schedule', or suggesting a time for something new.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        start: isoDateTime("Start of the range"),
        end: isoDateTime("End of the range"),
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
  },
  {
    name: "calendar_create_event",
    description:
      "Create an event in the user's default phone calendar. Only create events the user asked for or " +
      "clearly agreed to. Check for clashes with calendar_list_events first when the time is flexible.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short event title" },
        start: isoDateTime("Event start"),
        end: isoDateTime("Event end"),
        notes: { type: "string", description: "Extra details for the event, or an empty string" },
      },
      required: ["title", "start", "end", "notes"],
      additionalProperties: false,
    },
  },
  {
    name: "reminder_create",
    description:
      "Schedule a reminder that pops up as a notification on the user's phone at the given time. " +
      "The time must be in the future.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to remind the user about, written to them" },
        when: isoDateTime("When the notification should fire"),
      },
      required: ["text", "when"],
      additionalProperties: false,
    },
  },
  {
    name: "reminder_list",
    description: "List the user's upcoming reminders that haven't fired yet.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "note_create",
    description:
      "Save a note on the user's phone. Use for ideas, lists, things to remember, or summaries the user wants to keep.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "Lowercase single-word tags, may be empty" },
      },
      required: ["title", "body", "tags"],
      additionalProperties: false,
    },
  },
  {
    name: "note_search",
    description:
      "Search the user's saved notes by keyword (matches title, body and tags). " +
      "Use an empty query to list the most recent notes.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

// ---- HTTP contract between the app and this server ----

export const Profile = z.object({
  name: z.string().max(100).default(""),
  goals: z.string().max(4000).default(""),
  routines: z.string().max(4000).default(""),
});
export type Profile = z.infer<typeof Profile>;

// Messages are the app's full history in Anthropic's MessageParam shape.
// The app stores assistant content exactly as this server returned it, so
// thinking blocks are passed back unchanged (the API requires that).
export const ChatRequest = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([z.string(), z.array(z.looseObject({ type: z.string() }))]),
      }),
    )
    .min(1)
    .max(400),
  profile: Profile.default({ name: "", goals: "", routines: "" }),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export type ToolCall = { id: string; name: string; input: unknown };

export type ChatResponse =
  // Claude wants the app to run tools, then call /chat again with the results.
  | { kind: "tool_use"; assistant: Anthropic.Beta.Messages.BetaContentBlock[]; toolCalls: ToolCall[] }
  // Final answer for this user turn.
  | { kind: "reply"; assistant: Anthropic.Beta.Messages.BetaContentBlock[]; reply: CharacterReply }
  // The request was declined; the app should drop this turn from history.
  | { kind: "refusal"; reply: CharacterReply };
