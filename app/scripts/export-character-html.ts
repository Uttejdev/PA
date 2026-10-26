/// <reference types="node" />
// Writes the character page to a file so you can open it in a desktop browser
// (add #debug to the URL for emotion/gesture test buttons).
// Usage (from the app folder): npx tsx scripts/export-character-html.ts [out.html]
import { writeFileSync } from "node:fs";
import { buildCharacterHtml } from "../src/character/characterHtml";

const out = process.argv[2] ?? "character-preview.html";
writeFileSync(out, buildCharacterHtml());
console.log(`Wrote ${out}`);
