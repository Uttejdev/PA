import * as Notifications from "expo-notifications";
import { getDb } from "../lib/db";
import { parseIso, toLocalIso } from "../lib/time";

export async function createReminder(input: { text: string; when: string }) {
  const when = parseIso(input.when, "when");
  if (when.getTime() <= Date.now()) throw new Error("That time is in the past; reminders need a future time.");

  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error("Notification permission was denied. The user can allow it in iPhone Settings.");

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: { title: "Reminder from Mika", body: input.text },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
  const db = await getDb();
  const res = await db.runAsync(
    "INSERT INTO reminders (text, when_at, notification_id, created_at) VALUES (?, ?, ?, ?)",
    input.text,
    when.getTime(),
    notificationId,
    Date.now(),
  );
  return { created: true, id: res.lastInsertRowId, text: input.text, when: toLocalIso(when) };
}

export async function listReminders() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; text: string; when_at: number }>(
    "SELECT id, text, when_at FROM reminders WHERE when_at > ? ORDER BY when_at ASC LIMIT 50",
    Date.now(),
  );
  return { reminders: rows.map((r) => ({ id: r.id, text: r.text, when: toLocalIso(new Date(r.when_at)) })) };
}
