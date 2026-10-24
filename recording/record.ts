// Records the demo video from the running app, scene by scene, on the
// storyboard's clock, then encodes it to H.264 at 30 fps.
//
//   pnpm build && pnpm start          production server on :3000
//   pnpm video                        writes recording/out/calendar-take.mp4
//
// The page renders at 1600 by 900 with a device scale of 2, and the Chrome
// DevTools screencast hands back each frame scaled to 1920 by 1080, so text is
// supersampled rather than blown up. Every frame carries its own timestamp, so
// the MP4 plays back in real time whatever the capture rate. A drawn cursor
// stands in for the system cursor, which headless Chrome does not paint, and
// the edit zooms, rings and lower third are drawn into the page for the take.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium, type Locator } from "playwright";
import { freeSpot, union, VIEW_H, VIEW_W, type Box } from "./framing";
import { box, lowerThird, OVERLAYS, ring, textRects, unzoom, zoomTo } from "./overlays";
import { SCENES, TOTAL_S } from "./storyboard";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, "out");
const FRAMES = resolve(OUT, "frames");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_W = 1920;
const OUT_H = 1080;
const MP4 = resolve(OUT, "calendar-take.mp4");

const scene = (id: string) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};

interface Frame {
  t: number;
  file: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);


async function main() {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 2 });
  await context.addInitScript(OVERLAYS);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Warm the routes in the flow so the take never waits on a first download.
  for (const route of ["/end", "/pump", "/cycle-plan", "/calendar"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  }
  await page.waitForSelector('[data-testid="steam-calendar"][data-ready="true"]');
  await page.evaluate(() => document.fonts.ready);
  let mx = 760;
  let my = 470;
  await page.mouse.move(mx, my);
  await sleep(2600);
  await lowerThird(page);

  const cdp = await context.newCDPSession(page);
  const frames: Frame[] = [];
  let pending = 0;
  cdp.on("Page.screencastFrame", (f) => {
    const file = resolve(FRAMES, `${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, file });
    pending++;
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).finally(() => pending--);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: OUT_W, maxHeight: OUT_H, everyNthFrame: 1 });
  await page.mouse.move(mx + 1, my);
  await sleep(700);

  const t0 = Date.now() / 1000;
  const log: { event: string; t_s: number }[] = [];
  const now = () => Date.now() / 1000 - t0;
  const mark = (event: string) => log.push({ event, t_s: Number(now().toFixed(2)) });
  const at = async (s: number) => {
    const wait = (t0 + s) * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    else if (wait < -250) console.warn(`late by ${(-wait / 1000).toFixed(2)} s at ${s} s`);
  };
  const glide = async (x: number, y: number, ms: number) => {
    const sx = mx;
    const sy = my;
    const steps = Math.max(1, Math.round(ms / 16));
    const start = Date.now();
    for (let i = 1; i <= steps; i++) {
      const p = ease(i / steps);
      await page.mouse.move(sx + (x - sx) * p, sy + (y - sy) * p);
      const wait = start + (ms * i) / steps - Date.now();
      if (wait > 0) await sleep(wait);
    }
    mx = x;
    my = y;
  };
  const click = async () => {
    await page.mouse.down();
    await sleep(70);
    await page.mouse.up();
  };
  /** Glide to the nearest spot around a point on `target` where the cursor covers no text. */
  const park = async (target: Locator | Box, dx: number, dy: number, ms: number) => {
    const b = "x" in target ? target : await box(target);
    const p = freeSpot(b.x + b.width * dx, b.y + b.height * dy, await textRects(page));
    await glide(p.x, p.y, ms);
  };
  /** Glide onto a control, press it, then step off so the cursor leaves its label clear. */
  const press = async (target: Locator, dx: number, ms: number, when: number) => {
    const b = await box(target);
    await glide(b.x + b.width * dx, b.y + b.height / 2, ms);
    await at(when);
    await click();
    await sleep(350);
    await park(b, dx, 2.2, 450);
  };
  const nav = async (id: string, sceneId: string, testId: string) => {
    const s = scene(sceneId);
    await at(s.start_s - 1.3);
    const link = page.getByTestId(`nav-${id}`);
    const b = await box(link);
    await glide(b.x + b.width * 0.5, b.y + b.height * 0.5, 950);
    await at(s.start_s - 0.12);
    await click();
    await page.waitForSelector(`[data-testid="${testId}"]`, { timeout: 5000 });
    mark(`screen ${s.id}`);
    await sleep(250);
    await park(b, 0.5, 2.6, 500);
  };
  const tid = (id: string) => page.getByTestId(id);

  // 1. Calendar loaded, lower third over it.
  mark("screen calendar");
  await at(0.8);
  await park(tid("generator-lane"), 0.42, 0.5, 2400);
  await at(3.8);
  await park(tid("due-for-steam"), 0.55, 0.2, 1800);
  await at(6.2);
  await page.evaluate(() => {
    const el = document.getElementById("__rec_lower_third");
    if (el) {
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
    }
  });

  // 2. Why BGW-14 is due: the twin panel, then the row.
  await at(scene("due").start_s);
  mark("screen due");
  await zoomTo(page, await box(tid("due-for-steam")));
  await at(11.3);
  await unzoom(page);
  await at(12.0);
  await ring(page, union(await box(tid("row-BGW-14")), await box(tid("slot-BGW-14"))), 1600, 3);
  const block = tid("slot-BGW-14");
  const b = await box(block);
  await glide(b.x + Math.min(30, b.width / 3), b.y + b.height / 2, 850);

  // 3. The drag, the overload, the twin's fix.
  await at(scene("drag").start_s);
  mark("drag start");
  const dayPx = Number(await tid("steam-calendar").getAttribute("data-day-px"));
  const resteam = Number(await tid("row-BGW-14").getAttribute("data-resteam-day"));
  const startDay = Number(await block.getAttribute("data-start-day"));
  await page.mouse.down();
  await sleep(120);
  await glide(mx + (resteam - startDay) * dayPx, my, 1500);
  await sleep(200);
  await page.mouse.up();
  mark("drop");
  await page.waitForSelector('[data-testid="steam-calendar"][data-stage="overload"]', { timeout: 3000 });
  mark("overload");
  await ring(page, await box(tid("generator-lane")), 2400, 4);
  await park(tid("generator-lane"), 0.6, 0.06, 700);
  await page.waitForSelector('[data-testid="steam-calendar"][data-stage="resolved"]', { timeout: 6000 });
  mark("resolved");

  // 4. What the twin tested and what it moved.
  await at(20.4);
  await ring(page, await box(tid("options-tested")), 3800, 6);
  await park(tid("option-chosen"), 0.96, 0.5, 1200);
  await at(25.0);
  await ring(page, union(await box(tid("row-BGW-22")), await box(tid("slot-BGW-22"))), 3000, 3);
  await park(tid("slot-BGW-22"), 1.04, 0.2, 1300);
  await at(29.0);
  await zoomTo(page, await box(tid("what-happened")));
  await at(35.0);
  await unzoom(page);

  // 5. The two wells in the change, then adopt.
  await at(scene("change").start_s);
  mark("screen change");
  await zoomTo(page, await box(tid("wells-change")));
  await at(44.2);
  await unzoom(page);
  await at(44.6);
  await press(tid("adopt"), 0.14, 900, 45.7);
  mark("adopt");

  // 6. Cycle plan for BGW-14.
  await nav("cycle-plan", "cycle-plan", "cycle-plan");
  await at(49.0);
  await ring(page, await box(tid("readout-next-steam")), 2600, 8);
  await park(tid("readout-next-steam"), 0.2, 1.3, 1100);
  await at(51.4);
  await press(tid("play-cycle"), 0.14, 1000, 52.6);
  mark("play cycle");
  await park(tid("cycle-chart"), 0.62, 0.62, 1500);
  await at(62.0);
  await ring(page, await box(tid("pump-schedule")), 3600, 4);
  await park(tid("pump-schedule"), 0.95, 0.45, 1200);
  await at(66.2);
  const chart = await box(tid("cycle-chart"));
  await ring(page, { x: chart.x + chart.width * 0.4, y: chart.y + chart.height * 0.62, width: chart.width * 0.55, height: chart.height * 0.36 }, 3000, 0);
  await park(chart, 0.62, 0.78, 1200);

  // 7. Pump twin for BGW-14 on its last day before steam.
  await nav("pump", "pump", "pump-twin");
  await at(71.0);
  await ring(page, await box(page.getByText("its last day before steam")), 2800, 5);
  await at(74.5);
  await zoomTo(page, await box(tid("surface-card")));
  await at(80.4);
  await unzoom(page);
  await at(81.2);
  await ring(page, await box(tid("float-flag")), 3200, 5);
  await park(tid("float-flag"), 0.97, 1.1, 1100);
  await at(85.0);
  await press(tid("mode-twin"), 0.5, 1100, 86.5);
  mark("twin profile");
  await at(88.0);
  await ring(page, await box(tid("vfd-panel")), 4400, 4);
  await park(tid("vfd-panel"), 0.66, 0.74, 1500);
  await at(93.6);
  await ring(page, await box(tid("readout-min")), 4200, 8);
  await park(tid("readout-min"), 0.3, 1.4, 1300);

  // 8. End card.
  await at(scene("end").start_s - 0.45);
  await page.evaluate(() => {
    const c = document.getElementById("__rec_cursor");
    if (c) c.style.opacity = "0";
  });
  await at(scene("end").start_s - 0.05);
  await page.goto(`${BASE}/end`, { waitUntil: "load" });
  mark("screen end");
  // A slow push-in keeps the end card from sitting still.
  await page.evaluate((ms) => {
    const b = document.body;
    b.style.transformOrigin = "50% 50%";
    b.style.transition = `transform ${ms}ms linear`;
    requestAnimationFrame(() => {
      b.style.transform = "scale(1.045)";
    });
  }, (scene("end").end_s - scene("end").start_s) * 1000);
  await at(TOTAL_S);
  const tEnd = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  while (pending > 0) await sleep(20);
  await browser.close();

  // Concat list: every frame held until the next one arrives.
  const kept = frames.filter((f) => f.t >= t0 && f.t <= tEnd);
  const before = frames.filter((f) => f.t < t0).at(-1);
  const seq = before ? [{ ...before, t: t0 }, ...kept] : kept;
  let list = "ffconcat version 1.0\n";
  seq.forEach((f, i) => {
    const next = i + 1 < seq.length ? seq[i + 1]!.t : tEnd;
    list += `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
  });
  list += `file '${seq.at(-1)!.file}'\n`;
  const listFile = resolve(FRAMES, "list.txt");
  writeFileSync(listFile, list);
  execFileSync(
    ffmpegPath as unknown as string,
    [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", listFile,
      "-vf", `fps=30,scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "animation",
      "-movflags", "+faststart", "-t", String(TOTAL_S),
      MP4,
    ],
    { stdio: "inherit" },
  );
  writeFileSync(resolve(OUT, "take-log.json"), `${JSON.stringify({ base: BASE, frames: seq.length, duration_s: tEnd - t0, events: log }, null, 2)}\n`);
  rmSync(FRAMES, { recursive: true, force: true });
  console.log(`wrote ${MP4}: ${seq.length} captured frames over ${(tEnd - t0).toFixed(2)} s`);
  if (errors.length) {
    console.error(`page errors:\n  ${errors.join("\n  ")}`);
    process.exitCode = 1;
  }
}

await main();
