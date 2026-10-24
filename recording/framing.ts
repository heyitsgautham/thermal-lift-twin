// Framing geometry for the recorded takes, in unzoomed page pixels: zoom
// frames whose edges cut no text, and cursor spots that cover none. Pure
// functions of the text boxes, so they run and test outside the browser.

/** The page viewport the takes render at. */
export const VIEW_W = 1600;
export const VIEW_H = 900;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function union(...boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function contains(outer: Box, inner: Box, tol = 0.5): boolean {
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
export function solveZoom(target: Box, rects: Box[], pad = 12, margin = 10): { s: number; frame: Box } | null {
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

export function isClean(c: Box, rects: Box[], margin: number): boolean {
  const inner = { x: c.x + margin, y: c.y + margin, width: c.width - 2 * margin, height: c.height - 2 * margin };
  return !rects.some((r) => intersects(c, r) && !contains(inner, r));
}

/**
 * Smallest rectangle around `target` whose edges cross no text, growing each
 * side outward to the nearest clean line. Used when no whole-frame zoom is
 * clean: everything outside it is matted out.
 */
export function cleanRect(target: Box, rects: Box[], pad = 12, margin = 8): Box {
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

/** Size of the drawn cursor from its tip, with a little air around it. */
export const CURSOR_BOX = { left: 10, top: 8, right: 26, bottom: 30 };

/**
 * The nearest spot to `(px, py)` where the drawn cursor covers no text,
 * searched outward in rings, and kept inside `within` when given.
 */
export function freeSpot(px: number, py: number, rects: Box[], within?: Box): { x: number; y: number } {
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
