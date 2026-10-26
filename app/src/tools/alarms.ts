import { createAlarm, deleteAlarm, describeAlarm, loadAlarms } from "../alarms/store";
import { nextOccurrences, REPEATS, type Repeat } from "../alarms/schedule";
import { parseIso, toLocalIso } from "../lib/time";

const summary = (a: Awaited<ReturnType<typeof loadAlarms>>[number]) => {
  const next = nextOccurrences(a, Date.now())[0];
  return { id: a.id, label: a.label, when: describeAlarm(a), enabled: a.enabled, nextRing: next ? toLocalIso(new Date(next)) : null };
};

export async function setAlarm(input: { time: string; label: string; repeat: string }) {
  const when = parseIso(input.time, "time");
  const repeat = (REPEATS as readonly string[]).includes(input.repeat) ? (input.repeat as Repeat) : "none";
  if (repeat === "none" && when.getTime() <= Date.now()) throw new Error("That time has already passed; one-off alarms need a future time.");
  const alarm = await createAlarm({ label: input.label.trim() || "Alarm", when, repeat });
  return { created: true, ...summary(alarm) };
}

export async function listAlarms() {
  return { alarms: (await loadAlarms()).map(summary) };
}

export async function cancelAlarm(input: { id: number }) {
  const removed = await deleteAlarm(input.id);
  if (!removed) throw new Error(`No alarm with id ${input.id}. Use alarm_list to see the alarms.`);
  return { cancelled: true, id: input.id };
}
