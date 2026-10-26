const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "-07:00" style offset for the device's local time zone at `d`. */
export function utcOffset(d: Date): string {
  const mins = -d.getTimezoneOffset();
  return `${mins >= 0 ? "+" : "-"}${pad(Math.trunc(mins / 60))}:${pad(mins % 60)}`;
}

/** Local time as ISO 8601 with offset, e.g. 2026-10-27T09:00:00-07:00. */
export function toLocalIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${utcOffset(d)}`
  );
}

export function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

/** The line prefixed to each user message so Claude knows "now". */
export function sentLine(d: Date, tz: string = timeZoneName()): string {
  const day = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return `[Sent ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}, ${tz}, UTC${utcOffset(d)}]`;
}

/** Parses an ISO 8601 string from Claude; throws a readable error if invalid. */
export function parseIso(value: unknown, field: string): Date {
  const d = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} is not a valid ISO 8601 date-time: ${String(value)}`);
  return d;
}
