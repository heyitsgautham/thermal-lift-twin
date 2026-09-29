"use client";

import { clamp, easeOut, smoothstep } from "./data";

// Parts of the BGW-14 cross-section that carry the story: the heated zone in
// the sandstone and the pump at 1,100 m, magnified. Both read the story clock
// and the engine's state for the day in view, nothing else.

type Rgb = [number, number, number];

const HEAT_RAMP: [number, Rgb][] = [
  [0, [110, 28, 12]],
  [0.18, [168, 44, 20]],
  [0.4, [214, 88, 34]],
  [0.65, [243, 150, 22]],
  [0.85, [250, 205, 120]],
  [1, [255, 244, 222]],
];

function rampAt(stops: [number, Rgb][], x: number): Rgb {
  const k = clamp(x, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i]!;
    const [x0, c0] = stops[i - 1]!;
    if (k <= x1) {
      const f = (k - x0) / (x1 - x0);
      return [0, 1, 2].map((j) => Math.round(c0[j]! + (c1[j]! - c0[j]!) * f)) as Rgb;
    }
  }
  return stops.at(-1)![1];
}

const rgb = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

/**
 * The steamed lens of sandstone around the well. `heat` is 0 at the rock's own
 * temperature and 1 at the cycle's hottest day: at 1 it is wide and white-hot,
 * as it cools it shrinks and reddens down to an ember at the wellbore.
 */
export function HeatLens({ x, y, heat, t }: { x: number; y: number; heat: number; t: number }) {
  const h = clamp(heat, 0, 1);
  const breathe = h < 0.25 ? 1 + 0.05 * Math.sin(t / 650) : 1;
  const rx = (58 + 400 * Math.pow(h, 0.72)) * breathe;
  const ry = (13 + 34 * h) * breathe;
  const lens = `M${x - rx} ${y} Q${x} ${y - 2 * ry} ${x + rx} ${y} Q${x} ${y + 2 * ry} ${x - rx} ${y} Z`;
  // At the rock's own temperature there is no heated zone to draw.
  const present = smoothstep(0, 0.06, h);
  return (
    <g opacity={present}>
      <defs>
        <radialGradient id="lens-fill" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={rgb(rampAt(HEAT_RAMP, h))} stopOpacity={0.98} />
          <stop offset="0.45" stopColor={rgb(rampAt(HEAT_RAMP, h - 0.22))} stopOpacity={0.9} />
          <stop offset="0.8" stopColor={rgb(rampAt(HEAT_RAMP, h - 0.45))} stopOpacity={0.7} />
          <stop offset="1" stopColor={rgb(rampAt(HEAT_RAMP, h - 0.6))} stopOpacity={0} />
        </radialGradient>
        <filter id="lens-halo" x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation={10 + 8 * h} />
        </filter>
        <filter id="lens-edge" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation={2.5} />
        </filter>
      </defs>
      <ellipse cx={x} cy={y} rx={rx * 1.2} ry={ry * 2} fill={rgb(rampAt(HEAT_RAMP, h * 0.7))} opacity={0.22 + 0.3 * h} filter="url(#lens-halo)" />
      <path d={lens} fill="url(#lens-fill)" filter="url(#lens-edge)" />
      <ellipse cx={x} cy={y} rx={rx * 0.28} ry={ry * 0.55} fill={rgb(rampAt(HEAT_RAMP, h + 0.12))} opacity={0.35 + 0.6 * h} filter="url(#lens-edge)" />
    </g>
  );
}

const STEEL = "#8a7b6c";
const STEEL_DARK = "#5a4636";

export interface InsetState {
  /** Polished-rod position over the stroke, 0 at the bottom, 1 at the top. */
  p: number;
  upstroke: boolean;
  /** How far the string bows slack right now, 0 when it is loaded. */
  slack: number;
  /** 0 to 1 over a slam's shock, null between slams. */
  slam: number | null;
  phase: "rest" | "steam" | "soak" | "produce";
  floats: boolean;
  tubingViscosity_cP: number;
  flow: number;
  steamFlow: number;
  /** Peak speed the unit lowers the polished rod on the downstroke, m/s. Null while the pump is off. */
  lowerSpeed: number | null;
  /** Fastest the rods can sink through the crude in the tubing, m/s. */
  sinkSpeed: number;
}

