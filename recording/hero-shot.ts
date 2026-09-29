// Captures the README hero, docs/hero.png: BGW-14 at constant speed on 8 Nov,
// with the rods floating at the pump. Run it against a build made without
// apps/web/.env.local, so the image carries the neutral names; it refuses to
// write the image if a private name is on the page.
//
//   pnpm build && pnpm --filter @bgw/web exec next start -p 3101
//   pnpm hero-shot
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

type StoryWindow = { __story: { advance(ms: number): void; state(): { day: number } } };

const ROOT = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const PNG = resolve(ROOT, "../docs/hero.png");
const ENV = resolve(ROOT, "../apps/web/.env.local");
// 8 Nov, day 41 from the as-of date, 15 days into the float.
const DAY = 41;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/story?record=1`, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!(window as unknown as Partial<StoryWindow>).__story);
await page.evaluate(() => document.fonts.ready);

const advance = (frames: number) =>
  page.evaluate((n) => {
    const s = (window as unknown as StoryWindow).__story;
    for (let i = 0; i < n; i++) s.advance(1000 / 30);
  }, frames);
const day = () => page.evaluate(() => (window as unknown as StoryWindow).__story.state().day);

// A DOM click, not a mouse click: pointer events would draw the take's cursor.
await page.evaluate(() => document.querySelector<HTMLElement>("[data-testid=play]")!.click());
while ((await day()) < DAY) await advance(3);
await advance(12);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

if (existsSync(ENV)) {
  process.loadEnvFile(ENV);
  const text = (await page.content()).toLowerCase();
  const leaks = [process.env.NEXT_PUBLIC_FIELD, process.env.NEXT_PUBLIC_PS].filter((t): t is string => !!t && text.includes(t.toLowerCase()));
  if (leaks.length) throw new Error(`the page shows ${leaks.join(", ")}; serve a build made without apps/web/.env.local`);
}
await page.screenshot({ path: PNG });
await browser.close();
console.log(`wrote ${PNG}`);
