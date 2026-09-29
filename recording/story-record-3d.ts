// Records the 3D story at /story-3d frame by frame and encodes it to H.264.
//
//   pnpm build && pnpm --filter @bgw/web start -p 3101     production server
//   pnpm video:story-3d                                       writes recording/out/story-3d.mp4
//
// The page renders at 1600 by 900 with a device scale of 2 and is captured at
// 1920 by 1080. The story's clock is stepped to each frame's time before the
// capture, so the take is identical on every run and GPU speed never shows.
// Headless Chromium gets the Mac's GPU through ANGLE on Metal; without those
// flags it falls back to SwiftShader, which works but is several times slower.
//
// Also writes a contact sheet, one frame every 5 s, and recording/story-3d-timing.md.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";
import { FieldModel, type FieldDataset } from "../packages/optimise/src";
import { fieldStory, fieldYear, wellStory } from "../apps/web/src/components/story-3d/engine";
import { DURATION, FPS, SCENES } from "../apps/web/src/components/story-3d/script";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, "out");
const SHEET = resolve(OUT, "story-3d-sheet");
const MP4 = resolve(OUT, "story-3d.mp4");
const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const SHEET_EVERY_S = 5;
const FFMPEG = ffmpegPath as unknown as string;

function run(args: string[], stdin?: "pipe") {
  const child = spawn(FFMPEG, args, { stdio: [stdin ?? "ignore", "ignore", "inherit"] });
  const done = new Promise<void>((ok, fail) => child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))));
  return { child, done };
}

