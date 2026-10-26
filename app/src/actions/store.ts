import { getDb } from "../lib/db";
import { BUILTIN_ACTIONS, normalizeName, sanitizeAction, type CharacterAction } from "./library";

// Learned actions are forgotten if they go unused this long. Built-ins stay.
export const FORGET_AFTER_DAYS = 60;

type Row = { name: string; category: string; description: string; data: string | null; uses: number; last_used: number; created_at: number };

let ready: Promise<void> | null = null;
function ensureTable() {
  ready ??= getDb().then((db) =>
    db.execAsync(`
      CREATE TABLE IF NOT EXISTS character_actions (
        name TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        data TEXT,               -- the learned action as JSON; NULL rows only track a built-in's usage
        uses INTEGER NOT NULL DEFAULT 0,
        last_used INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS character_actions_category ON character_actions (category);
    `),
  );
  return ready;
}

/** Built-ins plus everything Mika has learned, most used first. */
export async function loadActions(): Promise<(CharacterAction & { uses: number })[]> {
  await ensureTable();
  const db = await getDb();
  const rows = await db.getAllAsync<Row>("SELECT * FROM character_actions");
  const usage = new Map(rows.map((r) => [r.name, r.uses]));
  const learned = rows.flatMap((r) => {
    if (!r.data) return [];
    try {
      return [{ ...sanitizeAction(JSON.parse(r.data)), uses: r.uses }];
    } catch {
      return [];
    }
  });
  const builtins = BUILTIN_ACTIONS.map((a) => ({ ...a, uses: usage.get(a.name) ?? 0 }));
  return [...builtins, ...learned].sort((a, b) => b.uses - a.uses);
}

export async function findAction(name: string): Promise<CharacterAction | null> {
  const key = normalizeName(name);
  return (await loadActions()).find((a) => a.name === key) ?? null;
}

/** Saves a new action Mika designed (or replaces her own earlier version). */
export async function learnAction(input: CharacterAction): Promise<CharacterAction> {
  await ensureTable();
  const action = sanitizeAction({ ...input, builtin: false });
  if (!action.name) throw new Error("The action needs a name.");
  if (action.pose.length === 0 && action.sway.length === 0) throw new Error("The action needs at least one pose or sway value.");
  if (BUILTIN_ACTIONS.some((b) => b.name === action.name)) {
    throw new Error(`"${action.name}" is already a built-in action; use it directly or pick another name.`);
  }
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO character_actions (name, category, description, data, uses, last_used, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(name) DO UPDATE SET category = excluded.category, description = excluded.description, data = excluded.data`,
    action.name,
    action.category,
    action.description,
    JSON.stringify(action),
    Date.now(),
    Date.now(),
  );
  return action;
}

export async function markActionUsed(name: string) {
  await ensureTable();
  const action = await findAction(name);
  if (!action) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO character_actions (name, category, description, data, uses, last_used, created_at)
     VALUES (?, ?, ?, NULL, 1, ?, ?)
     ON CONFLICT(name) DO UPDATE SET uses = uses + 1, last_used = excluded.last_used`,
    action.name,
    action.category,
    action.description,
    Date.now(),
    Date.now(),
  );
}

/** Forget learned actions nobody has used for a while. Returns how many. */
export async function pruneActions(now = Date.now()): Promise<number> {
  await ensureTable();
  const db = await getDb();
  const cutoff = now - FORGET_AFTER_DAYS * 86_400_000;
  const res = await db.runAsync("DELETE FROM character_actions WHERE data IS NOT NULL AND MAX(last_used, created_at) < ?", cutoff);
  return res.changes;
}
