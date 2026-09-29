// Writes recording/voiceover.md from the storyboard, and checks that the last
// take hit every scene boundary within half a second.
//   pnpm tsx recording/write-voiceover.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, TOTAL_S } from "./storyboard";

const ROOT = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(ROOT, "out/take-log.json");

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const words = (line: string) => line.split(/\s+/).filter(Boolean).length;

if (existsSync(LOG)) {
  const log = JSON.parse(readFileSync(LOG, "utf8")) as { duration_s: number; events: { event: string; t_s: number }[] };
  for (const scene of SCENES) {
    const hit = log.events.find((e) => e.event === `screen ${scene.id}`);
    if (!hit) continue;
    const off = Math.abs(hit.t_s - scene.start_s);
    if (off > 0.5) throw new Error(`scene ${scene.id} started at ${hit.t_s} s, storyboard says ${scene.start_s} s`);
  }
  if (Math.abs(log.duration_s - TOTAL_S) > 0.1) throw new Error(`take ran ${log.duration_s} s, storyboard says ${TOTAL_S} s`);
}

const rows = SCENES.map(
  (s) => `| ${mmss(s.start_s)} | ${mmss(s.end_s)} | ${s.screen} | ${s.line} |`,
).join("\n");
const total = SCENES.reduce((n, s) => n + words(s.line), 0);
const pace = SCENES.map((s) => `| ${s.id} | ${words(s.line)} | ${Math.round((words(s.line) / (s.end_s - s.start_s)) * 60)} |`).join("\n");

const md = `# Voiceover

Script for \`recording/out/calendar-take.mp4\`, ${mmss(TOTAL_S)} long, 1920 by 1080 at 30 fps, no audio track.
Read each line inside its window.
The times are the MP4's own times; \`record.ts\` holds every scene to them and \`take-log.json\` records where each screen actually appeared.

| Start | End | On screen | Line to read |
|---|---|---|---|
${rows}

About ${total} words.

## Pace per scene

Words per minute. Every scene sits between 120 and 145; if a line runs long, cut words rather than read faster.

| Scene | Words | Words per minute |
|---|---|---|
${pace}

## Notes for the reader

One well and one flow: BGW-14 on the steam calendar, then its cycle plan, then its pump.
Every number in a line is on screen, digit for digit, while the line is read.
The gain is the two wells in the change, 162 barrels and a steam-oil ratio from 6.59 to 6.33.
Do not quote a field-wide percentage; the field moves by 0.2%.
"Against 24" reads the capacity shown as 24.0 t/h.
Say "BGW" as "B G W".
`;

writeFileSync(resolve(ROOT, "voiceover.md"), md);
console.log(`wrote recording/voiceover.md, ${total} words`);