async function record() {
  mkdirSync(OUT, { recursive: true });
  rmSync(SHEET, { recursive: true, force: true });
  mkdirSync(SHEET, { recursive: true });

  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/story-3d?rec`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForFunction(() => (window as unknown as { __story?: { ready: boolean } }).__story?.ready, null, { timeout: 120_000 });
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector("canvas")?.getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });
  console.log(`renderer: ${renderer}`);
  const cdp = await page.context().newCDPSession(page);

  const enc = run(
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", MP4],
    "pipe",
  );
  const frames = Math.round(DURATION * FPS);
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    await page.evaluate((s) => (window as unknown as { __story: { setTime(t: number): Promise<void> } }).__story.setTime(s), t);
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 93,
      clip: { x: 0, y: 0, width: 1600, height: 900, scale: 1.2 },
    });
    const buf = Buffer.from(shot.data, "base64");
    if (!enc.child.stdin!.write(buf)) await new Promise((r) => enc.child.stdin!.once("drain", r));
    if (i % (SHEET_EVERY_S * FPS) === 0) writeFileSync(resolve(SHEET, `f${String(i / FPS).padStart(4, "0")}.jpg`), buf);
    if (i % (FPS * 10) === 0) console.log(`${t.toFixed(0)} s of ${DURATION} s, ${((Date.now() - started) / 1000).toFixed(0)} s elapsed`);
  }
  enc.child.stdin!.end();
  await enc.done;
  await browser.close();

  const sheet = run([
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    "1",
    "-pattern_type",
    "glob",
    "-i",
    resolve(SHEET, "*.jpg"),
    "-vf",
    "scale=480:270,tile=6x7:padding=6:margin=6:color=white",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    resolve(OUT, "story-3d-sheet.jpg"),
  ]);
  await sheet.done;
  rmSync(SHEET, { recursive: true, force: true });
  console.log(`wrote ${MP4} and the contact sheet, ${frames} frames`);
}

/** Scene windows and the numbers each one puts on screen, from the same engine the page runs. */
function writeTiming() {
  const dataset = JSON.parse(readFileSync(resolve(ROOT, "../data/demo/field.json"), "utf8")) as FieldDataset;
  const field = new FieldModel(dataset);
  const capacity = { units: dataset.assumptions.generatorUnits, unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h };
  const w = wellStory(field, "BGW-14", dataset.issuedPlan);
  const f = fieldStory(field, "BGW-14", dataset.issuedPlan, capacity);
  const y = fieldYear(field);
  const day = (d: number) => {
    const x = new Date(Date.parse(`${dataset.meta.asOf}T00:00:00Z`) + d * 86_400_000);
    return `${x.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][x.getUTCMonth()]}`;
  };
  const iso = (s: string) => {
    const x = new Date(`${s}T00:00:00Z`);
    return `${x.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][x.getUTCMonth()]} ${x.getUTCFullYear()}`;
  };
  const n = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const move = f.moves[0]!;
  const onScreen: Record<string, string> = {
    well: "Lower third: Thermal Lift Twin, Oil India Limited, Team 2. Labels: pumping unit, thermal wellhead, steam generator, then on the way down VIT tubing, rod string, pump at 1,100 m, Jodhpur Sandstone at about 1,150 m. Depth ruler 300 to 1,150 m on the cut face.",
    cycle: `Cycle ${w.cycle.cycleNumber}: steam from ${day(w.cycle.steamStart_d)} for ${w.cycle.injection_d} of ${w.cycle.designInjection_d} design days (${n(w.cycle.steam_t)} t, SG-2 trip), soak ${w.cycle.soak_d} days, production from ${day(w.cycle.productionStart_d)}. Heated zone peaks at ${n(w.cycle.peakTemperature_C)} °C from ${n(w.cold.temperature_C)} °C; crude in the tubing falls from ${n(w.cold.tubingViscosity_cP)} cP.`,
    today: `Mode: Today's practice, 3.0 SPM constant speed. Rods float from ${day(w.before.firstFloat_d!)}; rod-float days count to ${w.before.floatDays}; peak float ratio ${n(w.before.peakFloatRatio, 2)}. Pump-level shot: rod string bows slack in the tubing, red shock at the pump each stroke, tag \"Rods slack\". Steam finally on ${day(w.before.steamStart_d)}.`,
    apart: "Cards: Steam plan, booked from past cycles. Pump settings, changed by hand, after trouble. Planned apart.",
    twin: `Playhead dragged back to ${day(w.cycle.productionStart_d)}, Twin clicked, Play. Pump 2.0 SPM, stroke up 33% down 67%. Rod-float days stay 0; peak float ratio ${n(w.after.peakFloatRatio, 2)}. Same pump-level shot: rods taut, tag \"Rods loaded\".`,
    "steam-date": `Twin books steam on ${day(w.after.steamStart_d)}, ${w.before.steamStart_d - w.after.steamStart_d} days sooner. Card: steam date ${day(w.before.steamStart_d)} to ${day(w.after.steamStart_d)}; rod-float days ${w.before.floatDays} to ${w.after.floatDays}; pump electricity ${n(w.window.practice_kWh)} to ${n(w.window.twin_kWh)} kWh (${n(w.window.change_frac * 100)}%), same ${n(w.window.oil_bbl)} bbl, ${day(w.window.from_d)} to ${day(w.window.to_d)}.`,
    card: `Surface card ${day(w.card.d)}, ${n(w.card.tubingViscosity_cP)} cP: today's practice min ${n(w.card.practice.minLoad_kN, 1)} kN (below zero, slack); twin min +${n(w.card.twin.minLoad_kN, 1)} kN.`,
    field: `BGW-14 dragged from ${day(f.fromStart_d)} to ${day(f.toStart_d)}. Over capacity on ${f.overloadDays.length} days, ${day(f.overloadDays[0]!)} to ${day(f.overloadDays.at(-1)!)}, ${n(f.peakEdited_t_per_h, 1)} against ${n(f.capacity_t_per_h, 1)} t/h. ${f.tested.slots} wells, ${f.tested.shifts} shifts tested; ${f.options.filter((o) => o.status === "clears").length} moves clear it; ${move.wellId} ${move.delta_d > 0 ? "+" : ""}${move.delta_d} d chosen. Wells in change: oil ${n(f.changeBefore.oil_bbl)} to ${n(f.changeAfter.oil_bbl)} bbl (+${n(f.changeAfter.oil_bbl - f.changeBefore.oil_bbl)}), SOR ${n(f.changeBefore.sor!, 2)} to ${n(f.changeAfter.sor!, 2)}. Adopt proposal clicked.`,
    year: `${y.wells} CSS wells, model result on synthetic data: rod-float days ${n(y.before.floatDays)} to ${n(y.after.floatDays)} a year; expected rod and pump failures ${n(y.before.expectedFailures, 2)} to ${n(y.after.expectedFailures, 2)} a year (${n((y.after.expectedFailures / y.before.expectedFailures - 1) * 100)}%); pump electricity ${n(y.before.kWhPerBbl, 2)} to ${n(y.after.kWhPerBbl, 2)} kWh per bbl (${n((y.after.kWhPerBbl / y.before.kWhPerBbl - 1) * 100)}%). Same oil, same steam.`,
    sources: `Problem statement; OIL Rajasthan fields page; OIL figures 5 Apr 2026 (Business Today); Oil & Gas Journal 4 Dec 2018; Boberg and Lantz 1966; ASTM D341; Gibbs 1963; API RP 11L. Synthetic history: ${n(dataset.history.dailyRows)} daily records, ${iso(dataset.history.from)} to ${iso(dataset.history.to)}, ${dataset.history.failures} failures.`,
    end: "Thermal Lift Twin. Oil India Limited. Team 2, Saveetha Engineering College. Working prototype on synthetic data.",
  };
  const rows = SCENES.map((s) => `| ${mmss(s.start)} | ${mmss(s.end)} | ${s.title} | ${onScreen[s.id] ?? ""} |`).join("\n");
  const md = `# Story take timing

The 3D take at \`recording/out/story-3d.mp4\`, ${mmss(DURATION)} long, 1920 by 1080 at ${FPS} fps, no audio.
Written by \`recording/story-record.ts\` from the scene script the page runs and the numbers the engine computes, so each number below is on screen in that window.

| Start | End | Scene | On screen |
|---|---|---|---|
${rows}
`;
  writeFileSync(resolve(ROOT, "story-3d-timing.md"), md);
}

writeTiming();
if (!process.argv.includes("--timing-only")) await record();
