import * as Notifications from "expo-notifications";
import { getDb } from "../lib/db";
import { syncAlarmKit } from "./alarmKit";
import { describeAlarm, planNotifications, REPEATS, type Alarm, type Repeat } from "./schedule";

type Row = {
  id: number;
  label: string;
  hour: number;
  minute: number;
  repeat: string;
  once_at: number | null;
  enabled: number;
  dismissed_until: number;
};

const toAlarm = (r: Row): Alarm => ({
  id: r.id,
  label: r.label,
  hour: r.hour,
  minute: r.minute,
  repeat: (REPEATS as readonly string[]).includes(r.repeat) ? (r.repeat as Repeat) : "none",
  onceAt: r.once_at,
  enabled: r.enabled === 1,
  dismissedUntil: r.dismissed_until,
});

export const SNOOZE_MINUTES = 9;
export const ALARM_CATEGORY = "mika-alarm";
const listeners = new Set<() => void>();

/** Lets screens refresh when alarms change (from Mika or the alarms list). */
export function onAlarmsChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadAlarms(): Promise<Alarm[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM alarms ORDER BY hour, minute");
  return rows.map(toAlarm);
}

export async function createAlarm(input: { label: string; when: Date; repeat: Repeat }): Promise<Alarm> {
  const db = await getDb();
  const once = input.repeat === "none" ? input.when.getTime() : null;
  const res = await db.runAsync(
    "INSERT INTO alarms (label, hour, minute, repeat, once_at, enabled, dismissed_until, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?)",
    input.label,
    input.when.getHours(),
    input.when.getMinutes(),
    input.repeat,
    once,
    Date.now(),
  );
  await changed();
  return (await loadAlarms()).find((a) => a.id === res.lastInsertRowId)!;
}

export async function deleteAlarm(id: number): Promise<boolean> {
  const db = await getDb();
  const res = await db.runAsync("DELETE FROM alarms WHERE id = ?", id);
  await changed();
  return res.changes > 0;
}

export async function setAlarmEnabled(id: number, enabled: boolean) {
  const db = await getDb();
  // Re-enabling starts fresh, so an old dismissal doesn't hide the next ring.
  await db.runAsync("UPDATE alarms SET enabled = ?, dismissed_until = 0 WHERE id = ?", enabled ? 1 : 0, id);
  await changed();
}

/** Stop a ringing alarm: silence this occurrence; one-off alarms switch off. */
export async function dismissAlarm(alarm: Alarm, occurrence: number) {
  const db = await getDb();
  await db.runAsync(
    "UPDATE alarms SET dismissed_until = ?, enabled = CASE WHEN repeat = 'none' THEN 0 ELSE enabled END WHERE id = ?",
    occurrence,
    alarm.id,
  );
  await changed();
}

/** Stop ringing now and ring again in a few minutes. */
export async function snoozeAlarm(alarm: Alarm, occurrence: number) {
  await dismissAlarm(alarm, occurrence);
  const label = alarm.label.startsWith("Snoozed: ") ? alarm.label : `Snoozed: ${alarm.label}`;
  await createAlarm({ label, when: new Date(Date.now() + SNOOZE_MINUTES * 60_000), repeat: "none" });
}

export { describeAlarm };

async function changed() {
  await rescheduleAlarmNotifications().catch((e) => console.warn("[alarms] scheduling failed", e));
  listeners.forEach((fn) => fn());
}

let usingAlarmKit = false;
/** True when real iPhone alarms (AlarmKit) are doing the ringing, not this app. */
export const alarmKitActive = () => usingAlarmKit;

/**
 * Hands the current alarms to the phone. In Mika's own build on iOS 26 that's
 * AlarmKit (real system alarms); otherwise a rolling week of notification
 * bursts. Called on every change and when the app opens.
 */
export async function rescheduleAlarmNotifications() {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((n) => n.content.data?.kind === "alarm")
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const alarms = await loadAlarms();
  usingAlarmKit = await syncAlarmKit(alarms).catch((e) => {
    console.warn("[alarms] AlarmKit failed, using notifications", e);
    return false;
  });
  console.log(`[alarms] ${alarms.length} alarm(s), ringing via ${usingAlarmKit ? "AlarmKit (real iPhone alarms)" : "notifications"}`);
  if (usingAlarmKit) return;
  const byId = new Map(alarms.map((a) => [a.id, a]));
  for (const p of planNotifications(alarms, Date.now())) {
    const alarm = byId.get(p.alarmId)!;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: p.burst === 0 ? "⏰ Mika: time to get up!" : "⏰ Mika is still ringing",
        body: `${alarm.label}. Open the app to stop or snooze.`,
        sound: "default",
        interruptionLevel: "timeSensitive",
        categoryIdentifier: ALARM_CATEGORY,
        data: { kind: "alarm", alarmId: p.alarmId, occurrence: p.occurrence },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
    });
  }
}

/** Snooze/Stop buttons on the alarm notification itself. */
export async function registerAlarmCategory() {
  await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY, [
    // Opening the app makes sure the stop/snooze is handled (and Mika can talk).
    { identifier: "snooze", buttonTitle: `Snooze ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: true } },
    { identifier: "stop", buttonTitle: "Stop", options: { opensAppToForeground: true, isDestructive: true } },
  ]);
}
