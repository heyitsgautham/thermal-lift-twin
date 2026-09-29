import type { WellStory } from "./engine";
import { momentAt } from "./data";
import { DURATION, dayAt, modeAt, stageAt } from "./script";

// Stroke timing and rod float, for drawing. The pumpjack runs one visual stroke
// every 2.4 s of story time at 3 SPM and proportionally slower below it, so the
// shape of a stroke stays readable while days fly past.

export const SECONDS_PER_STROKE_AT_3_SPM = 2.4;
const TABLE_HZ = 120;

/** Cumulative stroke count over story time, integrated once so any frame can be drawn on its own. */
export function strokeTable(well: WellStory): Float64Array {
  const n = Math.ceil(DURATION * TABLE_HZ) + 2;
  const out = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    out[i] = p;
    const t = i / TABLE_HZ;
    if (stageAt(t) !== "well") continue;
    const m = momentAt(well, modeAt(t), dayAt(t));
    if (m.pumping) p += m.spm / 3 / SECONDS_PER_STROKE_AT_3_SPM / TABLE_HZ;
  }
  return out;
}

export function strokesAt(table: Float64Array, t: number): number {
  const x = Math.max(0, t * TABLE_HZ);
  const i = Math.min(table.length - 2, Math.floor(x));
  return table[i]! + (table[i + 1]! - table[i]!) * (x - i);
}

/** Polished-rod position over one stroke, 0 at the bottom, 1 at the top: half-cosines, the upstroke first. */
export function carrierAt(phase: number, upstrokeFraction: number): number {
  const p = phase - Math.floor(phase);
  if (p < upstrokeFraction) return 0.5 * (1 - Math.cos((Math.PI * p) / upstrokeFraction));
  return 0.5 * (1 + Math.cos((Math.PI * (p - upstrokeFraction)) / (1 - upstrokeFraction)));
}

export interface RodState {
  /** Carrier bar position, 0 bottom to 1 top of stroke. */
  carrier: number;
  /** Rod string position on the same scale; above the carrier while the rods float. */
  rods: number;
  /** Rods above carrier, stroke fractions. */
  gap: number;
  /** 1 at the instant the carrier bar catches the rods, decaying over the next part of the stroke. */
  jolt: number;
}

const STEPS = 90;

/**
 * Rod float within one stroke. On the downstroke the rods cannot fall faster
 * than their terminal speed in the crude, which is the peak polished-rod speed
 * over the float ratio. When the unit lowers the carrier bar faster than that,
 * the clamp leaves the bar; the rods keep sinking at terminal speed until the
 * bar, now coming back up, catches them. That catch is the impact load.
 */
export function rodStateAt(phase: number, upstrokeFraction: number, floatRatio: number): RodState {
  const uf = upstrokeFraction;
  const p = phase - Math.floor(phase);
  const carrier = carrierAt(p, uf);
  if (floatRatio <= 1) return { carrier, rods: carrier, gap: 0, jolt: 0 };
  // Terminal fall speed in stroke fractions per unit phase: the downstroke's peak carrier speed over the ratio.
  const vFall = Math.PI / 2 / (1 - uf) / floatRatio;
  // Start at the top of the downstroke that precedes this phase; phases below 0 belong to the previous stroke.
  const from = p >= uf ? uf : uf - 1;
  const span = Math.max(1e-9, p - from);
  let rods = 1;
  let caught: number | null = null;
  for (let s = 1; s <= STEPS; s++) {
    const q = from + (span * s) / STEPS;
    const c = carrierAt(q, uf);
    const fallen = rods - (vFall * span) / STEPS;
    if (caught === null && q >= 0 && q < uf && fallen <= c) caught = q;
    rods = caught !== null ? c : Math.max(c, fallen);
  }
  const jolt = caught !== null ? Math.exp(-Math.max(0, p - caught) / 0.11) : 0;
  return { carrier, rods, gap: Math.max(0, rods - carrier), jolt };
}

/**
 * Cumulative flow for the moving crude and steam, integrated like the strokes:
 * crude moves in proportion to the oil rate, steam at a fixed pace while it goes in.
 */
export function flowTable(well: WellStory): { oil: Float64Array; steam: Float64Array } {
  const n = Math.ceil(DURATION * TABLE_HZ) + 2;
  const oil = new Float64Array(n);
  const steam = new Float64Array(n);
  let o = 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    oil[i] = o;
    steam[i] = s;
    const t = i / TABLE_HZ;
    if (stageAt(t) !== "well") continue;
    const m = momentAt(well, modeAt(t), dayAt(t));
    if (m.pumping) o += (0.12 + m.oil_bbl_per_d / 70) / TABLE_HZ;
    if (m.phase === "steam") s += 0.55 / TABLE_HZ;
  }
  return { oil, steam };
}
