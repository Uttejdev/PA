import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// The app maps `emotion` to a Live2D face pose and `gesture` to a movement.
// Keep these lists in sync with app/src/character/mapping.ts.
export const EMOTIONS = ["happy", "worried", "thinking", "excited", "calm", "sad", "surprised"] as const;
export const GESTURES = ["nod", "wave", "tilt_head", "cheer", "think", "none"] as const;

// Visual-action controls and effects. Keep in sync with app/src/actions/library.ts.
export const POSE_PARAMS = [
  "AngleX", "AngleY", "AngleZ", "BodyAngleX", "BodyAngleY", "BodyAngleZ", "BodyMoveX", "BodyMoveY", "BodyRotate",
  "EyeLOpen", "EyeROpen", "EyeLSmile", "EyeRSmile", "EyeLForm", "EyeRForm", "EyeBallX", "EyeBallY", "PupilSmall", "EyeSparkle",
  "BrowLY", "BrowRY", "BrowLAngle", "BrowRAngle", "BrowLForm", "BrowRForm",
  "MouthForm", "MouthOpen", "MouthI", "MouthU", "MouthE", "MouthO", "MouthPout", "Cheek",
  "ShoulderL", "ShoulderR", "ArmLUp", "ArmLShoulder", "ArmLElbow", "ArmLWrist", "HandL",
  "ArmRUp", "ArmRShoulder", "ArmRElbow", "ArmRWrist", "HandR", "WandSpin",
] as const;
export const EFFECTS = ["none", "zzz", "hearts", "sparkles", "sweat", "music", "question", "exclamation"] as const;
export const PERFORMANCES = ["none", "magic_heart", "magic_heart_big", "magic_trick", "twirl"] as const;
export const ACTION_CATEGORIES = ["rest", "affection", "fun", "reaction", "greeting", "focus", "magic", "other"] as const;

export const CharacterReply = z.object({
  text: z.string(),
  emotion: z.enum(EMOTIONS),
  gesture: z.enum(GESTURES),
  action: z.string().default("none"),
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
      action: {
        type: "string",
        description: "Name of an action from your action library to perform now (held until you change it), or 'none' for your normal self.",
      },
    },
    required: ["text", "emotion", "gesture", "action"],
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
  "alarm_set",
  "alarm_list",
  "alarm_cancel",
  "character_action_learn",
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
  {
    name: "alarm_set",
    description:
      "Set an alarm in this app. Mika rings it loudly and wakes the user up by voice, with stop and snooze. Use this " +
      "(not reminder_create) for alarms, wake-ups, and anything the user wants to ring. For a repeating alarm, `time` " +
      "is the first ring and only its time of day is used.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        time: isoDateTime("When the alarm rings"),
        label: { type: "string", description: "Short label, e.g. 'Wake up' or 'Leave for the airport'" },
        repeat: { type: "string", enum: ["none", "daily", "weekdays", "weekends"] },
      },
      required: ["time", "label", "repeat"],
      additionalProperties: false,
    },
  },
  {
    name: "character_action_learn",
    description:
      "Design a new visual action for yourself and save it to your action library, when the user asks you to do " +
      "something physical that isn't in the library yet (e.g. stretch, yawn, sulk, peek). It's saved by category " +
      "and you can reuse it by name from then on. L/R mean your own left/right. Your controls:\n" +
      "- Head: AngleX turn (-30..30, + = to your left), AngleY nod (+ up, - down), AngleZ tilt. Body: BodyAngleX/Y/Z " +
      "(-10..10), BodyMoveX/BodyMoveY shift your whole body (-10..10; BodyMoveY + = hop up, - = crouch), BodyRotate lean.\n" +
      "- Eyes, each side separately: EyeLOpen/EyeROpen eyelids 0 closed..1 open..1.2 wide; EyeLSmile/EyeRSmile 0..1 happy " +
      "squint; EyeLForm/EyeRForm 0..1 sharper eyes; EyeBallX/EyeBallY -1..1 where you look (Y - = down); PupilSmall 0..1 " +
      "(shock); EyeSparkle 0..1.\n" +
      "- Brows, each side: BrowLY/BrowRY height -1..1; BrowLAngle/BrowRAngle -1..1; BrowLForm/BrowRForm -1 worried..1 cheerful.\n" +
      "- Mouth: MouthForm -1 frown..1 smile; MouthOpen 0..1; vowel shapes MouthI/MouthU/MouthE/MouthO 0..1; MouthPout 0..1; " +
      "Cheek 0..1 blush.\n" +
      "- Shoulders: ShoulderL/ShoulderR -1..1 (+ = shrug up).\n" +
      "- Arms (L and R the same way): ArmLUp 0 = relaxed at your side, 1 = raised. Raised, your hand is beside or above " +
      "your head: ArmLShoulder -1 = arm out to the side, +1 = hand over your forehead (salute); ArmLElbow -1 = hand by " +
      "your cheek, +1 = hand high above your head; ArmLWrist -1..1 turns the wrist; HandL -1..1 hand shape. Your right " +
      "arm holds your wand (raised = wand up); WandSpin 0..1. Your hands can't go in front of your face or chest.\n" +
      "- performance: an animated magic trick your artist drew (magic_heart, magic_heart_big, magic_trick, twirl), or none.\n" +
      "Sway adds a repeating motion to any control. After saving, perform it by putting its name in your reply's action field.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "snake_case, e.g. big_yawn" },
        category: { type: "string", enum: [...ACTION_CATEGORIES] },
        description: { type: "string", description: "One short sentence describing how it looks" },
        pose: {
          type: "array",
          items: {
            type: "object",
            properties: { param: { type: "string", enum: [...POSE_PARAMS] }, value: { type: "number" } },
            required: ["param", "value"],
            additionalProperties: false,
          },
        },
        sway: {
          type: "array",
          items: {
            type: "object",
            properties: {
              param: { type: "string", enum: [...POSE_PARAMS] },
              amplitude: { type: "number" },
              period_seconds: { type: "number" },
            },
            required: ["param", "amplitude", "period_seconds"],
            additionalProperties: false,
          },
        },
        effect: { type: "string", enum: [...EFFECTS] },
        performance: { type: "string", enum: [...PERFORMANCES] },
        duration_seconds: { type: "number", description: "How long to hold it; 0 = until you change it" },
      },
      required: ["name", "category", "description", "pose", "sway", "effect", "performance", "duration_seconds"],
      additionalProperties: false,
    },
  },
  {
    name: "alarm_list",
    description: "List the user's alarms with their ids, times, repeat pattern and next ring time.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "alarm_cancel",
    description: "Delete an alarm by id. Call alarm_list first if you don't know the id.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

// ---- HTTP contract between the app and this server ----

export const Profile = z.object({
  name: z.string().max(100).default(""),
  goals: z.string().max(4000).default(""),
  routines: z.string().max(4000).default(""),
  // ISO-639-1 code of the language the user speaks to Mika.
  language: z.string().max(10).default("en"),
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
  profile: Profile.default({ name: "", goals: "", routines: "", language: "en" }),
  // When true, final replies also come back with an audioUrl to play.
  voice: z.boolean().default(false),
  // Mika's action library (built-in + learned), so she knows what she can do.
  actions: z
    .array(z.object({ name: z.string().max(60), category: z.string().max(40), description: z.string().max(300) }))
    .max(300)
    .default([]),
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
