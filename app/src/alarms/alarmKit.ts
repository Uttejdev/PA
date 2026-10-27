import Constants from "expo-constants";
import { Platform } from "react-native";
import { nextOccurrences, type Alarm, type Repeat } from "./schedule";

// Apple's AlarmKit (iOS 26+): real system alarms that ring on the lock
// screen through silent mode and Focus, even when the app is closed. Only
// available in Mika's own build (not Expo Go), so it's loaded defensively
// and everything falls back to notifications without it.

type Kit = typeof import("react-native-nitro-ios-alarm-kit");
let kit: Kit | null = null;
if (Platform.OS === "ios" && Constants.executionEnvironment !== "storeClient") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    kit = require("react-native-nitro-ios-alarm-kit") as Kit;
  } catch {
    kit = null; // native module missing from this build
  }
}

export function alarmKitAvailable(): boolean {
  try {
    return !!kit && kit.isAvailable();
  } catch {
    return false;
  }
}

export const SNOOZE_SECONDS = 9 * 60;
const TINT = "#7C5CD6";
// The alarm title also shows in the Dynamic Island, so keep it short.
const MAX_TITLE = 15;

type Weekday = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
const WEEKDAYS: Record<Exclude<Repeat, "none">, Weekday[]> = {
  daily: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
  weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  weekends: ["saturday", "sunday"],
};

export type KitAlarm =
  | { kind: "fixed"; alarmId: number; title: string; timestamp: number }
  | { kind: "repeating"; alarmId: number; title: string; hour: number; minute: number; days: Weekday[] };

export const shortTitle = (label: string) => {
  const t = label.trim() || "Alarm";
  return t.length <= MAX_TITLE ? t : `${t.slice(0, MAX_TITLE - 1).trimEnd()}…`;
};

/** What to hand to AlarmKit for the current alarms (pure, so it can be tested). */
export function planKitAlarms(alarms: Alarm[], now: number): KitAlarm[] {
  return alarms.flatMap((a): KitAlarm[] => {
    if (!a.enabled) return [];
    const title = shortTitle(a.label);
    if (a.repeat === "none") {
      const at = nextOccurrences(a, now)[0];
      return at ? [{ kind: "fixed", alarmId: a.id, title, timestamp: Math.floor(at / 1000) }] : [];
    }
    return [{ kind: "repeating", alarmId: a.id, title, hour: a.hour, minute: a.minute, days: WEEKDAYS[a.repeat] }];
  });
}

/**
 * Replaces every AlarmKit alarm this app owns with the current list.
 * Returns false when AlarmKit can't be used (Expo Go, older iOS, or the
 * user said no), so the caller falls back to notifications.
 */
export async function syncAlarmKit(alarms: Alarm[], now = Date.now()): Promise<boolean> {
  if (!kit || !alarmKitAvailable()) return false;
  if (!(await kit.requestAlarmPermission())) return false;
  await kit.stopAllAlarms();
  const stop = { text: "Stop", textColor: "#FFFFFF", icon: "checkmark.circle.fill" };
  const snooze = { text: "Snooze", textColor: "#FFFFFF", icon: "moon.zzz.fill" };
  const countdown = { postAlert: SNOOZE_SECONDS };
  for (const a of planKitAlarms(alarms, now)) {
    const id =
      a.kind === "fixed"
        ? await kit.scheduleFixedAlarm(a.title, stop, TINT, snooze, a.timestamp, countdown)
        : await kit.scheduleRelativeAlarm(a.title, stop, TINT, a.hour, a.minute, a.days, snooze, countdown);
    if (!id) console.warn(`[alarms] AlarmKit didn't schedule alarm ${a.alarmId}`);
  }
  return true;
}
