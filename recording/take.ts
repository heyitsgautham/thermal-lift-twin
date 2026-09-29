// Scripted take of the hero: open the steam calendar, drag BGW-14's steam slot
// to its re-steam day, let the generators overload, let the twin re-sequence.
// The drag distance comes from the page's own data attributes, so the same
// dataset always produces the same drag.
//
//   pnpm shots                 screenshots at 1920x1080 and 1440x900
//   pnpm shots --video         also records a 1920x1080 video of the take
//   BASE_URL=http://host:port  point at another server
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const SHOTS = resolve(ROOT, "shots");
const VIDEO = resolve(ROOT, "video");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HERO_WELL = "BGW-14";

const record = process.argv.includes("--video");
const viewports = (process.env.VIEWPORTS ?? "1920x1080,1440x900").split(",").map((v) => {
  const [width, height] = v.split("x").map(Number);
  return { name: v, width: width!, height: height! };
});

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

async function heroDrag(page: Page): Promise<{ from: number; to: number }> {
  const calendar = page.getByTestId("steam-calendar");
  const dayPx = Number(await calendar.getAttribute("data-day-px"));
  const resteamDay = Number(await page.getByTestId(`row-${HERO_WELL}`).getAttribute("data-resteam-day"));
  const block = page.getByTestId(`slot-${HERO_WELL}`);
  const startDay = Number(await block.getAttribute("data-start-day"));
  const box = await block.boundingBox();
  if (!box) throw new Error(`No steam block for ${HERO_WELL}`);

  const grabX = box.x + Math.min(36, box.width / 3);
  const grabY = box.y + box.height / 2;
  const dx = (resteamDay - startDay) * dayPx;

  await page.mouse.move(grabX, grabY - 40, { steps: 8 });
  await page.mouse.move(grabX, grabY, { steps: 6 });
  await page.waitForTimeout(250);
  await page.mouse.down();
  const steps = 36;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(grabX + dx * easeInOut(i / steps), grabY);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(350);
  await page.mouse.up();
  return { from: startDay, to: resteamDay };
}

async function settle(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

async function take(viewport: (typeof viewports)[number], video: boolean) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    ...(video ? { recordVideo: { dir: VIDEO, size: { width: viewport.width, height: viewport.height } } } : {}),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="steam-calendar"][data-ready="true"]');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(viewport.width / 2, 20);
  await settle(page, 1600);
  const shot = (name: string) => page.screenshot({ path: resolve(SHOTS, `${viewport.name}-${name}.png`) });

  await shot("01-before");
  const drag = await heroDrag(page);
  await page.waitForSelector('[data-testid="steam-calendar"][data-stage="overload"]', { timeout: 5000 });
  await page.mouse.move(viewport.width / 2, 20, { steps: 10 });
  await settle(page, 450);
  await shot("02-overload");
  await page.waitForSelector('[data-testid="steam-calendar"][data-stage="resolved"]', { timeout: 10000 });
  await settle(page, 1500);
  await shot("03-resolved");

  await context.close();
  await browser.close();
  console.log(`${viewport.name}: dragged ${HERO_WELL} from day ${drag.from} to day ${drag.to}`);
  if (errors.length > 0) {
    console.error(`${viewport.name}: page errors\n  ${errors.join("\n  ")}`);
    process.exitCode = 1;
  }
}

mkdirSync(SHOTS, { recursive: true });
if (record) mkdirSync(VIDEO, { recursive: true });
for (const [i, viewport] of viewports.entries()) {
  await take(viewport, record && i === 0);
}
