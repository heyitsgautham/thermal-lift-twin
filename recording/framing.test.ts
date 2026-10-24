import { describe, expect, it } from "vitest";
import { CURSOR_BOX, cleanRect, contains, freeSpot, intersects, solveZoom, union, VIEW_H, VIEW_W, type Box } from "./framing";

const b = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

/** True when no text box crosses an edge of `frame` or sits within `margin` of one. */
function cutsNoText(frame: Box, rects: Box[], margin: number): boolean {
  const inner = b(frame.x + margin, frame.y + margin, frame.width - 2 * margin, frame.height - 2 * margin);
  return rects.every((r) => !intersects(frame, r) || contains(inner, r));
}

describe("box helpers", () => {
  it("unions boxes into their bounding box", () => {
    expect(union(b(10, 10, 5, 5), b(30, 0, 10, 40))).toEqual(b(10, 0, 30, 40));
  });

  it("tells overlap from touching", () => {
    expect(intersects(b(0, 0, 10, 10), b(5, 5, 10, 10))).toBe(true);
    expect(intersects(b(0, 0, 10, 10), b(10, 0, 10, 10))).toBe(false);
  });

  it("checks containment with a half-pixel tolerance", () => {
    expect(contains(b(0, 0, 10, 10), b(0.3, 0, 10, 10))).toBe(true);
    expect(contains(b(0, 0, 10, 10), b(2, 2, 10, 10))).toBe(false);
  });
});

describe("zoom framing", () => {
  const target = b(700, 400, 120, 60);

  it("zooms as far as it can on an empty page, keeping the viewport's shape", () => {
    const z = solveZoom(target, [])!;
    expect(z.s).toBeCloseTo(2.4, 9);
    expect(z.frame.width / z.frame.height).toBeCloseTo(VIEW_W / VIEW_H, 9);
    expect(contains(z.frame, target)).toBe(true);
  });

  it("never frames past the page edges", () => {
    const z = solveZoom(b(20, 20, 60, 30), [])!;
    expect(z.frame.x).toBeGreaterThanOrEqual(0);
    expect(z.frame.y).toBeGreaterThanOrEqual(0);
    expect(z.frame.x + z.frame.width).toBeLessThanOrEqual(VIEW_W + 1e-9);
  });

  it("moves or widens the frame so its edges cut no line of text", () => {
    const rects = [b(560, 380, 300, 14), b(700, 520, 400, 14), b(200, 300, 900, 12)];
    const z = solveZoom(target, rects)!;
    expect(z).not.toBeNull();
    expect(contains(z.frame, target)).toBe(true);
    expect(cutsNoText(z.frame, rects, 10)).toBe(true);
  });

  it("gives up on a target too large to zoom", () => {
    expect(solveZoom(b(0, 0, VIEW_W - 10, VIEW_H - 10), [])).toBeNull();
  });
});

describe("clean rectangle", () => {
  it("is the padded target when no text is near", () => {
    expect(cleanRect(b(100, 100, 50, 20), [])).toEqual(b(88, 88, 74, 44));
  });

  it("grows a side past a line of text it would have cut", () => {
    const line = b(60, 95, 200, 12);
    const c = cleanRect(b(100, 100, 50, 20), [line]);
    expect(contains(c, b(100, 100, 50, 20))).toBe(true);
    expect(cutsNoText(c, [line], 8)).toBe(true);
  });
});

describe("cursor parking", () => {
  it("stays put when nothing is under the cursor", () => {
    expect(freeSpot(400, 400, [])).toEqual({ x: 400, y: 400 });
  });

  it("moves off text, as little as it can", () => {
    const text = b(380, 390, 80, 20);
    const p = freeSpot(400, 400, [text]);
    const cursor = b(p.x - CURSOR_BOX.left, p.y - CURSOR_BOX.top, CURSOR_BOX.left + CURSOR_BOX.right, CURSOR_BOX.top + CURSOR_BOX.bottom);
    expect(intersects(cursor, text)).toBe(false);
    expect(Math.hypot(p.x - 400, p.y - 400)).toBeLessThan(80);
  });

  it("keeps the cursor inside the viewport and inside a given box", () => {
    expect(freeSpot(1, 1, [])).not.toEqual({ x: 1, y: 1 });
    const within = b(300, 300, 200, 200);
    const p = freeSpot(400, 400, [b(350, 350, 100, 100)], within);
    expect(contains(within, b(p.x, p.y, 1, 1))).toBe(true);
  });
});
