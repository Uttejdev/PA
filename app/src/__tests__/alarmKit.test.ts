/// <reference types="jest" />
import { alarmKitAvailable, planKitAlarms, shortTitle } from "../alarms/alarmKit";
import type { Alarm } from "../alarms/schedule";

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 26, 22);
const alarm = (over: Partial<Alarm>): Alarm => ({
  id: 1, label: "Wake up", hour: 7, minute: 0, repeat: "none", onceAt: null, enabled: true, dismissedUntil: 0, ...over,
});

describe("planKitAlarms", () => {
  it("turns one-off alarms into fixed AlarmKit alarms (unix seconds)", () => {
    expect(planKitAlarms([alarm({ onceAt: at(2026, 10, 27, 7) })], NOW)).toEqual([
      { kind: "fixed", alarmId: 1, title: "Wake up", timestamp: at(2026, 10, 27, 7) / 1000 },
    ]);
  });

  it("turns repeating alarms into weekly AlarmKit alarms", () => {
    const [weekdays, weekends] = planKitAlarms(
      [alarm({ id: 2, repeat: "weekdays", hour: 6, minute: 30 }), alarm({ id: 3, repeat: "weekends" })],
      NOW,
    );
    expect(weekdays).toEqual({ kind: "repeating", alarmId: 2, title: "Wake up", hour: 6, minute: 30, days: ["monday", "tuesday", "wednesday", "thursday", "friday"] });
    expect(weekends).toMatchObject({ days: ["saturday", "sunday"] });
  });

  it("skips switched-off and already-passed alarms", () => {
    expect(planKitAlarms([alarm({ enabled: false, repeat: "daily" }), alarm({ onceAt: at(2026, 10, 25, 7) })], NOW)).toEqual([]);
  });
});

it("keeps titles short enough for the Dynamic Island", () => {
  expect(shortTitle("Leave for the airport now")).toBe("Leave for the…");
  expect(shortTitle("  ")).toBe("Alarm");
});

it("is unavailable outside Mika's own build", () => {
  expect(alarmKitAvailable()).toBe(false);
});
