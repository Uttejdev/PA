import { getDb } from "../lib/db";
import { toLocalIso } from "../lib/time";

type NoteRow = { id: number; title: string; body: string; tags: string; created_at: number };

// Tags are stored space-separated with surrounding spaces (" gym run ") so
// LIKE '% tag %' style matching stays simple.
const encodeTags = (tags: string[]) => {
  const clean = tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean);
  return clean.length ? ` ${clean.join(" ")} ` : "";
};

const toNote = (r: NoteRow) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  tags: r.tags.trim() ? r.tags.trim().split(" ") : [],
  created: toLocalIso(new Date(r.created_at)),
});

export async function createNote(input: { title: string; body: string; tags: string[] }) {
  const db = await getDb();
  const res = await db.runAsync(
    "INSERT INTO notes (title, body, tags, created_at) VALUES (?, ?, ?, ?)",
    input.title,
    input.body,
    encodeTags(input.tags),
    Date.now(),
  );
  return { created: true, id: res.lastInsertRowId, title: input.title };
}

export async function searchNotes(input: { query: string }) {
  const db = await getDb();
  const words = input.query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) {
    const rows = await db.getAllAsync<NoteRow>("SELECT * FROM notes ORDER BY created_at DESC LIMIT 10");
    return { notes: rows.map(toNote) };
  }
  // Every word must appear somewhere in the title, body or tags.
  const where = words.map(() => "(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')").join(" AND ");
  const params = words.flatMap((w) => {
    const like = `%${w.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    return [like, like, like];
  });
  const rows = await db.getAllAsync<NoteRow>(
    `SELECT * FROM notes WHERE ${where} ORDER BY created_at DESC LIMIT 20`,
    params,
  );
  return { notes: rows.map(toNote) };
}
