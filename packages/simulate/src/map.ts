import type { StructureGrid, WellLocation, WellStatus } from "@bgw/optimise";
import { Rng } from "./rng";

// Schematic field map. OIL does not publish well coordinates, so positions are
// drawn inside an outline sized to the field's published 200.26 km², with CSS
// wells near the crest where the pilot started and cold wells on the flanks.

export const FIELD_AREA_KM2 = 200.26;
const CENTER: [number, number] = [8, 6.4];
const CREST: [number, number] = [7.4, 5.6];

export function fieldOutline(r: Rng): [number, number][] {
  const p1 = r.uniform(0, Math.PI * 2);
  const p2 = r.uniform(0, Math.PI * 2);
  const shape = (th: number) => 1 + 0.13 * Math.sin(2 * th + p1) + 0.07 * Math.sin(3 * th + p2);
  const n = 96;
  // Scale so the polygon's area matches the published field area.
  let unitArea = 0;
  const unit: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const rr = shape(th);
    unit.push([rr * Math.cos(th) * 1.25, rr * Math.sin(th)]);
  }
  for (let i = 0; i < n; i++) {
    const [x1, y1] = unit[i]!;
    const [x2, y2] = unit[(i + 1) % n]!;
    unitArea += (x1 * y2 - x2 * y1) / 2;
  }
  const k = Math.sqrt(FIELD_AREA_KM2 / unitArea);
  return unit.map(([x, y]) => [Number((CENTER[0] + k * x).toFixed(3)), Number((CENTER[1] + k * y).toFixed(3))]);
}

/**
 * Places wells with a minimum spacing: CSS wells around the crest where the
 * pilot started, cold producers on the flanks, idle wells across the field.
 */
export function placeWells(
  wells: { number: number; status: WellStatus }[],
  pilot: number,
  r: Rng,
  minSpacing_km = 0.62,
): Map<number, WellLocation> {
  const placed = new Map<number, WellLocation>();
  const order = [...wells].sort((a, b) => rank(a.status) - rank(b.status) || a.number - b.number);
  for (const w of order) {
    if (w.number === pilot) {
      placed.set(w.number, { x_km: CREST[0], y_km: CREST[1] });
      continue;
    }
    const [rx, ry, cx, cy, inner] =
      w.status === "css"
        ? [3.1, 2.1, CREST[0], CREST[1], 0]
        : w.status === "cold"
          ? [5.0, 3.5, CREST[0] + 0.3, CREST[1] + 0.2, 0.55]
          : [6.2, 4.6, CENTER[0], CENTER[1], 0.3];
    let best: WellLocation = { x_km: cx, y_km: cy };
    let bestGap = -1;
    for (let tries = 0; tries < 80; tries++) {
      const a = r.uniform(0, Math.PI * 2);
      const d = inner + (1 - inner) * Math.sqrt(r.next());
      const x = cx + rx * d * Math.cos(a);
      const y = cy + ry * d * Math.sin(a);
      if (x < 1 || x > 15 || y < 1 || y > 11.8) continue;
      let gap = Infinity;
      for (const p of placed.values()) gap = Math.min(gap, Math.hypot(p.x_km - x, p.y_km - y));
      if (gap > bestGap) {
        bestGap = gap;
        best = { x_km: Number(x.toFixed(3)), y_km: Number(y.toFixed(3)) };
      }
      if (gap >= minSpacing_km) break;
    }
    placed.set(w.number, best);
  }
  return placed;
}

function rank(s: WellStatus): number {
  return s === "css" ? 0 : s === "cold" ? 1 : 2;
}

/** Top of the Jodhpur Sandstone: about 1,150 m, shallowest on the crest. */
export function structureGrid(r: Rng): StructureGrid {
  const step = 0.4;
  const nx = 41;
  const ny = 33;
  const bumps = Array.from({ length: 4 }, () => ({
    x: r.uniform(3, 13),
    y: r.uniform(2.5, 10),
    s: r.uniform(1.6, 3),
    h: r.uniform(-9, 9),
  }));
  const depth: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * step;
      const y = j * step;
      let z = 1188 - 52 * Math.exp(-(((x - CREST[0]) / 3.6) ** 2 + ((y - CREST[1]) / 2.6) ** 2));
      for (const b of bumps) z += b.h * Math.exp(-(((x - b.x) / b.s) ** 2 + ((y - b.y) / b.s) ** 2));
      z += 0.9 * (x - 8);
      depth.push(Number(z.toFixed(1)));
    }
  }
  return { nx, ny, x0_km: 0, y0_km: 0, step_km: step, depth_m: depth };
}
