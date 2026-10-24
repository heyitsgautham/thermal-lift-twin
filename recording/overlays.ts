// What the recorder draws into the page for a take: the cursor and tap ring,
// the edit zoom with its matte, highlight rings and the lower third.
import type { Locator, Page } from "playwright";
import { cleanRect, solveZoom, VIEW_H, VIEW_W, type Box } from "./framing";

// tsx keeps function names by wrapping them in __name(), which does not exist
// inside the page, so page.evaluate bodies need a no-op stand-in.
export const OVERLAYS = `window.__name = window.__name || ((f) => f);
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

export async function box(loc: Locator): Promise<Box> {
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no box for ${loc}`);
  return b;
}

/**
 * Every visible line of text on the page, in unzoomed page pixels, each
 * clipped to the scroll and overflow boxes around it. Used to frame zooms and
 * park the cursor without cutting or covering text.
 */
export async function textRects(page: Page): Promise<Box[]> {
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

/**
 * Edit zoom onto `target`. First choice is a whole-frame zoom whose edges cut
 * no text. When the page is too dense for one, the zoom frames the smallest
 * clean rectangle around the target and mattes everything outside it in sand,
 * so no text line is ever cut by an edge.
 */
export async function zoomTo(page: Page, target: Box, ms = 750) {
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

export async function unzoom(page: Page, ms = 650) {
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
export async function ring(page: Page, target: Box, holdMs: number, pad = 6) {
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

export async function lowerThird(page: Page) {
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
