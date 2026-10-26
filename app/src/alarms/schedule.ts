// Pure alarm-time logic, kept free of native modules so it can be tested.

export type Repeat = "none" | "daily" | "weekdays" | "weekends";
export const REPEATS: readonly Repeat[] = ["none", "daily", "weekdays", "weekends"];

export type Alarm = {
  id: number;
  label: string;
  hour: number; // local time
  minute: number;
  repeat: Repeat;
  // One-off alarms ring once at this exact time (epoch ms).
  onceAt: number | null;
  enabled: boolean;
  // Occurrences at or before this time were stopped by the user.
  dismissedUntil: number;
};

// How a ringing alarm keeps nagging when the app isn't open: one
// notification a minute for a few minutes (iOS can't loop an alarm sound).
export const BURST_MINUTES = 4;
// iOS keeps at most 64 pending notifications per app; leave room for reminders.
export const MAX_ALARM_NOTIFICATIONS = 48;
const LOOKAHEAD_DAYS = 7;

const isActiveDay = (repeat: Repeat, day: number) =>
  repeat === "daily" || (repeat === "weekdays" && day >= 1 && day <= 5) || (repeat === "weekends" && (day === 0 || day === 6));

/** Upcoming ring times (epoch ms) for one alarm, soonest first. */
export function nextOccurrences(alarm: Alarm, now: number, days = LOOKAHEAD_DAYS): number[] {
  if (!alarm.enabled) return [];
  const floor = Math.max(now, alarm.dismissedUntil + 1);
  if (alarm.repeat === "none") return alarm.onceAt !== null && alarm.onceAt >= floor ? [alarm.onceAt] : [];
  const out: number[] = [];
  const start = new Date(now);
  for (let d = 0; d <= days; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, alarm.hour, alarm.minute, 0, 0);
    if (isActiveDay(alarm.repeat, day.getDay()) && day.getTime() >= floor) out.push(day.getTime());
  }
  return out;
}

export type PlannedNotification = { alarmId: number; occurrence: number; fireAt: number; burst: number };

/** Every alarm notification to schedule right now, soonest first, within iOS's limit. */
export function planNotifications(alarms: Alarm[], now: number): PlannedNotification[] {
  const all: PlannedNotification[] = [];
  for (const alarm of alarms) {
    for (const occurrence of nextOccurrences(alarm, now)) {
      for (let burst = 0; burst < BURST_MINUTES; burst++) {
        const fireAt = occurrence + burst * 60_000;
        if (fireAt > now) all.push({ alarmId: alarm.id, occurrence, fireAt, burst });
      }
    }
  }
  return all.sort((a, b) => a.fireAt - b.fireAt).slice(0, MAX_ALARM_NOTIFICATIONS);
}

/** The alarm occurrence that should be ringing right now, if any. */
export function dueOccurrence(alarms: Alarm[], now: number, windowMs = BURST_MINUTES * 60_000): { alarm: Alarm; occurrence: number } | null {
  for (const alarm of alarms) {
    // Look back over the ringing window by asking for occurrences from then.
    for (const occurrence of nextOccurrences(alarm, now - windowMs, 1)) {
      if (occurrence <= now && occurrence > now - windowMs) return { alarm, occurrence };
    }
  }
  return null;
}

/** "7:30 AM, weekdays" style description for Mika and the alarms screen. */
export function describeAlarm(alarm: Alarm): string {
  const h = alarm.hour % 12 === 0 ? 12 : alarm.hour % 12;
  const time = `${h}:${String(alarm.minute).padStart(2, "0")} ${alarm.hour < 12 ? "AM" : "PM"}`;
  if (alarm.repeat !== "none") return `${time}, ${alarm.repeat === "daily" ? "every day" : alarm.repeat}`;
  if (alarm.onceAt === null) return time;
  const d = new Date(alarm.onceAt);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${time}, ${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
