// Records the story video from /story, frame by frame on the story's own clock.
//
//   pnpm build && pnpm --filter @bgw/web exec next start -p 3101
//   pnpm video:story                    writes recording/out/story-2d.mp4 and its contact sheet
//   pnpm video:story --preview 15       same take, keeps every 15th frame as a PNG, no encode
//
// The page renders at 1600 by 900 with a device scale of 2 and each frame is
// downscaled to 1920 by 1080, so text is supersampled. The recorder steps the
// clock one thirtieth of a second at a time and captures after each step, so
// the take is the same on every run however long a frame takes to capture. It
// moves a drawn cursor and clicks the real controls: play, the day scrubber,
// the Today and Twin switch, the calendar drag.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium, type CDPSession, type Page } from "playwright";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, "out");
const FRAMES = resolve(OUT, "story-2d-frames");
const PREVIEW = resolve(OUT, "story-2d-preview");
const MP4 = resolve(OUT, "story-2d.mp4");
const SHEET = resolve(OUT, "story-2d-sheet.jpg");
const TIMING = resolve(ROOT, "story-timing.md");
const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const FPS = 30;
const DT = 1000 / FPS;
const VIEW = { width: 1600, height: 900 };

const previewArg = process.argv.indexOf("--preview");
const previewEvery = previewArg >= 0 ? Number(process.argv[previewArg + 1] ?? 15) : 0;

interface Point {
  x: number;
  y: number;
}

interface Side {
  floatDays: number;
  failures: number;
  kWhPerBbl: number;
}

/** What `window.__story.summary()` hands back: the engine's numbers for the story. */
interface Facts {
  restTemperature_C: number;
  restViscosity_cP: number;
  injection_d: number;
  designInjection_d: number;
  note: string;
  steam_t: number;
  designSteam_t: number;
  hottest_C: number;
  thinnest_cP: number;
  firstOil: number;
  todaySpmLate: number;
  twinSpmLate: number;
  todayFirstFloat: string;
  floatStartTubing_cP: number;
  todaySteam: string;
  twinSteam: string;
  cardDate: string;
  plannedSteam_d: number;
  resteam_d: number;
  todayFloatDays: number;
  twinFloatDays: number;
  samePeriod: { oil_bbl: number; today_kWh: number; twin_kWh: number; change_frac: number };
  card: { tubing_cP: number; todayMin_kN: number; twinMin_kN: number; todaySpm: number; twinSpm: number };
  field: {
    overloadDays: number[];
    peak_t_per_h: number;
    capacity_t_per_h: number;
    moves: { delta_d: number }[];
    clears: number;
    change: { oilBefore_bbl: number; oilAfter_bbl: number; sorBefore: number; sorAfter: number };
  };
  year: { wells: number; before: Side; after: Side };
}