function crudeColour(cP: number): string {
  const k = clamp((Math.log10(cP) - 2) / (Math.log10(15_000) - 2), 0, 1);
  const light: Rgb = [196, 140, 70];
  const dark: Rgb = [52, 32, 18];
  return rgb([0, 1, 2].map((j) => Math.round(light[j]! + (dark[j]! - light[j]!) * k)) as Rgb);
}

/** Downstroke speed against the speed the rods can sink: past it, the string goes slack. */
function SpeedBlock({ x, y, w, lower, sink }: { x: number; y: number; w: number; lower: number | null; sink: number }) {
  const max = 0.8;
  const barW = w - 104;
  const bar = (v: number) => Math.max(3, Math.min(1, v / max) * barW);
  // In thin crude the rods could fall far faster than any unit lowers them; past 2 m/s the number says nothing more.
  const speed = (v: number) => (v > 2 ? "over 2 m/s" : `${v.toFixed(2)} m/s`);
  const over = lower !== null && lower >= sink;
  const tone = over ? "var(--alert)" : "var(--produce)";
  const text = { fontFamily: "var(--font-archivo)" };
  return (
    <g>
      <path d={`M${x - 14} ${y - 8} V${y + 172}`} stroke="var(--rule-strong)" />
      <text x={x} y={y + 6} fontSize={14} fontWeight={700} letterSpacing="0.06em" fill="var(--ink)" style={text}>
        DOWNSTROKE
      </text>
      {lower === null ? (
        <>
          <text x={x} y={y + 40} fontSize={14} fontWeight={700} fill="var(--ink-3)" style={text}>
            Pump off
          </text>
          <text x={x} y={y + 60} fontSize={14} fill="var(--ink-3)" style={text}>
            no strokes while the
          </text>
          <text x={x} y={y + 78} fontSize={14} fill="var(--ink-3)" style={text}>
            steam goes in and soaks
          </text>
        </>
      ) : (
        <>
          <text x={x} y={y + 34} fontSize={14} fill="var(--ink-2)" style={text}>
            unit lowers the rods
          </text>
          <rect x={x} y={y + 42} width={bar(lower)} height={14} rx={2} fill={tone} />
          <text x={x + w} y={y + 54} textAnchor="end" fontSize={14} fontWeight={700} fill={tone} className="font-mono">
            {speed(lower)}
          </text>
          <text x={x} y={y + 86} fontSize={14} fill="var(--ink-2)" style={text}>
            rods can sink
          </text>
          <rect x={x} y={y + 94} width={bar(sink)} height={14} rx={2} fill="var(--ink-3)" />
          <text x={x + w} y={y + 106} textAnchor="end" fontSize={14} fontWeight={700} fill="var(--ink)" className="font-mono">
            {speed(sink)}
          </text>
          {sink <= max && <path d={`M${x + bar(sink)} ${y + 39} V${y + 59}`} stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="3 2" />}
          <text x={x} y={y + 140} fontSize={14} fontWeight={700} fill={tone} style={text}>
            {over ? "Faster than they sink" : "Slower than they sink"}
          </text>
          <text x={x} y={y + 160} fontSize={14} fill="var(--ink-2)" style={text}>
            {over ? "so the string goes slack" : "so the string stays loaded"}
          </text>
        </>
      )}
    </g>
  );
}

