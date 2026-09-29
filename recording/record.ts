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
import { chromium, type Locator, type Page } from "playwright";
import { SCENES, TOTAL_S } from "./storyboard";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(ROOT, "out");
const FRAMES = resolve(OUT, "frames");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const VIEW_W = 1600;
const VIEW_H = 900;
const OUT_W = 1920;
const OUT_H = 1080;
const MP4 = resolve(OUT, "calendar-take.mp4");

const scene = (id: string) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`no scene ${id}`);
  return s;
};

// tsx keeps function names by wrapping them in __name(), which does not exist
// inside the page, so page.evaluate bodies need a no-op stand-in.
const OVERLAYS = `window.__name = window.__name || ((f) => f);
(() => {
  const install = () => {
    if (location.pathname === "/end") return;
    if (!document.body || document.getElementById("__rec_cursor")) return;
    const c = document.createElement("div");
    c.id = "__rec_cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 28 28"><path d="M4 2 L4 21 L9 16.5 L12.6 24.5 L15.8 23.1 L12.2 15.4 L19.5 15.4 Z" fill="#2a1d14" stroke="#fbf7f0" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: (window.__recX ?? 800) + "px", top: (window.__recY ?? 450) + "px", width: "26px", height: "26px", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-4px,-2px)", transition: "opacity 250ms", filter: "drop-shadow(0 2px 3px rgba(59,42,30,0.35))" });
    const tap = document.createElement("div");
    tap.id = "__rec_tap";
    Object.assign(tap.style, { position: "fixed", left: "0px", top: "0px", width: "34px", height: "34px", borderRadius: "999px", border: "2.5px solid #c2410c", zIndex: "2147483646", pointerEvents: "none", opacity: "0", transform: "translate(-50%,-50%) scale(0.3)" });
    document.body.append(tap, c);
  };
  document.addEventListener("mousemove", (e) => {
    window.__recX = e.clientX; window.__recY = e.clientY;
    const c = document.getElementById("__rec_cursor");
    if (c) { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }
  }, true);
  document.addEventListener("mousedown", (e) => {
    const r = document.getElementById("__rec_tap");
    if (!r) return;
    r.style.transition = "none"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
    r.style.opacity = "0.9"; r.style.transform = "translate(-50%,-50%) scale(0.3)";
    requestAnimationFrame(() => { r.style.transition = "transform 380ms ease-out, opacity 380ms ease-out"; r.style.opacity = "0"; r.style.transform = "translate(-50%,-50%) scale(1)"; });
  }, true);
  const hideTooltips = () => {
    if (!document.head || document.getElementById("__rec_style")) return;
    const style = document.createElement("style");
    style.id = "__rec_style";
    style.textContent = '[data-slot="tooltip-content"]{display:none!important}';
    document.head.append(style);
  };
  setInterval(() => { hideTooltips(); install(); }, 200);
  window.addEventListener("load", install);
})();`;

