"use client";

import { apiToSpecificGravity, peakDownstrokeSpeed_m_per_s, polishedRodPosition_m, rodFallSpeed_m_per_s } from "@bgw/physics";
import { shortDate } from "@/lib/dates";
import { fmtFixed } from "@/lib/format";
import { clamp, dayView, easeOut, runOf, since, storyData } from "./data";
import { HeatLens, PumpInset } from "./well-parts";
import type { StoryState } from "./store";

// BGW-14 from the pumping unit to the Jodhpur Sandstone, drawn as a technical
// cross-section. Surface equipment is to scale with itself; the wellbore is
// drawn wider than scale and the depth is compressed. Every moving part reads
// the story clock and the engine's state for the day in view.

const W = 1040;
const H = 660;
const GROUND = 262;
const WELL_X = 270;
const PIVOT = { x: 420, y: 112 };
const R_HEAD = 150;
const REAR = 118;
const AMAX = (9.5 * Math.PI) / 180;
const GEAR = { x: PIVOT.x + REAR, y: PIVOT.y + 94 };
const CRANK_R = REAR * Math.sin(AMAX);
const CARRIER_BOTTOM = 198;
const TRAVEL = R_HEAD * 2 * AMAX;
const STUFFING_Y = 208;
const TEE_Y = 222;

const depthY = (m: number) => GROUND + 10 + (m * 268) / 1100;
const PAY_TOP = depthY(1150);
const PUMP_TOP = depthY(1100) - 26;
const PUMP_BOTTOM = PUMP_TOP + 32;
const GLOW = { x: WELL_X, y: (PAY_TOP + 646) / 2 };
const INSET = { x: 424, y: 290, w: 500, h: 238 };

/** Rock layers, top down. Each top boundary undulates a little, so the section reads as rock, not a chart. */
const STRATA = [
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

function wavyTop(y: number, amp: number, phase: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 20) {
    const dy = amp * (Math.sin(x / 97 + phase) + 0.45 * Math.sin(x / 41 + phase * 2.3));
    pts.push(`${x} ${(y + dy).toFixed(1)}`);
  }
  return `M${pts.join(" L")}`;
}

const DEPTHS = [0, 300, 600, 900, 1150];

function Pill({ x, y, text, anchor = "start", tone = "ink", opacity = 1, size = 14 }: {
  x: number;
  y: number;
  text: string;
  anchor?: "start" | "end";
  tone?: "ink" | "alert" | "produce";
  opacity?: number;
  size?: number;
}) {
  const w = text.length * size * 0.56 + 18;
  const x0 = anchor === "end" ? x - w : x;
  const fg = tone === "alert" ? "#fbf4e8" : tone === "produce" ? "#fbf4e8" : "var(--ink)";
  const bg = tone === "alert" ? "var(--alert)" : tone === "produce" ? "var(--produce)" : "rgb(251 247 240 / 0.92)";
  return (
    <g opacity={opacity}>
      <rect x={x0} y={y - size + 1} width={w} height={size + 12} rx={3} fill={bg} stroke={tone === "ink" ? "var(--rule-strong)" : "none"} />
      <text x={x0 + 9} y={y + 5} fontSize={size} fill={fg} fontWeight={600} style={{ fontFamily: "var(--font-archivo)" }}>
        {text}
      </text>
    </g>
  );
}

function Tag({ x, y, w, title, value, sub, tone, opacity }: {
  x: number;
  y: number;
  w: number;
  title: string;
  value: string;
  sub: string;
  tone: "alert" | "produce";
  opacity: number;
}) {
  const accent = tone === "alert" ? "var(--alert)" : "var(--produce)";
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={52} rx={4} fill="rgb(251 247 240 / 0.96)" stroke="var(--rule-strong)" />
      <rect x={x} y={y} width={4} height={52} rx={2} fill={accent} />
      <text x={x + 16} y={y + 22} fontSize={13} fontWeight={700} letterSpacing="0.1em" fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
        {title.toUpperCase()}
      </text>
      <text x={x + w - 14} y={y + 23} textAnchor="end" fontSize={18} fontWeight={700} fill="var(--ink)" style={{ fontFamily: "var(--font-archivo)" }}>
        {value}
      </text>
      <text x={x + 16} y={y + 43} fontSize={14} fill={accent} fontWeight={600} style={{ fontFamily: "var(--font-archivo)" }}>
        {sub}
      </text>
    </g>
  );
}

