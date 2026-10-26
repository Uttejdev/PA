// The new expo-calendar API isn't available in Expo Go yet, so use the legacy entry point.
import * as Calendar from "expo-calendar/legacy";
import { Platform } from "react-native";
import { parseIso, timeZoneName, toLocalIso } from "../lib/time";

async function ensurePermission() {
  const { granted } = await Calendar.requestCalendarPermissionsAsync();
  if (!granted) throw new Error("Calendar permission was denied. The user can allow it in iPhone Settings.");
}

export async function listEvents(input: { start: string; end: string }) {
  await ensurePermission();
  const start = parseIso(input.start, "start");
  const end = parseIso(input.end, "end");
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return { events: [] };
  const events = await Calendar.getEventsAsync(
    calendars.map((c) => c.id),
    start,
    end,
  );
  return {
    events: events
      .map((e) => ({
        title: e.title,
        start: toLocalIso(new Date(e.startDate)),
        end: toLocalIso(new Date(e.endDate)),
        allDay: e.allDay,
        location: e.location || undefined,
        notes: e.notes ? e.notes.slice(0, 300) : undefined,
      }))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 100),
  };
}

async function writableCalendarId(): Promise<string> {
  if (Platform.OS === "ios") return (await Calendar.getDefaultCalendarAsync()).id;
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const cal = calendars.find((c) => c.allowsModifications && c.isPrimary) ?? calendars.find((c) => c.allowsModifications);
  if (!cal) throw new Error("No writable calendar found on this device.");
  return cal.id;
}

export async function createEvent(input: { title: string; start: string; end: string; notes: string }) {
  await ensurePermission();
  const startDate = parseIso(input.start, "start");
  const endDate = parseIso(input.end, "end");
  if (endDate <= startDate) throw new Error("end must be after start");
  const id = await Calendar.createEventAsync(await writableCalendarId(), {
    title: input.title,
    startDate,
    endDate,
    notes: input.notes || undefined,
    timeZone: timeZoneName(),
  });
  return { created: true, id, title: input.title, start: toLocalIso(startDate), end: toLocalIso(endDate) };
}
