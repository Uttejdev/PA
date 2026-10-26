import { getJson, setJson } from "../lib/db";
import type { ApiMessage } from "./conversation";

// What the chat screen shows (separate from the raw API history, which also
// holds thinking blocks and tool calls the user doesn't need to see).
export type ChatLine = { id: string; from: "user" | "companion" | "status"; text: string };

export type SavedConversation = { history: ApiMessage[]; lines: ChatLine[] };

// Past this many API messages, start a fresh conversation rather than trimming
// old turns (editing history would invalidate Claude's earlier reasoning).
// Long-term memory comes in phase 3 via the profile.
export const MAX_HISTORY_MESSAGES = 200;

const KEY = "conversation";
const EMPTY: SavedConversation = { history: [], lines: [] };

export const loadConversation = () => getJson<SavedConversation>(KEY, EMPTY);
export const saveConversation = (c: SavedConversation) => setJson(KEY, c);
export const clearConversation = () => setJson(KEY, EMPTY);
