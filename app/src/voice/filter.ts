// Decides whether a transcription is worth sending to Claude. Background
// noise and "mm-hmm"s come back as filler (sometimes in a random language),
// and answering those wastes money and confuses the conversation.

const FILLERS = new Set([
  "hm", "hmm", "hmmm", "mm", "mmm", "mhm", "mm-hmm", "mmhmm", "uh", "uhh", "um", "umm", "ah", "ahh", "oh", "eh", "er",
  // "you"/"the" alone are what speech recognition tends to invent from silence.
  "huh", "uh-huh", "you", "the", "嗯", "啊", "哦",
]);

export function isMeaningful(text: string, speechMs: number): boolean {
  if (speechMs < 400) return false; // a tap, cough or door, not a sentence
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  // Repeated syllables like "嗯哼哼哼哼哼" or "hmm hmm hmm".
  const letters = words.join("");
  if (letters.length > 3 && new Set(letters).size <= 2) return false;
  if (words.every((w) => FILLERS.has(w))) return false;
  return true;
}
