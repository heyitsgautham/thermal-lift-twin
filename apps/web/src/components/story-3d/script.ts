// The story's script: when each scene runs, which day the twin shows, which
// pump practice it runs, where the camera is and which HUD panels are up.
// Everything is a pure function of story time, so any frame can be rendered on
// its own and a take is the same every time.

export const FPS = 30;

export interface Scene {
  id: string;
  title: string;
  start: number;
  end: number;
}

export const SCENES: Scene[] = [
  { id: "well", title: "The well", start: 0, end: 12 },
  { id: "cycle", title: "The steam cycle", start: 12, end: 32 },
  { id: "today", title: "Today", start: 32, end: 64 },
  { id: "apart", title: "Two decisions, made apart", start: 64, end: 76 },
  { id: "twin", title: "With the twin", start: 76, end: 104 },
  { id: "steam-date", title: "The steam date", start: 104, end: 122 },
  { id: "card", title: "Proof on the card", start: 122, end: 137 },
  { id: "field", title: "Nineteen wells, shared steam", start: 137, end: 161 },
  { id: "year", title: "A year on the field", start: 161, end: 176 },
  { id: "sources", title: "How we built it", start: 176, end: 198 },
  { id: "end", title: "End card", start: 198, end: 206 },
];

export const DURATION = SCENES.at(-1)!.end;

export function sceneAt(t: number): Scene {
  return SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES.at(-1)!;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 0 before `a`, 1 from `a + fade` to `b - fade`, 0 after `b`, smooth ramps between. */
export function windowAlpha(t: number, a: number, b: number, fade = 0.45): number {
  return Math.min(smooth((t - a) / fade), smooth((b - t) / fade));
}

type Key = readonly [number, number];

function piecewise(keys: readonly Key[], t: number, eased = false): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    const [t0, v0] = keys[i - 1]!;
    if (t < t1) {
      const k = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return lerp(v0, v1, eased ? smooth(k) : k);
    }
  }
  return keys.at(-1)![1];
}

/** The well stage runs to the card scene; the field stage takes over after it. */
export const FIELD_FROM = 137;
export const stageAt = (t: number): "well" | "field" => (t < FIELD_FROM ? "well" : "field");

// Day the well stage shows, relative to the as-of date (28 Sep 2026 = 0).
// -75 is the day before cycle 5's steam, 30 the twin's steam day, 44 the booked slot.
const DAY_KEYS: Key[] = [
  [0, -75],
  [12.6, -75],
  [13.2, -74],
  [22, -62],
  [25, -57],
  [32, -50],
  [48, 20],
  [52, 27],
  [62, 44],
  [64, 45.5],
  [76.8, 48],
  [78.6, -57],
  [80.6, -57],
  [98, 15],
  [104, 29],
  [106, 30],
  [116, 44],
  [122, 46],
  [122, 29],
  [137, 29],
];

/** The rewind in the twin scene is a drag of the playhead, so it eases. */
export function dayAt(t: number): number {
  if (t > 76.8 && t < 78.6) return piecewise(DAY_KEYS, 76.8, false) + (-57 - 48) * smooth((t - 76.8) / 1.8);
  return piecewise(DAY_KEYS, t);
}

export type Mode = "today" | "twin";

/** The Twin toggle is clicked at 79.6 s. The card scene shows constant speed, then the twin. */
export const TWIN_CLICK = 79.6;
export function modeAt(t: number): Mode {
  if (t < TWIN_CLICK) return "today";
  if (t >= 122 && t < 129.5) return "today";
  return "twin";
}

/** Field stage: the day the 3D field shows, 7 Nov, the first overloaded day. */
export const FIELD_DAY = 40;

// Field beat timings.
export const FIELD = {
  hudIn: 139,
  dragStart: 144.8,
  dragEnd: 148,
  overloadHold: 151.5,
  resolved: 153,
  adoptClick: 158,
} as const;

export type FieldStage = "issued" | "dragging" | "overload" | "resolving" | "resolved";

export function fieldStageAt(t: number): FieldStage {
  if (t < FIELD.dragStart) return "issued";
  if (t < FIELD.dragEnd) return "dragging";
  if (t < FIELD.overloadHold) return "overload";
  if (t < FIELD.resolved) return "resolving";
  return "resolved";
}