declare global {
  interface Window {
    __story?: {
      advance(ms: number): void;
      setView(v: "well" | "field" | "method" | "end"): void;
      lowerThird(on: boolean): void;
      state(): { day: number; playing: boolean; field: { stage: string } };
      events(): { t: number; name: string }[];
      summary(): unknown;
    };
  }
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

class Take {
  frame = 0;
  cursor: Point = { x: 1380, y: 640 };
  readonly marks: { scene: string; t: number }[] = [];

  constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  get t() {
    return this.frame / FPS;
  }

  mark(scene: string) {
    this.marks.push({ scene, t: this.t });
    console.log(`${this.t.toFixed(2).padStart(7)} s  ${scene}`);
  }

  async step() {
    await this.page.evaluate((ms) => window.__story!.advance(ms), DT);
    const keep = previewEvery ? this.frame % previewEvery === 0 : true;
    if (keep) {
      await this.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (previewEvery) {
        await this.page.screenshot({ path: resolve(PREVIEW, `${String(this.frame).padStart(5, "0")}.png`), scale: "css" });
      } else {
        const shot = (await this.cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true })) as { data: string };
        writeFileSync(resolve(FRAMES, `${String(this.frame).padStart(5, "0")}.jpg`), Buffer.from(shot.data, "base64"));
      }
    }
    this.frame++;
  }

  async hold(seconds: number) {
    const n = Math.round(seconds * FPS);
    for (let i = 0; i < n; i++) await this.step();
  }

  async until(predicate: string, maxSeconds: number) {
    const n = Math.round(maxSeconds * FPS);
    for (let i = 0; i < n; i++) {
      if (await this.page.evaluate(predicate)) return;
      await this.step();
    }
    throw new Error(`timed out waiting for ${predicate}`);
  }

  async moveTo(to: Point, seconds: number) {
    const from = { ...this.cursor };
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n);
      this.cursor = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.step();
    }
  }

  async center(selector: string, dx = 0, dy = 0): Promise<Point> {
    const box = await this.page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no box for ${selector}`);
    return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
  }

  async click(selector: string, seconds = 0.8, dx = 0, dy = 0) {
    await this.moveTo(await this.center(selector, dx, dy), seconds);
    await this.page.mouse.down();
    await this.step();
    await this.step();
    await this.page.mouse.up();
    await this.step();
  }

  async drag(from: Point, to: Point, seconds: number) {
    await this.moveTo(from, 0.7);
    await this.page.mouse.down();
    await this.hold(0.2);
    const n = Math.round(seconds * FPS);
    for (let i = 1; i <= n; i++) {
      const k = ease(i / n);
      this.cursor = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      await this.page.mouse.move(this.cursor.x, this.cursor.y);
      await this.step();
    }
    await this.hold(0.15);
    await this.page.mouse.up();
    await this.step();
  }

  /** Screen point of a day on the cycle timeline. Mirrors the mapping in timeline.tsx. */
  async timelineX(day: number): Promise<Point> {
    const box = await this.page.locator("[data-testid=timeline-track]").boundingBox();
    if (!box) throw new Error("no timeline");
    const D0 = -78;
    const D1 = 78;
    const pad = 14;
    return { x: box.x + pad + ((day - D0) / (D1 - D0)) * (box.width - 2 * pad), y: box.y + 43 };
  }
}

async function main() {
  rmSync(previewEvery ? PREVIEW : FRAMES, { recursive: true, force: true });
  mkdirSync(previewEvery ? PREVIEW : FRAMES, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: previewEvery ? 1 : 2 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`${BASE}/story?record=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__story);
  await page.evaluate(() => document.fonts.ready);
  const take = new Take(page, cdp);

  // 1. The well, at rest before its steam job.
  take.mark("1 The well");
  await page.evaluate(() => window.__story!.lowerThird(true));
  await take.hold(1.2);
  await take.moveTo({ x: 700, y: 250 }, 2.4);
  await take.hold(1.4);
  await take.moveTo({ x: 1250, y: 330 }, 2.2);
  await take.hold(1.2);
  await page.evaluate(() => window.__story!.lowerThird(false));
  await take.hold(0.8);

  // 2. The steam cycle: steam in, soak, the pump starts.
  await take.click("[data-testid=play]", 1.4);
  take.mark("2 The steam cycle");
  await take.moveTo({ x: 520, y: 640 }, 2.5);
  await take.until("window.__story.state().day >= -57", 30);

  // 3. Today: the plan's steam date and a constant-speed pump.
  await take.hold(4);
  take.mark("3 Today");
  await take.moveTo({ x: 1300, y: 330 }, 2.2);
  await take.until("window.__story.state().day >= 24", 40);
  await take.moveTo({ x: 562, y: 452 }, 2.0);
  await take.until("window.__story.state().day >= 34", 20);
  await take.moveTo({ x: 1510, y: 640 }, 1.8);
  await take.until("!window.__story.state().playing", 30);
  await take.hold(0.6);

  // 4. Two decisions, made apart.
  take.mark("4 Two decisions, made apart");
  await take.moveTo({ x: 900, y: 150 }, 1.4);
  await take.hold(3.6);
  await take.moveTo({ x: 600, y: 150 }, 1.2);
  await take.hold(3.6);
  await take.moveTo({ x: 760, y: 150 }, 0.8);
  await take.hold(1.4);

  // 5. With the twin: back to 2 Aug, switch, play.
  take.mark("5 With the twin");
  const head = await take.timelineX(await page.evaluate(() => window.__story!.state().day));
  await take.drag(head, await take.timelineX(-57), 2.2);
  await take.hold(0.6);
  await take.click("[data-testid=mode-twin]", 1.0);
  await take.hold(1.4);
  await take.click("[data-testid=play]", 1.2);
  await take.moveTo({ x: 1300, y: 460 }, 2.4);
  await take.until("window.__story.state().day >= 20", 40);
  await take.moveTo({ x: 850, y: 478 }, 1.8);
  await take.until("window.__story.state().day >= 30", 20);

  // 6. The steam date: two weeks early, steam goes in, the heat comes back.
  take.mark("6 The steam date");
  await take.hold(1.6);
  await take.click("[data-testid=open-compare]", 1.2);
  await take.moveTo({ x: 1480, y: 628 }, 1.2);
  await take.until("!window.__story.state().playing", 30);
  await take.hold(2.5);

  // 7. Proof on the card.
  take.mark("7 Proof on the card");
  await take.click("[data-testid=open-card]", 1.0);
  await take.hold(4.5);
  await take.moveTo({ x: 452, y: 598 }, 1.6);
  await take.hold(3.2);
  await take.moveTo({ x: 470, y: 532 }, 1.2);
  await take.hold(3.4);

  // 8. Nineteen wells, shared steam.
  take.mark("8 Nineteen wells, shared steam");
  await take.click("[data-testid=nav-field]", 1.0);
  await take.hold(2.6);
  const block = await page.locator("[data-testid=hero-steam-block]").boundingBox();
  if (!block) throw new Error("no hero steam block");
  const dayW = (block.width + 1) / 14;
  const grip = { x: block.x + block.width * 0.35, y: block.y + block.height / 2 };
  await take.drag(grip, { x: grip.x - 14 * dayW, y: grip.y }, 2.6);
  await take.until("window.__story.state().field.stage === 'resolved'", 20);
  await take.moveTo({ x: 1370, y: 660 }, 1.6);
  await take.hold(3.2);

  // 9. A year on the field.
  take.mark("9 A year on the field");
  await take.click("[data-testid=open-year]", 1.0);
  await take.hold(5.5);
  await take.moveTo({ x: 400, y: 560 }, 1.4);
  await take.hold(2.6);
  await take.moveTo({ x: 740, y: 560 }, 1.2);
  await take.hold(2.4);
  await take.moveTo({ x: 1080, y: 560 }, 1.2);
  await take.hold(2.2);

  // 10. How we built it.
  take.mark("10 How we built it");
  await take.click("[data-testid=nav-method]", 1.0);
  await take.moveTo({ x: 980, y: 640 }, 1.4);
  await take.hold(3.2);
  await take.moveTo({ x: 700, y: 300 }, 2.0);
  await take.hold(4.0);
  await take.moveTo({ x: 1100, y: 560 }, 2.0);
  await take.hold(4.0);
  await take.moveTo({ x: 780, y: 790 }, 2.0);
  await take.hold(3.4);

  // 11. End card.
  take.mark("11 End card");
  await page.evaluate(() => window.__story!.setView("end"));
  await take.hold(8);
  take.mark("end");

  const events = await page.evaluate(() => window.__story!.events());
  const facts = await page.evaluate(() => window.__story!.summary());
  await browser.close();

  if (!previewEvery) {
    execFileSync(ffmpegPath as unknown as string, [
      "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", resolve(FRAMES, "%05d.jpg"),
      "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
      "-movflags", "+faststart", MP4,
    ]);
    execFileSync(ffmpegPath as unknown as string, [
      "-y", "-loglevel", "error", "-i", MP4,
      "-vf", "fps=1/5,scale=480:-1,tile=6x7:padding=6:margin=6:color=0xf4ebdd", "-frames:v", "1", "-q:v", "3", SHEET,
    ]);
    rmSync(FRAMES, { recursive: true, force: true });
  }
  writeTiming(take, events, facts);
  console.log(`${take.frame} frames, ${take.t.toFixed(2)} s`);
}

