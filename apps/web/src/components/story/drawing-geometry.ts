import { clamp } from "./data";

// The cross-section's fixed geometry, in the drawing's own units: the pumping
// unit's linkage, the depth scale, the rock layers, and where the inset sits.

export const W = 1040;
export const H = 660;
export const GROUND = 262;
export const WELL_X = 270;
export const PIVOT = { x: 420, y: 112 };
export const R_HEAD = 150;
export const REAR = 118;
export const AMAX = (9.5 * Math.PI) / 180;
export const GEAR = { x: PIVOT.x + REAR, y: PIVOT.y + 94 };
export const CRANK_R = REAR * Math.sin(AMAX);
export const CARRIER_BOTTOM = 198;
export const TRAVEL = R_HEAD * 2 * AMAX;
export const STUFFING_Y = 208;
export const TEE_Y = 222;

export const depthY = (m: number) => GROUND + 10 + (m * 268) / 1100;
export const PAY_TOP = depthY(1150);
export const PUMP_TOP = depthY(1100) - 26;
export const PUMP_BOTTOM = PUMP_TOP + 32;
export const GLOW = { x: WELL_X, y: (PAY_TOP + 646) / 2 };
export const INSET = { x: 424, y: 290, w: 500, h: 238 };

/** Rock layers, top down. Each top boundary undulates a little, so the section reads as rock, not a chart. */
export const STRATA = [
  { top: GROUND, fill: "#eadabc", pattern: "p-dots-fine", amp: 0, phase: 0 },
  { top: depthY(185), fill: "#dfc9a4", pattern: "p-lines", amp: 3.5, phase: 0.4 },
  { top: depthY(330), fill: "#e4d2b0", pattern: "p-dots-fine", amp: 2.5, phase: 2.1 },
  { top: depthY(440), fill: "#d5bf9b", pattern: "p-bricks", amp: 4, phase: 1.2 },
  { top: depthY(660), fill: "#c9af8b", pattern: "p-lines-fine", amp: 3, phase: 2.6 },
  { top: depthY(800), fill: "#bfa382", pattern: "p-lines", amp: 2.5, phase: 0.9 },
  { top: depthY(880), fill: "#a89276", pattern: "p-lines-fine", amp: 2, phase: 3.3 },
  { top: depthY(1080), fill: "#948068", pattern: "p-lines-fine", amp: 1.5, phase: 1.7 },
  { top: PAY_TOP, fill: "#dcb271", pattern: "p-sand", amp: 1.2, phase: 0.2 },
];

export function wavyTop(y: number, amp: number, phase: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 20) {
    const dy = amp * (Math.sin(x / 97 + phase) + 0.45 * Math.sin(x / 41 + phase * 2.3));
    pts.push(`${x} ${(y + dy).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

export const DEPTHS = [0, 300, 600, 900, 1150];

export interface PumpjackPose {
  /** Walking beam angle, degrees; positive lifts the horsehead. */
  deg: number;
  /** Where the pitman meets the beam's rear end. */
  rear: { x: number; y: number };
  /** The crank pin on the gear reducer. */
  pin: { x: number; y: number };
  /** Crank arm angle, degrees. */
  crankDeg: number;
  /** Top of the carrier bar on the polished rod. */
  carrierY: number;
}

/**
 * The walking beam, crank and pitman for a polished-rod position p, 0 at the
 * bottom of the stroke and 1 at the top. The crank turns one way, so the
 * upstroke and the downstroke put the pin on opposite sides of the gear.
 */
export function pumpjackPose(p: number, upstroke: boolean): PumpjackPose {
  const theta = AMAX * (2 * p - 1);
  const deg = (theta * 180) / Math.PI;
  const rear = { x: PIVOT.x + REAR * Math.cos(theta), y: PIVOT.y + REAR * Math.sin(theta) };
  const acos = Math.acos(clamp(1 - 2 * p, -1, 1));
  const phi = upstroke ? acos : 2 * Math.PI - acos;
  const pin = { x: GEAR.x + CRANK_R * Math.sin(phi), y: GEAR.y - CRANK_R * Math.cos(phi) };
  const out = { x: (pin.x - GEAR.x) / CRANK_R, y: (pin.y - GEAR.y) / CRANK_R };
  const crankDeg = (Math.atan2(out.y, out.x) * 180) / Math.PI;
  const carrierY = CARRIER_BOTTOM - p * TRAVEL;
  return { deg, rear, pin, crankDeg, carrierY };
}
