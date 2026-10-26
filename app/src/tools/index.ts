import { cancelAlarm, listAlarms, setAlarm } from "./alarms";
import { createEvent, listEvents } from "./calendar";
import { createNote, searchNotes } from "./notes";
import { createReminder, listReminders } from "./reminders";

// Tool schemas live on the server (server/src/schema.ts) with strict: true,
// so inputs arrive in exactly these shapes.
type Handlers = {
  calendar_list_events: (i: { start: string; end: string }) => Promise<unknown>;
  calendar_create_event: (i: { title: string; start: string; end: string; notes: string }) => Promise<unknown>;
  reminder_create: (i: { text: string; when: string }) => Promise<unknown>;
  reminder_list: (i: Record<string, never>) => Promise<unknown>;
  note_create: (i: { title: string; body: string; tags: string[] }) => Promise<unknown>;
  note_search: (i: { query: string }) => Promise<unknown>;
  alarm_set: (i: { time: string; label: string; repeat: string }) => Promise<unknown>;
  alarm_list: (i: Record<string, never>) => Promise<unknown>;
  alarm_cancel: (i: { id: number }) => Promise<unknown>;
};

const handlers: Handlers = {
  calendar_list_events: listEvents,
  calendar_create_event: createEvent,
  reminder_create: createReminder,
  reminder_list: listReminders,
  note_create: createNote,
  note_search: searchNotes,
  alarm_set: setAlarm,
  alarm_list: listAlarms,
  alarm_cancel: cancelAlarm,
};

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

export async function runTool(name: string, input: unknown): Promise<ToolOutcome> {
  const handler = handlers[name as keyof Handlers] as ((i: unknown) => Promise<unknown>) | undefined;
  if (!handler) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return { ok: true, result: await handler(input ?? {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Short status text shown in the chat while a tool runs.
export const TOOL_LABELS: Record<string, string> = {
  calendar_list_events: "Checking your calendar",
  calendar_create_event: "Adding to your calendar",
  reminder_create: "Setting a reminder",
  reminder_list: "Looking at your reminders",
  note_create: "Saving a note",
  note_search: "Searching your notes",
  alarm_set: "Setting an alarm",
  alarm_list: "Checking your alarms",
  alarm_cancel: "Cancelling an alarm",
};
