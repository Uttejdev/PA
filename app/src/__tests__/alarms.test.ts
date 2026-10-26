/// <reference types="jest" />
import { BURST_MINUTES, describeAlarm, dueOccurrence, MAX_ALARM_NOTIFICATIONS, nextOccurrences, planNotifications, type Alarm } from "../alarms/schedule";

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
// Mon 26 Oct 2026, 22:00 local
const NOW = at(2026, 10, 26, 22);

const alarm = (over: Partial<Alarm>): Alarm => ({
  id: 1, label: "Wake up", hour: 7, minute: 0, repeat: "none", onceAt: null, enabled: true, dismissedUntil: 0, ...over,
});

describe("nextOccurrences", () => {
  it("one-off alarms ring once, only in the future", () => {
    expect(nextOccurrences(alarm({ onceAt: at(2026, 10, 27, 7) }), NOW)).toEqual([at(2026, 10, 27, 7)]);
    expect(nextOccurrences(alarm({ onceAt: at(2026, 10, 26, 7) }), NOW)).toEqual([]);
  });

  it("weekday alarms skip the weekend", () => {
    const days = nextOccurrences(alarm({ repeat: "weekdays" }), NOW).map((t) => new Date(t).getDay());
    expect(days).toEqual([2, 3, 4, 5, 1]); // Tue..Fri, then next Mon
  });

  it("weekend alarms only ring Sat/Sun", () => {
    const days = nextOccurrences(alarm({ repeat: "weekends" }), NOW).map((t) => new Date(t).getDay());
    expect(days).toEqual([6, 0]);
  });

  it("daily alarms include later today", () => {
    const first = nextOccurrences(alarm({ repeat: "daily", hour: 23 }), NOW)[0];
    expect(first).toBe(at(2026, 10, 26, 23));
  });

  it("skips occurrences the user already stopped, and disabled alarms", () => {
    const a = alarm({ repeat: "daily", dismissedUntil: at(2026, 10, 27, 7) });
    expect(nextOccurrences(a, NOW)[0]).toBe(at(2026, 10, 28, 7));
    expect(nextOccurrences(alarm({ repeat: "daily", enabled: false }), NOW)).toEqual([]);
  });
});

describe("planNotifications", () => {
  it("schedules a burst a minute apart for each occurrence", () => {
    const plan = planNotifications([alarm({ onceAt: at(2026, 10, 27, 7) })], NOW);
    expect(plan).toHaveLength(BURST_MINUTES);
    expect(plan.map((p) => (p.fireAt - at(2026, 10, 27, 7)) / 60_000)).toEqual([0, 1, 2, 3]);
  });

  it("stays under iOS's pending-notification limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => alarm({ id: i, repeat: "daily", minute: i * 5 }));
    const plan = planNotifications(many, NOW);
    expect(plan.length).toBe(MAX_ALARM_NOTIFICATIONS);
    expect(plan.every((p, i) => i === 0 || p.fireAt >= plan[i - 1].fireAt)).toBe(true);
  });
});

describe("dueOccurrence", () => {
  const a = alarm({ repeat: "daily" });
  it("finds an alarm that is ringing now", () => {
    expect(dueOccurrence([a], at(2026, 10, 27, 7, 2))?.occurrence).toBe(at(2026, 10, 27, 7));
  });
  it("ignores it once the ringing window has passed or it was stopped", () => {
    expect(dueOccurrence([a], at(2026, 10, 27, 7, 30))).toBeNull();
    expect(dueOccurrence([{ ...a, dismissedUntil: at(2026, 10, 27, 7) }], at(2026, 10, 27, 7, 1))).toBeNull();
  });
});

it("describes alarms for people", () => {
  expect(describeAlarm(alarm({ repeat: "weekdays", hour: 6, minute: 30 }))).toBe("6:30 AM, weekdays");
  expect(describeAlarm(alarm({ repeat: "daily", hour: 0 }))).toBe("12:00 AM, every day");
  expect(describeAlarm(alarm({ onceAt: at(2026, 10, 27, 7), hour: 7 }))).toBe("7:00 AM, Tue 27/10");
});