function mmss(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function writeTiming(take: Take, events: { t: number; name: string }[], facts: unknown) {
  const f = facts as Facts;
  const numbers: Record<string, string> = {
    "1 The well": `BGW-14, shut in for steam: rock ${Math.round(f.restTemperature_C)} °C, crude in the tubing ${f.restViscosity_cP.toLocaleString("en-US")} cP. Depth 1,150 m to the Jodhpur Sandstone, pump at 1,100 m.`,
    "2 The steam cycle": `Steam 16 Jul for ${f.injection_d} of ${f.designInjection_d} days (${f.note}), ${f.steam_t.toLocaleString("en-US")} t of ${f.designSteam_t.toLocaleString("en-US")} t design. Soak to 2 Aug. Rock peaks at ${Math.round(f.hottest_C)} °C, crude in the tubing thins to ${Math.round(f.thinnest_cP)} cP, pump starts at ${f.firstOil.toFixed(1)} bbl/d.`,
    "3 Today": `Constant speed ${f.todaySpmLate.toFixed(1)} strokes/min, up 50 · down 50. Rods float from ${f.todayFirstFloat} (crude in the tubing ${Math.round(f.floatStartTubing_cP).toLocaleString("en-US")} cP). Rod-float days count to ${f.todayFloatDays}. Steam on ${f.todaySteam}.`,
    "4 Two decisions, made apart": `Tags: Pump ${f.todaySpmLate.toFixed(1)} strokes/min, constant speed, set by hand. Steam date ${f.todaySteam}, from the plan. Broken link between them.`,
    "5 With the twin": `Scrub back to 2 Aug, switch to Twin. Pump ${f.twinSpmLate.toFixed(1)} strokes/min, up 33 · down 67. Rods loaded, rod-float days stay 0. Tags joined by the Twin chip.`,
    "6 The steam date": `Twin steams on ${f.twinSteam}, ${f.plannedSteam_d - f.resteam_d} days before the plan's ${f.todaySteam}. Compare: steam date ${f.todaySteam} → ${f.twinSteam}; rod-float days ${f.todayFloatDays} → ${f.twinFloatDays}; pump electricity ${Math.round(f.samePeriod.today_kWh).toLocaleString("en-US")} → ${Math.round(f.samePeriod.twin_kWh).toLocaleString("en-US")} kWh (${Math.round(f.samePeriod.change_frac * 100)}%), 28 Sep to 27 Oct, same ${Math.round(f.samePeriod.oil_bbl)} bbl.`,
    "7 Proof on the card": `Surface card ${f.cardDate}, crude in the tubing ${Math.round(f.card.tubing_cP).toLocaleString("en-US")} cP. Today ${f.card.todaySpm.toFixed(1)} strokes/min, lowest load ${f.card.todayMin_kN.toFixed(1)} kN. Twin ${f.card.twinSpm.toFixed(1)} strokes/min, lowest load +${f.card.twinMin_kN.toFixed(1)} kN.`,
    "8 Nineteen wells, shared steam": `Drag BGW-14 from ${f.todaySteam} to ${f.twinSteam}. Over capacity ${f.field.overloadDays.length} days, 7 to 9 Nov, peak ${f.field.peak_t_per_h.toFixed(1)} against ${f.field.capacity_t_per_h.toFixed(1)} t/h. Twin tests, ${f.field.clears} moves clear it, BGW-22 +${f.field.moves[0]?.delta_d ?? 0} d chosen. BGW-14 and BGW-22 over 90 days: oil ${Math.round(f.field.change.oilBefore_bbl).toLocaleString("en-US")} → ${Math.round(f.field.change.oilAfter_bbl).toLocaleString("en-US")} bbl (+${Math.round(f.field.change.oilAfter_bbl - f.field.change.oilBefore_bbl)}), SOR ${f.field.change.sorBefore.toFixed(2)} → ${f.field.change.sorAfter.toFixed(2)}.`,
    "9 A year on the field": `${f.year.wells} steam wells, one year, twin against today. Rod-float days ${Math.round(f.year.before.floatDays)} → ${Math.round(f.year.after.floatDays)}; expected rod and pump failures ${f.year.before.failures.toFixed(2)} → ${f.year.after.failures.toFixed(2)}; pump electricity ${f.year.before.kWhPerBbl.toFixed(2)} → ${f.year.after.kWhPerBbl.toFixed(2)} kWh/bbl. Oil and SOR unchanged. Labelled model result on synthetic data.`,
    "10 How we built it": "Eight source cards and the synthetic history: 74,044 daily well records since 1 Apr 2017, 69 failures (30 rods parted, 21 pumps unseated, 18 tubing leaks).",
    "11 End card": "Thermal Lift Twin, Oil India Limited. Working prototype on synthetic data, built from OIL's published field numbers. Team 2, Saveetha Engineering College.",
  };
  const rows = take.marks
    .filter((m) => m.scene !== "end")
    .map((m, i) => {
      const end = take.marks[i + 1]!.t;
      return `| ${m.scene} | ${mmss(m.t)} | ${mmss(end)} | ${(end - m.t).toFixed(1)} s | ${numbers[m.scene] ?? ""} |`;
    });
  const log = events.map((e) => `| ${mmss(e.t / 1000)} | ${e.name} |`);
  writeFileSync(
    TIMING,
    [
      "# Story take, 2D",
      "",
      `Written by \`recording/story-record.ts\` from the real take: ${mmss(take.t)} long, 1920 by 1080 at ${FPS} fps, no audio.`,
      "Scene times are the MP4's own times. Every number below is what the screen shows, read from the engine.",
      "",
      "| Scene | Start | End | Length | On screen |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      "## Events in the take",
      "",
      "| Time | Event |",
      "|---|---|",
      ...log,
      "",
    ].join("\n"),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