/** Share of BGW-14's drag done, 0 to 1. */
export const dragProgress = (t: number) => smooth((t - FIELD.dragStart) / (FIELD.dragEnd - FIELD.dragStart));
/** Share of BGW-22's move done, 0 to 1. */
export const repairProgress = (t: number) => smooth((t - FIELD.resolved) / 1.1);

// Camera.

export interface View {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const VIEWS = {
  heroFar: { pos: [34, 17, 40], target: [-1, 1.5, -2], fov: 34 },
  heroNear: { pos: [22, 10.5, 27], target: [-3, 3.2, 0], fov: 34 },
  surface: { pos: [17, 7.2, 19], target: [-0.6, 3.6, -1.6], fov: 34 },
  surfaceSide: { pos: [5.5, 6.2, 20], target: [-2.6, 4.6, 0], fov: 34 },
  surfaceSide2: { pos: [10, 5.4, 17], target: [-1.8, 4.4, 0], fov: 34 },
  sink: { pos: [10.5, -9, 12.5], target: [0.6, -13, 0.6], fov: 36 },
  down: { pos: [9.5, -29.6, 11.5], target: [0.6, -33.6, 0.6], fov: 36 },
  down2: { pos: [11, -29, 9.6], target: [0.6, -33.4, 0.6], fov: 36 },
  cut: { pos: [80, -2, 88], target: [-1, -22, -1], fov: 34.5 },
  cut2: { pos: [72, 4, 94], target: [-1, -22, -1], fov: 34.5 },
  orbitA: { pos: [30, 9, 34], target: [-3, 2, -2], fov: 34 },
  orbitB: { pos: [40, 8, 22], target: [-3, 2, -2], fov: 34 },
  downCard: { pos: [13.5, -33.4, 16], target: [7.4, -33.4, 3.4], fov: 38 },
  downCard2: { pos: [14.5, -33.4, 14.5], target: [7.8, -33.4, 3], fov: 38 },
  float: { pos: [11.2, -31.6, 12.4], target: [0.4, -33.9, 0.4], fov: 34 },
  fieldLow: { pos: [30, 14, 42], target: [0, 2, 0], fov: 38 },
  fieldAerial: { pos: [70, 92, 118], target: [-4, 0, 6], fov: 38 },
  fieldAerial2: { pos: [96, 80, 104], target: [-4, 0, 6], fov: 38 },
  fieldOrbit: { pos: [118, 70, 60], target: [-4, 0, 6], fov: 38 },
  fieldFar: { pos: [118, 84, -34], target: [-4, 0, 6], fov: 38 },
} satisfies Record<string, View>;

type ViewName = keyof typeof VIEWS;

const CAMERA_KEYS: [number, ViewName][] = [
  [0, "heroFar"],
  [2.5, "heroFar"],
  [6.6, "surface"],
  [8.4, "surface"],
  [9.8, "sink"],
  [11.2, "down"],
  [13.4, "down"],
  [17.5, "cut"],
  [31, "cut"],
  [34, "cut2"],
  [51.5, "cut2"],
  [54.8, "float"],
  [61.6, "float"],
  [64.6, "cut"],
  [67.5, "orbitA"],
  [75.5, "orbitB"],
  [78.4, "cut"],
  [81.6, "cut"],
  [84.2, "surfaceSide"],
  [92, "surfaceSide2"],
  [95.2, "float"],
  [102.6, "float"],
  [106, "cut"],
  [121.5, "cut2"],
  [123.5, "downCard"],
  [136.4, "downCard2"],
  [137, "fieldLow"],
  [142, "fieldAerial"],
  [161, "fieldAerial2"],
  [176, "fieldOrbit"],
  [198, "fieldFar"],
  [206, "fieldFar"],
];

type V3 = [number, number, number];
const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const len3 = (p: V3) => Math.hypot(p[0], p[1], p[2]);
const scale3 = (p: V3, k: number): V3 => [p[0] * k, p[1] * k, p[2] * k];

/** Tangent through a key, no longer than the chord it leads into, so a far neighbour cannot fling the camera. */
function tangent(prev: V3, next: V3, chord: number): V3 {
  const m = scale3(sub(next, prev), 0.5);
  const l = len3(m);
  return l > chord ? scale3(m, chord / l) : m;
}

function hermite(a: V3, b: V3, ma: V3, mb: V3, u: number): V3 {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return [0, 1, 2].map((c) => h00 * a[c]! + h10 * ma[c]! + h01 * b[c]! + h11 * mb[c]!) as V3;
}

/**
 * The camera between keys: a Hermite curve that comes to rest at a held key and
 * flows through a key it only passes, with tangents clamped to the chord.
 */
export function cameraAt(t: number): View {
  const keys = CAMERA_KEYS;
  const i = keys.findIndex(([kt]) => kt > t);
  if (i === -1) return VIEWS[keys.at(-1)![1]];
  if (i === 0) return VIEWS[keys[0]![1]];
  const [t0, n0] = keys[i - 1]!;
  const [t1, n1] = keys[i]!;
  const a = VIEWS[n0];
  const b = VIEWS[n1];
  if (n0 === n1) return a;
  // The cut to the field is a hard cut behind a fade, not a flight.
  if (n1.startsWith("field") && !n0.startsWith("field")) return a;
  const holdBefore = i < 2 || keys[i - 2]![1] === n0;
  const holdAfter = i + 1 >= keys.length || keys[i + 1]![1] === n1;
  const prev = holdBefore ? null : VIEWS[keys[i - 2]![1]];
  const next = holdAfter ? null : VIEWS[keys[i + 1]![1]];
  const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  const path = (f: (v: View) => V3) => {
    const chord = len3(sub(f(b), f(a)));
    const ma: V3 = prev ? tangent(f(prev), f(b), chord) : [0, 0, 0];
    const mb: V3 = next ? tangent(f(a), f(next), chord) : [0, 0, 0];
    return hermite(f(a), f(b), ma, mb, u);
  };
  return { pos: path((v) => v.pos), target: path((v) => v.target), fov: lerp(a.fov, b.fov, smooth(u)) };
}

// HUD windows, in story seconds.
export const HUD = {
  lowerThird: [0.8, 9.6],
  callouts: [3.0, 12.4],
  readouts: [12.2, 122.8],
  timeline: [11.0, 136.8],
  mode: [31.6, 136.8],
  floatCounter: [47.5, 122.8],
  apart: [65.4, 75.8],
  beforeAfter: [109.5, 122],
  card: [123.2, 136.6],
  fade: [136.3, 137.9],
  fieldHud: [FIELD.hudIn, 161.2],
  year: [161.6, 176.2],
  sources: [176.6, 198.2],
  end: [198.4, 207],
} as const satisfies Record<string, readonly [number, number]>;

export const hud = (t: number, key: keyof typeof HUD, fade?: number) => windowAlpha(t, HUD[key][0], HUD[key][1], fade);

// The drawn cursor: which control it is on and when it presses.

export interface CursorKey {
  t: number;
  /** A data-cursor id in the HUD, or a fixed point in 1600 x 900 page pixels. */
  at: string | [number, number];
  press?: boolean;
}

export const CURSOR: CursorKey[] = [
  { t: 10.6, at: [880, 560] },
  { t: 12.2, at: "play" },
  { t: 12.6, at: "play", press: true },
  { t: 12.95, at: "play" },
  { t: 13.9, at: [940, 700] },
  { t: 75.4, at: [980, 640] },
  { t: 76.6, at: "playhead" },
  { t: 76.8, at: "playhead", press: true },
  { t: 78.6, at: "playhead", press: true },
  { t: 78.8, at: "playhead" },
  { t: 79.3, at: "mode-twin" },
  { t: 79.6, at: "mode-twin", press: true },
  { t: 79.9, at: "mode-twin" },
  { t: 80.35, at: "play" },
  { t: 80.5, at: "play", press: true },
  { t: 80.8, at: "play" },
  { t: 81.9, at: [980, 700] },
  { t: 143.4, at: [1040, 520] },
  { t: 144.6, at: "slot-BGW-14" },
  { t: 144.8, at: "slot-BGW-14", press: true },
  { t: 148, at: "slot-BGW-14", press: true },
  { t: 148.4, at: "slot-BGW-14" },
  { t: 149.4, at: [1080, 360] },
  { t: 157.4, at: "adopt" },
  { t: 158, at: "adopt", press: true },
  { t: 158.35, at: "adopt" },
  { t: 159.6, at: [1300, 760] },
];

/** Cursor windows: shown between the first and last key of each group, with a short fade. */
export const CURSOR_WINDOWS: [number, number][] = [
  [10.6, 14.2],
  [75.4, 82.2],
  [143.4, 160],
];