export function WellDrawing({ s }: { s: StoryState }) {
  const { well, asOf, field } = storyData();
  const density = apiToSpecificGravity(field.model(well.wellId).fluid.api_deg) * 1000;
  const run = runOf(s.mode);
  const v = dayView(run, s.day);
  const t = s.t;
  const setting = v.setting;
  const up = setting?.upstrokeFraction ?? 0.5;
  const cyc = s.stroke - Math.floor(s.stroke);
  const p = polishedRodPosition_m(1, up, s.stroke);
  const upstroke = cyc < up;
  const downProgress = upstroke ? 0 : (cyc - up) / (1 - up);

  // Walking beam, crank and pitman follow the polished rod.
  const theta = AMAX * (2 * p - 1);
  const deg = (theta * 180) / Math.PI;
  const rear = { x: PIVOT.x + REAR * Math.cos(theta), y: PIVOT.y + REAR * Math.sin(theta) };
  const acos = Math.acos(clamp(1 - 2 * p, -1, 1));
  const phi = upstroke ? acos : 2 * Math.PI - acos;
  const pin = { x: GEAR.x + CRANK_R * Math.sin(phi), y: GEAR.y - CRANK_R * Math.cos(phi) };
  const out = { x: (pin.x - GEAR.x) / CRANK_R, y: (pin.y - GEAR.y) / CRANK_R };
  const crankDeg = (Math.atan2(out.y, out.x) * 180) / Math.PI;
  const carrierY = CARRIER_BOTTOM - p * TRAVEL;

  const producing = v.phase === "produce";
  const steaming = v.phase === "steam";
  const Tr = well.rest.temperature_C;
  const hottest = Math.max(...run.days.map((d) => d.temperature_C));
  const heat = clamp((v.temperature_C - Tr) / (hottest - Tr), 0, 1);
  const lensRx = 58 + 400 * Math.pow(heat, 0.72);
  const lensRy = 13 + 34 * heat;

  // Rod float: on a day the rods float, the string bows slack on the downstroke and slams at the bottom.
  const severity = setting ? clamp((setting.floatRatio - 0.95) / 0.3, 0.45, 1) : 0;
  const slack = v.floats && !upstroke ? 10 * severity * Math.sin(Math.PI * downProgress) : 0;
  const slamAge = t - s.slamAt;
  const slam = slamAge >= 0 && slamAge < 850 ? slamAge / 850 : null;
  const jolt = slam !== null ? 2.2 * (1 - slam) * Math.sin(slamAge / 18) : 0;
  const plungerY = PUMP_TOP + 4 + (1 - p) * 12;
  const rodPoints: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const f = i / 48;
    const y = STUFFING_Y + (plungerY - STUFFING_Y) * f;
    const x = WELL_X + jolt + slack * Math.sin(Math.PI * f) * Math.sin(5 * Math.PI * f);
    rodPoints.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const rodSlack = slack > 0.6;

  // Labels arrive one after another as the story opens.
  const reveal = (i: number) => easeOut(since(t, 900 + i * 650, 520));

  const showTags = s.mode === "twin" || s.todayDone;
  const tagIn = easeOut(since(t, s.mode === "twin" ? s.modeAt : s.todayDoneAt, 700));
  const twin = s.mode === "twin";
  const tagSetting = setting ?? runOf(s.mode).days.filter((d) => d.setting && d.d < run.nextSteam_d).at(-1)!.setting!;
  const sunPulse = 0.5 + 0.5 * Math.sin(t / 2600);

  const particles = producing
    ? Array.from({ length: 24 }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const prog = (s.flow / 240 + i * 0.1371) % 1;
        const r = lensRx * 0.85 * (1 - prog);
        const lane = (((i * 37) % 34) - 17) * (lensRy / 30);
        return { x: WELL_X + side * (16 + r), y: GLOW.y + lane * (1 - prog * 0.8), o: clamp(prog * 4, 0, 1) * clamp((1 - prog) * 6, 0, 1) };
      })
    : [];

  return (
    <svg viewBox={`0 14 ${W} ${H - 26}`} className="block h-full w-full" role="img" aria-label="BGW-14 from pumping unit to reservoir" data-testid="well-drawing">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6eee2" />
          <stop offset="0.72" stopColor="#f3dcb6" />
          <stop offset="1" stopColor="#efc98f" />
        </linearGradient>
        <radialGradient id="sun">
          <stop offset="0" stopColor="#fbe3b4" stopOpacity={0.95} />
          <stop offset="0.25" stopColor="#f6c071" stopOpacity={0.55} />
          <stop offset="1" stopColor="#f3b25c" stopOpacity={0} />
        </radialGradient>
        <linearGradient id="drum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9cfc2" />
          <stop offset="0.45" stopColor="#b8aa99" />
          <stop offset="1" stopColor="#8d7e6d" />
        </linearGradient>
        <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a7b6c" />
          <stop offset="0.5" stopColor="#cfc6ba" />
          <stop offset="1" stopColor="#8a7b6c" />
        </linearGradient>
        <pattern id="p-dots-fine" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="0.9" fill="#6d5847" opacity="0.28" />
          <circle cx="6.5" cy="7" r="0.7" fill="#6d5847" opacity="0.2" />
        </pattern>
        <pattern id="p-sand" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="2" r="0.9" fill="#7a5320" opacity="0.32" />
          <circle cx="5" cy="5.5" r="0.8" fill="#7a5320" opacity="0.26" />
          <circle cx="4.5" cy="1" r="0.5" fill="#fff6e4" opacity="0.5" />
        </pattern>
        <pattern id="p-lines" width="40" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4 H26" stroke="#6d5847" strokeWidth="0.8" opacity="0.25" />
        </pattern>
        <pattern id="p-lines-fine" width="30" height="5" patternUnits="userSpaceOnUse">
          <path d="M3 2.5 H24" stroke="#5a4636" strokeWidth="0.7" opacity="0.26" />
        </pattern>
        <pattern id="p-bricks" width="34" height="16" patternUnits="userSpaceOnUse">
          <path d="M0 0.5 H34 M0 8.5 H34 M12 0.5 V8.5 M29 8.5 V16" stroke="#6d5847" strokeWidth="0.8" opacity="0.24" fill="none" />
        </pattern>
        <clipPath id="pay">
          <rect x={0} y={PAY_TOP} width={W} height={H - PAY_TOP} />
        </clipPath>
        <clipPath id="tubing">
          <rect x={WELL_X - 12} y={TEE_Y} width={24} height={PUMP_TOP - TEE_Y} />
        </clipPath>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Sky, low sun, dunes */}
      <rect x={0} y={0} width={W} height={GROUND} fill="url(#sky)" />
      <circle cx={726} cy={238} r={150 + sunPulse * 8} fill="url(#sun)" />
      <circle cx={726} cy={240} r={25} fill="#fbe0ab" opacity={0.95} />
      <path d="M0 236 C120 214 210 230 330 222 C470 212 560 234 700 226 C820 218 930 230 1040 220 V262 H0 Z" fill="#ecd4a8" opacity={0.85} />
      <path d="M0 250 C160 238 300 252 460 244 C640 236 800 252 1040 242 V262 H0 Z" fill="#e2c28d" />

      {/* Ground and strata */}
      {STRATA.map((b, i) => {
        const top = wavyTop(b.top, b.amp, b.phase);
        const pay = i === STRATA.length - 1;
        return (
          <g key={i}>
            <path d={`${top} L${W} ${H} L0 ${H} Z`} fill={b.fill} />
            <path d={`${top} L${W} ${H} L0 ${H} Z`} fill={`url(#${b.pattern})`} />
            <path d={top} fill="none" stroke="#4a3a2c" strokeOpacity={pay ? 0.55 : 0.22} strokeWidth={pay ? 1.6 : 1} />
          </g>
        );
      })}
      <rect x={0} y={GROUND - 4} width={W} height={8} fill="#cfa66d" />
      <path d={`M0 ${GROUND - 4} H${W}`} stroke="#8a6a44" strokeWidth={1.2} />

      {/* Heat in the pay zone and oil moving to the well */}
      <g clipPath="url(#pay)">
        <HeatLens x={GLOW.x} y={GLOW.y} heat={heat} t={t} />
        {particles.map((q, i) => (
          <circle key={i} cx={q.x} cy={q.y} r={2.4} fill="#3a2413" opacity={q.o * 0.85} />
        ))}
      </g>

      {/* Depth scale */}
      <path d={`M104 ${depthY(0)} V${PAY_TOP}`} stroke="var(--ink-2)" strokeWidth={1} />
      {DEPTHS.map((m, i) => (
        <g key={m} opacity={reveal(0) * (i === 4 ? 1 : 0.9)}>
          <path d={`M98 ${depthY(m)} H110`} stroke="var(--ink-2)" strokeWidth={1.2} />
          <text x={92} y={depthY(m) + 5} textAnchor="end" fontSize={14} fill="var(--ink)" className="font-mono">
            {m === 1150 ? "1,150" : m} m
          </text>
        </g>
      ))}

      {/* Casing, open hole, VIT tubing */}
      <rect x={WELL_X - 24} y={GROUND} width={48} height={PAY_TOP - GROUND} fill="#e6ddd0" stroke="#5a4636" strokeWidth={1.4} />
      <path d={`M${WELL_X - 24} ${PAY_TOP} l-5 6 M${WELL_X + 24} ${PAY_TOP} l5 6`} stroke="#5a4636" strokeWidth={1.6} />
      <path d={`M${WELL_X - 22} ${PAY_TOP + 6} V${H - 8} M${WELL_X + 22} ${PAY_TOP + 6} V${H - 8}`} stroke="#5a4636" strokeWidth={1.3} strokeDasharray="4 4" />
      <rect x={WELL_X - 13} y={TEE_Y} width={26} height={PUMP_TOP - TEE_Y} fill={steaming ? "#f7d6c0" : "#4b3322"} stroke="#3b2a1e" strokeWidth={1.4} />
      <path d={`M${WELL_X - 17} ${TEE_Y + 4} V${PUMP_TOP} M${WELL_X + 17} ${TEE_Y + 4} V${PUMP_TOP}`} stroke="#9a8572" strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
      <g clipPath="url(#tubing)">
        {producing && (
          <>
            <path d={`M${WELL_X - 7} ${TEE_Y} V${PUMP_TOP}`} stroke="#b07a3e" strokeWidth={4} strokeDasharray="7 11" strokeDashoffset={s.flow} strokeLinecap="round" />
            <path d={`M${WELL_X + 7} ${TEE_Y} V${PUMP_TOP}`} stroke="#b07a3e" strokeWidth={4} strokeDasharray="7 11" strokeDashoffset={s.flow + 9} strokeLinecap="round" />
          </>
        )}
        {steaming && (
          <path d={`M${WELL_X} ${PUMP_TOP} V${TEE_Y}`} stroke="#ffffff" strokeWidth={14} strokeDasharray="10 12" strokeDashoffset={s.steamFlow} opacity={0.9} />
        )}
      </g>

      {/* Rod string and pump */}
      <polyline points={rodPoints.join(" ")} fill="none" stroke={rodSlack ? "var(--alert)" : "#cfc6ba"} strokeWidth={rodSlack ? 4 : 2.8} strokeLinejoin="round" />
      {!rodSlack &&
        Array.from({ length: 9 }, (_, i) => {
          const y = TEE_Y + 16 + i * 36 - (p - 0.5) * 10;
          return y > TEE_Y + 4 && y < PUMP_TOP - 4 ? <path key={i} d={`M${WELL_X - 3.5 + jolt} ${y} h7`} stroke="#e9e2d8" strokeWidth={2.4} /> : null;
        })}
      <rect x={WELL_X - 12} y={PUMP_TOP} width={24} height={PUMP_BOTTOM - PUMP_TOP} rx={2} fill={slam !== null ? "#e15a3f" : "#8a7b6c"} stroke="#3b2a1e" strokeWidth={1.4} />
      <rect x={WELL_X - 8 + jolt} y={plungerY} width={16} height={10} rx={1.5} fill="#e9e2d8" stroke="#3b2a1e" strokeWidth={1} />
      <circle cx={WELL_X} cy={PUMP_BOTTOM - 3} r={2.4} fill="#3b2a1e" />
      {slam !== null && (
        <g>
          <circle cx={WELL_X} cy={PUMP_TOP + 18} r={10 + 62 * easeOut(slam)} fill="none" stroke="var(--alert)" strokeWidth={3.5 * (1 - slam) + 0.5} opacity={1 - slam} />
          <circle cx={WELL_X} cy={PUMP_TOP + 18} r={6 + 34 * easeOut(slam)} fill="none" stroke="var(--alert)" strokeWidth={2} opacity={0.8 * (1 - slam)} />
        </g>
      )}

      {/* Storage tank and flowline */}
      <rect x={22} y={194} width={78} height={GROUND - 194} fill="#d8cfc2" stroke="#5a4636" strokeWidth={1.3} />
      <path d={`M18 194 L61 184 L104 194 Z`} fill="#c6bba9" stroke="#5a4636" strokeWidth={1.3} />
      {[210, 228, 246].map((y) => (
        <path key={y} d={`M22 ${y} H100`} stroke="#5a4636" strokeOpacity={0.25} />
      ))}
      <path d={`M100 ${TEE_Y} H${WELL_X - 12}`} stroke="#6d5847" strokeWidth={7} strokeLinecap="round" />
      <path d={`M100 ${TEE_Y} H${WELL_X - 12}`} stroke="#bcb1a2" strokeWidth={3} />
      {producing && (
        <path d={`M100 ${TEE_Y} H${WELL_X - 12}`} stroke="#6b4423" strokeWidth={3} strokeDasharray="6 9" strokeDashoffset={s.flow} />
      )}

      {/* Steam line from the generator to the wellhead */}
      <path d={`M${WELL_X + 12} ${TEE_Y} H${WELL_X + 28} V256 H772 V238 H792`} fill="none" stroke="#6d5847" strokeWidth={8} strokeLinejoin="round" />
      <path d={`M${WELL_X + 12} ${TEE_Y} H${WELL_X + 28} V256 H772 V238 H792`} fill="none" stroke={steaming ? "#f3a07a" : "#bcb1a2"} strokeWidth={4} strokeLinejoin="round" />
      {steaming && (
        <path d={`M${WELL_X + 12} ${TEE_Y} H${WELL_X + 28} V256 H772 V238 H792`} fill="none" stroke="#fff7ec" strokeWidth={3} strokeDasharray="9 12" strokeDashoffset={s.steamFlow} />
      )}

      {/* Thermal wellhead */}
      <rect x={WELL_X - 22} y={GROUND - 20} width={44} height={10} rx={1.5} fill="#8a7b6c" stroke="#3b2a1e" strokeWidth={1.2} />
      <rect x={WELL_X - 15} y={GROUND - 34} width={30} height={14} rx={1.5} fill="#a39584" stroke="#3b2a1e" strokeWidth={1.2} />
      <circle cx={WELL_X - 22} cy={GROUND - 27} r={5} fill="none" stroke="#3b2a1e" strokeWidth={1.6} />
      <circle cx={WELL_X + 22} cy={GROUND - 27} r={5} fill="none" stroke="#3b2a1e" strokeWidth={1.6} />
      <rect x={WELL_X - 13} y={TEE_Y - 7} width={26} height={14} rx={1.5} fill="#b8aa99" stroke="#3b2a1e" strokeWidth={1.2} />
      <rect x={WELL_X - 7} y={STUFFING_Y - 4} width={14} height={11} rx={1.5} fill="#8a7b6c" stroke="#3b2a1e" strokeWidth={1.2} />

      {/* Pumping unit: Samson post, walking beam, horsehead, bridle, crank, counterweights, motor and VFD */}
      <rect x={306} y={GROUND - 12} width={344} height={10} fill="#b3a28d" stroke="#5a4636" strokeWidth={1} />
      <path d={`M378 ${GROUND - 12} L${PIVOT.x - 5} ${PIVOT.y + 8} M464 ${GROUND - 12} L${PIVOT.x + 5} ${PIVOT.y + 8}`} stroke="#4a3a2c" strokeWidth={8} strokeLinecap="round" />
      <path d={`M391 200 H451 M402 158 H440`} stroke="#4a3a2c" strokeWidth={3.5} />
      <path d={`M${GEAR.x - 20} ${GROUND - 12} L${GEAR.x - 14} ${GEAR.y + 16} H${GEAR.x + 14} L${GEAR.x + 20} ${GROUND - 12} Z`} fill="#6d5847" stroke="#3b2a1e" strokeWidth={1.2} />
      <rect x={GEAR.x - 30} y={GEAR.y - 24} width={60} height={46} rx={15} fill="#7d6a58" stroke="#3b2a1e" strokeWidth={1.4} />
      <circle cx={GEAR.x + 20} cy={GEAR.y + 10} r={9} fill="#5a4636" stroke="#3b2a1e" />
      <path d={`M${GEAR.x + 22} ${GEAR.y + 1} L596 227 M${GEAR.x + 22} ${GEAR.y + 19} L596 243`} stroke="#3b2a1e" strokeWidth={2} />
      <rect x={582} y={222} width={46} height={26} rx={5} fill="#7d6a58" stroke="#3b2a1e" strokeWidth={1.3} />
      {[590, 598, 606, 614].map((x) => (
        <path key={x} d={`M${x} 226 V244`} stroke="#3b2a1e" strokeOpacity={0.4} />
      ))}
      <circle cx={596} cy={235} r={6} fill="#5a4636" stroke="#3b2a1e" />
      <path d={`M669 250 C669 262 640 254 628 240`} fill="none" stroke="#3b2a1e" strokeWidth={2} />
      <path d="M655 250 V258 M683 250 V258" stroke="#3b2a1e" strokeWidth={2} />
      <rect x={650} y={188} width={38} height={62} rx={3} fill="#efe6d7" stroke="#5a4636" strokeWidth={1.3} />
      <rect x={655} y={195} width={28} height={18} rx={1.5} fill={twin ? "#0f766e" : "#3b2a1e"} />
      {twin ? (
        <path d="M657 206 C660 198 663 198 666 206 C670 212 676 212 681 206" fill="none" stroke="#bff3e8" strokeWidth={1.4} />
      ) : (
        <path d="M657 206 C661 199 665 199 669 206 C673 213 677 213 681 206" fill="none" stroke="#f3c1a9" strokeWidth={1.4} />
      )}
      <circle cx={660} cy={224} r={2.4} fill={twin ? "var(--produce)" : "var(--steam)"} />
      <text x={669} y={180} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)" opacity={reveal(4)} style={{ fontFamily: "var(--font-archivo)" }}>
        VFD
      </text>

      {/* Crank with its counterweight, then the pitman on the wrist pin */}
      <g transform={`rotate(${crankDeg.toFixed(2)} ${GEAR.x} ${GEAR.y})`}>
        <path d={`M${GEAR.x - 12} ${GEAR.y - 8} L${GEAR.x + CRANK_R + 12} ${GEAR.y - 6} L${GEAR.x + CRANK_R + 12} ${GEAR.y + 6} L${GEAR.x - 12} ${GEAR.y + 8} Z`} fill="#4a3a2c" stroke="#2f2118" strokeWidth={1} />
        <path d={`M${GEAR.x + 4} ${GEAR.y - 19} H${GEAR.x + CRANK_R + 18} a4 4 0 0 1 4 4 V${GEAR.y + 15} a4 4 0 0 1 -4 4 H${GEAR.x + 4} Z`} fill="#5a4636" stroke="#2f2118" strokeWidth={1.2} />
        <path d={`M${GEAR.x + 10} ${GEAR.y - 19} V${GEAR.y + 19} M${GEAR.x + 26} ${GEAR.y - 19} V${GEAR.y + 19}`} stroke="#2f2118" strokeOpacity={0.45} />
      </g>
      <circle cx={GEAR.x} cy={GEAR.y} r={6} fill="#2f2118" />
      <path d={`M${pin.x} ${pin.y} L${rear.x} ${rear.y + 8}`} stroke="#4a3a2c" strokeWidth={6} strokeLinecap="round" />
      <circle cx={pin.x} cy={pin.y} r={4.5} fill="#cfc6ba" stroke="#2f2118" />

      {/* Walking beam and horsehead */}
      <g transform={`rotate(${deg.toFixed(3)} ${PIVOT.x} ${PIVOT.y})`}>
        <rect x={PIVOT.x - R_HEAD + 18} y={PIVOT.y - 7} width={R_HEAD - 18 + REAR + 10} height={14} rx={2} fill="#3b2a1e" />
        <path d={`M${PIVOT.x - R_HEAD + 18} ${PIVOT.y - 4} H${PIVOT.x + REAR + 6}`} stroke="#6d5847" strokeWidth={1.5} />
        <path
          d={(() => {
            const a1 = (154 * Math.PI) / 180;
            const a2 = (206 * Math.PI) / 180;
            const o = (a: number, r: number) => `${(PIVOT.x + r * Math.cos(a)).toFixed(2)} ${(PIVOT.y + r * Math.sin(a)).toFixed(2)}`;
            return `M${o(a1, R_HEAD)} A${R_HEAD} ${R_HEAD} 0 0 1 ${o(a2, R_HEAD)} L${o(a2, R_HEAD - 26)} A${R_HEAD - 26} ${R_HEAD - 26} 0 0 0 ${o(a1, R_HEAD - 26)} Z`;
          })()}
          fill="#9b3b22"
          stroke="#3b2a1e"
          strokeWidth={1.4}
        />
        <rect x={PIVOT.x + REAR - 7} y={PIVOT.y + 5} width={14} height={10} fill="#4a3a2c" />
      </g>
      <rect x={PIVOT.x - 11} y={PIVOT.y + 4} width={22} height={9} fill="#4a3a2c" />
      <circle cx={PIVOT.x} cy={PIVOT.y} r={6.5} fill="#6d5847" stroke="#2f2118" strokeWidth={1.2} />

      {/* Bridle, carrier bar, polished rod */}
      <path d={`M${WELL_X - 3} ${PIVOT.y} V${carrierY} M${WELL_X + 3} ${PIVOT.y} V${carrierY}`} stroke="#2f2118" strokeWidth={1.4} />
      <rect x={WELL_X - 13} y={carrierY} width={26} height={5} rx={1} fill="#4a3a2c" />
      <path d={`M${WELL_X} ${carrierY - 7} V${STUFFING_Y}`} stroke="url(#steel)" strokeWidth={3.2} />

      {/* Steam generator */}
      <rect x={772} y={GROUND - 14} width={236} height={12} fill="#8d7e6d" stroke="#5a4636" />
      <rect x={792} y={194} width={176} height={52} rx={26} fill="url(#drum)" stroke="#5a4636" strokeWidth={1.3} />
      {[840, 880, 920].map((x) => (
        <path key={x} d={`M${x} 195 V245`} stroke="#5a4636" strokeOpacity={0.35} />
      ))}
      <rect x={964} y={204} width={30} height={40} rx={3} fill="#9a8a78" stroke="#5a4636" />
      <rect x={968} y={118} width={14} height={86} fill="#7d6a58" stroke="#5a4636" />
      <rect x={965} y={114} width={20} height={6} fill="#5a4636" />
      <rect x={852} y={211} width={56} height={22} rx={2} fill="rgb(251 247 240 / 0.9)" stroke="#5a4636" strokeOpacity={0.5} />
      <text x={880} y={227} textAnchor="middle" fontSize={15} fontWeight={800} fill="var(--ink)" style={{ fontFamily: "var(--font-archivo)" }}>
        SG-2
      </text>
      {steaming &&
        Array.from({ length: 6 }, (_, i) => {
          const k = ((t / 1000) * 0.55 + i / 6) % 1;
          return <circle key={i} cx={975 + Math.sin(k * 5 + i) * 6 + k * 18} cy={110 - k * 90} r={6 + k * 16} fill="#efe6d7" opacity={0.55 * (1 - k)} />;
        })}

      {/* Labels */}
      <Pill x={244} y={170} text="Thermal wellhead" anchor="end" opacity={reveal(1)} />
      <path d={`M244 172 L${WELL_X - 10} ${STUFFING_Y + 2}`} stroke="var(--ink-2)" strokeWidth={1} opacity={reveal(1)} />
      <Pill x={WELL_X - 34} y={depthY(450)} text="VIT tubing" anchor="end" opacity={reveal(2)} />
      <path d={`M${WELL_X - 34} ${depthY(450) - 2} H${WELL_X - 14}`} stroke="var(--ink-2)" strokeWidth={1} opacity={reveal(2)} />
      <g opacity={reveal(5)}>
        <text x={1016} y={PAY_TOP + 34} textAnchor="end" fontSize={20} fontWeight={800} fill="#3b2a1e" style={{ fontFamily: "var(--font-archivo)" }}>
          Jodhpur Sandstone
        </text>
        <text x={1016} y={PAY_TOP + 56} textAnchor="end" fontSize={14} fill="#3b2a1e" className="font-mono">
          heavy oil, 17 to 19° API
        </text>
      </g>
      <Pill x={WELL_X + 34} y={PAY_TOP + 30} text={`Heated zone · ${Math.round(v.temperature_C)} °C`} opacity={reveal(5)} />
      <g opacity={reveal(3)}>
        <PumpInset
          x={INSET.x}
          y={INSET.y}
          w={INSET.w}
          h={INSET.h}
          from={{ x: WELL_X, y: (PUMP_TOP + PUMP_BOTTOM) / 2 }}
          s={{
            p,
            upstroke,
            slack,
            slam,
            phase: v.phase,
            floats: v.floats,
            tubingViscosity_cP: v.tubingViscosity_cP,
            flow: s.flow,
            steamFlow: s.steamFlow,
            lowerSpeed: setting ? peakDownstrokeSpeed_m_per_s(setting.stroke_in, setting.spm, setting.upstrokeFraction) : null,
            sinkSpeed: rodFallSpeed_m_per_s(v.tubingViscosity_cP, density),
          }}
        />
      </g>

      {/* Who decides what: apart today, joined by the twin */}
      {showTags && (
        <g>
          <path d="M600 78 L660 164" stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" opacity={tagIn} />
          <path d="M905 78 L880 192" stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" opacity={tagIn} />
          <Tag
            x={440}
            y={26}
            w={270}
            title="Pump"
            value={`${fmtFixed(tagSetting.spm, 1)} strokes/min`}
            sub={twin ? "fast up, slow down, day by day" : "constant speed, set by hand"}
            tone={twin ? "produce" : "alert"}
            opacity={tagIn}
          />
          <Tag
            x={790}
            y={26}
            w={230}
            title="Steam date"
            value={shortDate(asOf, run.nextSteam_d)}
            sub={twin ? "re-steam rule" : "from the plan"}
            tone={twin ? "produce" : "alert"}
            opacity={tagIn}
          />
          {twin ? (
            <g opacity={tagIn}>
              <path d="M710 52 H790" stroke="var(--produce)" strokeWidth={2.5} />
              <rect x={726} y={41} width={48} height={22} rx={11} fill="var(--produce)" />
              <text x={750} y={57} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fbf4e8" style={{ fontFamily: "var(--font-archivo)" }}>
                Twin
              </text>
            </g>
          ) : (
            <g opacity={tagIn}>
              <path d="M710 52 H738 M762 52 H790" stroke="var(--alert)" strokeWidth={2} strokeDasharray="4 4" />
              <path d="M744 46 l12 12 M756 46 l-12 12" stroke="var(--alert)" strokeWidth={2.4} strokeLinecap="round" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