/** The pump at 1,100 m, magnified: rods, plunger, barrel and both valves. */
export function PumpInset({ x, y, w, h, s, from }: { x: number; y: number; w: number; h: number; s: InsetState; from: { x: number; y: number } }) {
  const cx = 104;
  const head = 38;
  const tubeHalf = 34;
  const barrelTop = 124;
  const barrelHalf = 30;
  const seatY = h - 22;
  const plungerH = 34;
  const travel = seatY - 12 - plungerH - (barrelTop + 10);
  const pumping = s.phase === "produce";
  const plungerTop = barrelTop + 10 + (1 - s.p) * travel;
  const jolt = s.slam !== null ? 3.2 * (1 - s.slam) * Math.sin(s.slam * 40) : 0;
  const bow = s.slack * 2.6;
  const crude = s.phase === "steam" ? "#f6d9c6" : crudeColour(s.tubingViscosity_cP);
  const rodPts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const yy = head + (plungerTop - head) * f;
    const xx = cx + jolt + bow * Math.sin(Math.PI * f) * Math.sin(3 * Math.PI * f + 0.4);
    rodPts.push(`${xx.toFixed(2)},${yy.toFixed(2)}`);
  }
  const rodAt = (f: number) => rodPts[Math.round(f * 40)]!.split(",").map(Number) as [number, number];
  const slack = s.slack > 0.6;
  const state = !pumping ? "off" : s.floats ? "float" : "loaded";
  const chip =
    state === "float"
      ? { text: "Rods floating", bg: "var(--alert)", fg: "#fbf4e8" }
      : state === "loaded"
        ? { text: "Rods loaded", bg: "var(--produce)", fg: "#fbf4e8" }
        : { text: "Pump off", bg: "var(--sand-deep)", fg: "var(--ink-2)" };
  const travelOpen = pumping && !s.upstroke;
  const standingOpen = pumping && s.upstroke;
  const flash = s.slam !== null ? 1 - s.slam : 0;
  const labelX = cx + 84;
  const speedX = labelX + 108;
  return (
    <g>
      <path d={`M${from.x + 22} ${from.y - 18} L${x} ${y + 8} M${from.x + 22} ${from.y + 18} L${x} ${y + h - 8}`} stroke="var(--ink)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.7} />
      <circle cx={from.x} cy={from.y} r={27} fill="none" stroke="var(--ink)" strokeWidth={1.6} />
      <rect x={x + 3} y={y + 4} width={w} height={h} rx={6} fill="rgb(47 33 24 / 0.18)" />
      <g transform={`translate(${x} ${y})`}>
        <clipPath id="inset-clip">
          <rect width={w} height={h} rx={6} />
        </clipPath>
        <g clipPath="url(#inset-clip)">
          <rect width={w} height={h} fill="#f3ead9" />
          <rect width={w} height={h} fill="url(#p-sand)" opacity={0.5} />
          <rect x={0} y={0} width={w} height={head - 4} fill="rgb(251 247 240 / 0.96)" />
          <path d={`M0 ${head - 4} H${w}`} stroke="var(--rule-strong)" />
          <text x={14} y={24} fontSize={14} fontWeight={700} letterSpacing="0.08em" fill="var(--ink)" style={{ fontFamily: "var(--font-archivo)" }}>
            PUMP AT 1,100 m
          </text>
          <rect x={w - 134} y={8} width={122} height={20} rx={3} fill={chip.bg} />
          <text x={w - 73} y={23} textAnchor="middle" fontSize={14} fontWeight={700} fill={chip.fg} style={{ fontFamily: "var(--font-archivo)" }}>
            {chip.text}
          </text>
          <g transform={`translate(${jolt} 0)`}>
            <rect x={cx - tubeHalf} y={head - 4} width={tubeHalf * 2} height={barrelTop - head + 8} fill={crude} />
            <rect x={cx - barrelHalf} y={barrelTop} width={barrelHalf * 2} height={seatY - barrelTop} fill={crude} />
            {s.phase === "steam" && (
              <path d={`M${cx - 16} ${head} V${seatY} M${cx + 16} ${head} V${seatY}`} stroke="#ffffff" strokeWidth={6} strokeDasharray="9 11" strokeDashoffset={s.steamFlow * 0.6} />
            )}
            {pumping && (
              <path d={`M${cx - 22} ${plungerTop - 4} V${head} M${cx + 22} ${plungerTop - 4} V${head}`} stroke="rgb(255 240 210 / 0.35)" strokeWidth={3} strokeDasharray="5 12" strokeDashoffset={s.flow * 0.5} />
            )}
            <rect x={cx - tubeHalf - 7} y={head - 4} width={7} height={barrelTop - head + 8} fill={STEEL} stroke={STEEL_DARK} />
            <rect x={cx + tubeHalf} y={head - 4} width={7} height={barrelTop - head + 8} fill={STEEL} stroke={STEEL_DARK} />
            <path d={`M${cx - tubeHalf - 7} ${barrelTop + 4} L${cx - barrelHalf - 9} ${barrelTop + 12} M${cx + tubeHalf + 7} ${barrelTop + 4} L${cx + barrelHalf + 9} ${barrelTop + 12}`} stroke={STEEL_DARK} strokeWidth={2} />
            <rect x={cx - barrelHalf - 9} y={barrelTop + 8} width={9} height={seatY - barrelTop + 4} fill="#6d5e50" stroke={STEEL_DARK} />
            <rect x={cx + barrelHalf} y={barrelTop + 8} width={9} height={seatY - barrelTop + 4} fill="#6d5e50" stroke={STEEL_DARK} />
            <rect x={cx - barrelHalf - 9} y={seatY} width={barrelHalf * 2 + 18} height={10} fill={STEEL_DARK} />
            <path d={`M${cx - 10} ${seatY} L${cx - 5} ${seatY - 4} H${cx + 5} L${cx + 10} ${seatY}`} fill="#3b2a1e" />
            <circle cx={cx} cy={seatY - (standingOpen ? 14 : 7)} r={7} fill="#d9d2c6" stroke="#2f2118" strokeWidth={1.2} />
          </g>
          <polyline points={rodPts.join(" ")} fill="none" stroke={slack ? "var(--alert)" : "#d9d2c6"} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={rodPts.join(" ")} fill="none" stroke={slack ? "#f08c7a" : "#f3efe8"} strokeWidth={2.5} strokeLinejoin="round" opacity={0.8} />
          {[0.22, 0.58].map((f) => {
            const [rx, ry] = rodAt(f);
            return <rect key={f} x={rx - 8} y={ry - 7} width={16} height={14} rx={2} fill={slack ? "#b5301f" : "#b8aa99"} stroke="#2f2118" strokeWidth={1.1} />;
          })}
          <g transform={`translate(${jolt} 0)`}>
            <rect x={cx - barrelHalf + 3} y={plungerTop} width={(barrelHalf - 3) * 2} height={plungerH} rx={3} fill="#cfc6ba" stroke="#2f2118" strokeWidth={1.3} />
            {[0.3, 0.55, 0.8].map((f) => (
              <path key={f} d={`M${cx - barrelHalf + 5} ${plungerTop + plungerH * f} H${cx + barrelHalf - 5}`} stroke="#8a7b6c" strokeWidth={1} />
            ))}
            <circle cx={cx} cy={plungerTop + plungerH - (travelOpen ? 13 : 7)} r={6} fill="#efe9df" stroke="#2f2118" strokeWidth={1.1} />
          </g>
          {s.slam !== null && (
            <g>
              <circle cx={cx} cy={plungerTop + plungerH} r={14 + 70 * easeOut(s.slam)} fill="none" stroke="var(--alert)" strokeWidth={5 * (1 - s.slam) + 0.6} opacity={1 - s.slam} />
              <circle cx={cx} cy={plungerTop + plungerH} r={8 + 38 * easeOut(s.slam)} fill="none" stroke="var(--alert)" strokeWidth={3} opacity={0.85 * (1 - s.slam)} />
              <text x={cx - barrelHalf - 14} y={plungerTop + plungerH + 6} textAnchor="end" fontSize={16} fontWeight={800} fill="var(--alert)" opacity={Math.min(1, flash * 1.6)} style={{ fontFamily: "var(--font-archivo)" }}>
                slam
              </text>
            </g>
          )}
          <g fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
            <path d={`M${cx + tubeHalf + 12} ${head + 40} H${labelX - 6}`} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={labelX} y={head + 45}>
              rod string
            </text>
            <path d={`M${cx + barrelHalf + 14} ${plungerTop + plungerH / 2} H${labelX - 6}`} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={labelX} y={plungerTop + plungerH / 2 + 5}>
              plunger
            </text>
            <path d={`M${cx + barrelHalf + 14} ${seatY - 8} H${labelX - 6}`} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={labelX} y={seatY - 3}>
              barrel, valve
            </text>
          </g>
          <SpeedBlock x={speedX} y={head + 16} w={w - speedX - 16} lower={pumping ? s.lowerSpeed : null} sink={s.sinkSpeed} />
          <rect width={w} height={h} rx={6} fill="none" stroke={s.slam !== null ? `rgb(204 31 26 / ${0.4 + 0.6 * flash})` : "var(--ink)"} strokeWidth={s.slam !== null ? 3 : 1.6} />
        </g>
      </g>
    </g>
  );
}