interface Frame {
  t: number;
  file: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no box for ${loc}`);
  return b;
}

function union(...boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Every visible line of text on the page, in unzoomed page pixels, each
 * clipped to the scroll and overflow boxes around it. Used to frame zooms and
 * park the cursor without cutting or covering text.
 */
async function textRects(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const out: { x: number; y: number; width: number; height: number }[] = [];
    const clipCache = new Map<Element, DOMRect[]>();
    const clips = (el: Element): DOMRect[] => {
      const hit = clipCache.get(el);
      if (hit) return hit;
      const list: DOMRect[] = [];
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") list.push(p.getBoundingClientRect());
      }
      clipCache.set(el, list);
      return list;
    };
    const add = (el: Element, r: DOMRect) => {
      if (r.width < 1 || r.height < 1) return;
      let x0 = r.left;
      let y0 = r.top;
      let x1 = r.right;
      let y1 = r.bottom;
      for (const c of clips(el)) {
        x0 = Math.max(x0, c.left);
        y0 = Math.max(y0, c.top);
        x1 = Math.min(x1, c.right);
        y1 = Math.min(y1, c.bottom);
      }
      if (x1 - x0 > 0.5 && y1 - y0 > 0.5) out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    };
    const visible = (el: Element) => {
      if (el.closest("[id^='__rec']")) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim() || !visible(el)) continue;
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) add(el, r);
    }
    for (const el of Array.from(document.querySelectorAll("svg text, select, input"))) {
      if (visible(el)) add(el, el.getBoundingClientRect());
    }
    return out;
  });
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function contains(outer: Box, inner: Box, tol = 0.5): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.width <= outer.x + outer.width + tol &&
    inner.y + inner.height <= outer.y + outer.height + tol
  );
}

/**
 * Finds the tightest zoom frame that holds `target` whole and whose four edges
 * cross no line of text, with every line inside kept `margin` page pixels
 * clear of the edges so none looks cut. Frames keep the viewport's aspect and never show
 * past the page edges. Returns null if no scale above 1.1 works.
 */
function solveZoom(target: Box, rects: Box[], pad = 12, margin = 10): { s: number; frame: Box } | null {
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  for (let s = 2.4; s >= 1.1; s -= 0.02) {
    const w = VIEW_W / s;
    const h = VIEW_H / s;
    if (w < target.width + 2 * pad || h < target.height + 2 * pad) continue;
    const xLo = Math.max(0, target.x + target.width + pad - w);
    const xHi = Math.min(VIEW_W - w, target.x - pad);
    const yLo = Math.max(0, target.y + target.height + pad - h);
    const yHi = Math.min(VIEW_H - h, target.y - pad);
    if (xLo > xHi || yLo > yHi) continue;
    let best: { frame: Box; d: number } | null = null;
    for (let fx = xLo; fx <= xHi + 0.01; fx += 3) {
      for (let fy = yLo; fy <= yHi + 0.01; fy += 3) {
        const frame = { x: fx, y: fy, width: w, height: h };
        // Text is either wholly outside the frame or clear of every edge by `margin`.
        const inner = { x: fx + margin, y: fy + margin, width: w - 2 * margin, height: h - 2 * margin };
        if (rects.some((r) => intersects(frame, r) && !contains(inner, r))) continue;
        const d = Math.hypot(fx + w / 2 - cx, fy + h / 2 - cy);
        if (!best || d < best.d) best = { frame, d };
      }
    }
    if (best) return { s, frame: best.frame };
  }
  return null;
}

function isClean(c: Box, rects: Box[], margin: number): boolean {
  const inner = { x: c.x + margin, y: c.y + margin, width: c.width - 2 * margin, height: c.height - 2 * margin };
  return !rects.some((r) => intersects(c, r) && !contains(inner, r));
}

/**
 * Smallest rectangle around `target` whose edges cross no text, growing each
 * side outward to the nearest clean line. Used when no whole-frame zoom is
 * clean: everything outside it is matted out.
 */
function cleanRect(target: Box, rects: Box[], pad = 12, margin = 8): Box {
  let c = { x: target.x - pad, y: target.y - pad, width: target.width + 2 * pad, height: target.height + 2 * pad };
  for (let round = 0; round < 6 && !isClean(c, rects, margin); round++) {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      for (let step = 0; step <= 400; step += 2) {
        const t = { ...c };
        if (side === "left") {
          t.x = c.x - step;
          t.width = c.width + step;
        } else if (side === "right") t.width = c.width + step;
        else if (side === "top") {
          t.y = c.y - step;
          t.height = c.height + step;
        } else t.height = c.height + step;
        // A side is fine once no text crosses it; the others are fixed in later passes.
        const edge: Box =
          side === "left"
            ? { x: t.x, y: t.y, width: 1, height: t.height }
            : side === "right"
              ? { x: t.x + t.width - 1, y: t.y, width: 1, height: t.height }
              : side === "top"
                ? { x: t.x, y: t.y, width: t.width, height: 1 }
                : { x: t.x, y: t.y + t.height - 1, width: t.width, height: 1 };
        const band: Box =
          side === "left" || side === "right"
            ? { x: edge.x - margin, y: edge.y, width: 2 * margin, height: edge.height }
            : { x: edge.x, y: edge.y - margin, width: edge.width, height: 2 * margin };
        if (!rects.some((r) => intersects(band, r))) {
          c = t;
          break;
        }
      }
    }
  }
  return c;
}

/**
 * Edit zoom onto `target`. First choice is a whole-frame zoom whose edges cut
 * no text. When the page is too dense for one, the zoom frames the smallest
 * clean rectangle around the target and mattes everything outside it in sand,
 * so no text line is ever cut by an edge.
 */
async function zoomTo(page: Page, target: Box, ms = 750) {
  const rects = await textRects(page);
  const solved = solveZoom(target, rects);
  let s: number;
  let tx: number;
  let ty: number;
  let matte: Box | null = null;
  if (solved && solved.s >= 1.3) {
    s = solved.s;
    tx = -solved.frame.x * s;
    ty = -solved.frame.y * s;
    console.log(`zoom ${s.toFixed(2)}x, clean frame ${solved.frame.x.toFixed(0)},${solved.frame.y.toFixed(0)} ${solved.frame.width.toFixed(0)}x${solved.frame.height.toFixed(0)}`);
  } else {
    const c = cleanRect(target, rects);
    s = Math.min(2.4, (0.9 * VIEW_W) / c.width, (0.9 * VIEW_H) / c.height);
    tx = VIEW_W / 2 - s * (c.x + c.width / 2);
    ty = VIEW_H / 2 - s * (c.y + c.height / 2);
    matte = { x: c.x * s + tx, y: c.y * s + ty, width: c.width * s, height: c.height * s };
    console.log(`zoom ${s.toFixed(2)}x, matted to ${c.x.toFixed(0)},${c.y.toFixed(0)} ${c.width.toFixed(0)}x${c.height.toFixed(0)}`);
  }
  await page.evaluate(
    ({ s, tx, ty, ms, matte }) => {
      const c = document.getElementById("__rec_cursor");
      if (c) c.style.opacity = "0";
      const b = document.body;
      b.style.transformOrigin = "0 0";
      b.style.transition = `transform ${ms}ms cubic-bezier(0.65, 0, 0.35, 1)`;
      b.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      if (matte) {
        const m = document.createElement("div");
        m.id = "__rec_matte";
        Object.assign(m.style, {
          position: "fixed",
          left: `${matte.x}px`,
          top: `${matte.y}px`,
          width: `${matte.width}px`,
          height: `${matte.height}px`,
          borderRadius: "8px",
          boxShadow: "0 0 0 1.5px rgba(59,42,30,0.22), 0 24px 60px -24px rgba(59,42,30,0.55), 0 0 0 4000px #f4ebdd",
          zIndex: "2147483400",
          pointerEvents: "none",
          opacity: "0",
          transition: `opacity ${Math.round(ms * 0.8)}ms ease ${Math.round(ms * 0.2)}ms`,
        });
        document.documentElement.append(m);
        requestAnimationFrame(() => {
          m.style.opacity = "1";
        });
      }
    },
    { s, tx, ty, ms, matte },
  );
}

/** Size of the drawn cursor from its tip, with a little air around it. */
const CURSOR_BOX = { left: 10, top: 8, right: 26, bottom: 30 };

/**
 * The nearest spot to `(px, py)` where the drawn cursor covers no text,
 * searched outward in rings, and kept inside `within` when given.
 */
function freeSpot(px: number, py: number, rects: Box[], within?: Box): { x: number; y: number } {
  const ok = (x: number, y: number) => {
    const c = { x: x - CURSOR_BOX.left, y: y - CURSOR_BOX.top, width: CURSOR_BOX.left + CURSOR_BOX.right, height: CURSOR_BOX.top + CURSOR_BOX.bottom };
    if (c.x < 2 || c.y < 2 || c.x + c.width > VIEW_W - 2 || c.y + c.height > VIEW_H - 2) return false;
    if (within && !contains(within, { x, y, width: 1, height: 1 })) return false;
    return !rects.some((r) => intersects(c, r));
  };
  if (ok(px, py)) return { x: px, y: py };
  for (let radius = 4; radius <= 260; radius += 4) {
    const steps = Math.max(8, Math.round(radius / 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = px + radius * Math.cos(a);
      const y = py + radius * Math.sin(a);
      if (ok(x, y)) return { x, y };
    }
  }
  return { x: px, y: py };
}

async function unzoom(page: Page, ms = 650) {
  await page.evaluate((ms) => {
    const m = document.getElementById("__rec_matte");
    if (m) {
      m.style.transition = `opacity ${Math.round(ms * 0.6)}ms ease`;
      m.style.opacity = "0";
      setTimeout(() => m.remove(), ms);
    }
    const b = document.body;
    b.style.transition = `transform ${ms}ms cubic-bezier(0.65, 0, 0.35, 1)`;
    b.style.transform = "none";
    setTimeout(() => {
      const c = document.getElementById("__rec_cursor");
      if (c) c.style.opacity = "1";
    }, ms);
  }, ms);
}

/** A ring drawn around a region of the page, the pointer's replacement for a text selection. */
async function ring(page: Page, target: Box, holdMs: number, pad = 6) {
  await page.evaluate(
    ({ target, holdMs, pad }) => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed",
        left: `${target.x - pad}px`,
        top: `${target.y - pad}px`,
        width: `${target.width + 2 * pad}px`,
        height: `${target.height + 2 * pad}px`,
        border: "3px solid #c2410c",
        borderRadius: "6px",
        boxShadow: "0 0 0 4px rgba(194,65,12,0.14), 0 6px 22px -8px rgba(194,65,12,0.55)",
        zIndex: "2147483600",
        pointerEvents: "none",
        opacity: "0",
        transform: "scale(1.06)",
        transition: "opacity 260ms ease-out, transform 320ms cubic-bezier(0.2,0.8,0.2,1)",
      });
      document.body.append(r);
      requestAnimationFrame(() => {
        r.style.opacity = "1";
        r.style.transform = "scale(1)";
      });
      setTimeout(() => {
        r.style.opacity = "0";
        setTimeout(() => r.remove(), 400);
      }, holdMs);
    },
    { target, holdMs, pad },
  );
}

async function lowerThird(page: Page) {
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "__rec_lower_third";
    el.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:3px">' +
      '<span style="font:800 21px/1 var(--font-archivo);font-stretch:112%;letter-spacing:0.02em;color:#3b2a1e">Thermal Lift Twin</span>' +
      '<span style="font:600 11.5px/1.2 var(--font-archivo);text-transform:uppercase;letter-spacing:0.1em;color:#b5301f">Oil India Limited</span>' +
      '<span style="font:500 13px/1.2 var(--font-archivo);color:#6d5847">Team 2, Saveetha Engineering College</span>' +
      "</div>";
    Object.assign(el.style, {
      position: "fixed",
      left: "24px",
      bottom: "46px",
      padding: "14px 20px 14px 18px",
      background: "rgba(251,247,240,0.97)",
      borderLeft: "5px solid #b5301f",
      borderRadius: "3px",
      boxShadow: "0 10px 30px -12px rgba(59,42,30,0.55), 0 0 0 1px rgba(59,42,30,0.18)",
      zIndex: "2147483500",
      pointerEvents: "none",
      transition: "opacity 600ms ease, transform 600ms ease",
    });
    document.body.append(el);
  });
}

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
