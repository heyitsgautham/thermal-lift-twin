// Cuts the submission video from the two story takes, following final-edit.ts.
//
//   pnpm video:story && pnpm video:story-3d     the two takes, against a production build
//   pnpm video:final                            writes recording/out/thermal-lift-twin.mp4
//
// Also writes recording/story-voiceover.md, the reader's script on the final clock.
// Put the recorded lines in recording/voice/ as scene-01.wav to scene-11.wav
// (any format ffmpeg reads, same base names) and run it again: each line is laid
// at its scene's start and mixed into the MP4's audio track.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { CLIPS, TAKES, clipStarts, finalDuration, finalScenes, type Take } from "./final-edit";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, "out/thermal-lift-twin.mp4");
const VOICE = resolve(ROOT, "voice");
const FPS = 30;
// Calm reading pace. A line above this in its window gets fewer words, not a faster read.
const MAX_WPM = 135;

const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const words = (line: string) => line.split(/\s+/).filter(Boolean).length;

const scenes = finalScenes();
const pace = scenes.map((s) => ({ n: s.n, wpm: (words(s.line) / (s.end_s - s.start_s)) * 60 }));
const fast = pace.filter((p) => p.wpm > MAX_WPM);
if (fast.length) throw new Error(`lines too long for their windows: ${fast.map((p) => `scene ${p.n} at ${p.wpm.toFixed(0)} wpm`).join(", ")}`);

function writeScript() {
  const rows = scenes
    .map((s, i) => `| ${s.n} | ${mmss(s.start_s)} | ${mmss(s.end_s)} | ${s.title} | ${s.screen} | ${s.line} | ${pace[i]!.wpm.toFixed(0)} |`)
    .join("\n");
  const md = `# Voiceover

Script for \`recording/out/thermal-lift-twin.mp4\`, ${mmss(finalDuration())} long. Written by \`recording/final-cut.ts\` from \`recording/final-edit.ts\`, so the windows are the final video's own times.
Every number a line speaks is on screen, digit for digit, while it is spoken.
Read calmly; every line sits under ${MAX_WPM} words a minute in its window. Say "BGW" letter by letter.
Record each scene as \`recording/voice/scene-NN.wav\` and run \`pnpm video:final\` again to mix them in.

| # | Start | End | Scene | On screen | Line | Words a minute |
|---|---|---|---|---|---|---|
${rows}
`;
  writeFileSync(resolve(ROOT, "story-voiceover.md"), md);
}

function voiceFiles(): { file: string; at_s: number }[] {
  if (!existsSync(VOICE)) return [];
  const files = readdirSync(VOICE);
  return scenes.flatMap((s) => {
    const name = files.find((f) => f.startsWith(`scene-${String(s.n).padStart(2, "0")}.`));
    return name ? [{ file: resolve(VOICE, name), at_s: s.start_s }] : [];
  });
}

function cut() {
  const takes = Object.keys(TAKES) as Take[];
  const args = ["-y", "-loglevel", "error"];
  for (const t of takes) args.push("-i", resolve(ROOT, TAKES[t]));
  const voice = voiceFiles();
  for (const v of voice) args.push("-i", v.file);

  const starts = clipStarts();
  const parts = CLIPS.map((c, i) => `[${takes.indexOf(c.take)}:v]trim=start=${c.from_s}:end=${c.to_s},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[c${i}]`);
  let last = "c0";
  CLIPS.slice(1).forEach((c, k) => {
    const i = k + 1;
    parts.push(`[${last}][c${i}]xfade=transition=fade:duration=${c.fade_s}:offset=${starts[i]!.toFixed(3)}[x${i}]`);
    last = `x${i}`;
  });
  if (voice.length) {
    const first = takes.length;
    voice.forEach((v, j) => {
      const ms = Math.round(v.at_s * 1000);
      parts.push(`[${first + j}:a]aresample=48000,adelay=${ms}|${ms}[a${j}]`);
    });
    parts.push(`${voice.map((_, j) => `[a${j}]`).join("")}amix=inputs=${voice.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]`);
  }
  args.push("-filter_complex", parts.join(";"), "-map", `[${last}]`);
  if (voice.length) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
  args.push("-t", finalDuration().toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT);
  execFileSync(ffmpegPath as unknown as string, args, { stdio: "inherit" });
  return voice.length;
}

writeScript();
const lines = cut();
console.log(`wrote ${OUT}, ${mmss(finalDuration())}, ${lines ? `${lines} voiceover lines mixed in` : "no voiceover yet"}`);
for (const s of scenes) console.log(`  ${mmss(s.start_s).padStart(6)}  ${String(s.n).padStart(2)} ${s.title}`);
