"use client";

import type { ScenarioStory, StoryDay } from "../engine";
import { PumpjackMark } from "@/components/shell/app-header";
import { longDate, shortDate, dateOf } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { momentAt, type StoryData } from "../data";
import { carrierAt } from "../stroke";
import { dayAt, hud, modeAt, smooth, TWIN_CLICK, windowAlpha, type Mode } from "../script";
import { BRAND, orgLine } from "@/lib/brand";

// The instrument layer over the well: which well, which practice, the three
// numbers that tell the story, the rod-float count, and the cycle timeline.

export const PANEL = "rounded-[5px] border border-rule-strong bg-sheet shadow-[0_8px_30px_rgba(59,42,30,0.16)]";

export function Brand({ t }: { t: number }) {
  const a = 1 - windowAlpha(t, 198.2, 230, 0.5);
  return (
    <div className={cn(PANEL, "absolute top-5 left-6 flex items-center gap-3 px-4 py-2.5")} style={{ opacity: a }}>
      <PumpjackMark size={1.25} />
      <div className="flex flex-col leading-tight">
        <span className="text-[19px] font-extrabold tracking-[-0.01em] stretch-semi text-ink">{BRAND.product}</span>
        <span className="text-[14px] font-medium text-ink-2">{orgLine()}</span>
      </div>
    </div>
  );
}

export function ModeToggle({ t, pressed }: { t: number; pressed: string | null }) {
  const a = hud(t, "mode");
  if (a <= 0.001) return null;
  const mode = modeAt(t);
  const item = (id: Mode, label: string) => {
    const on = mode === id;
    return (
      <button
        type="button"
        data-cursor={`mode-${id}`}
        className={cn(
          "h-[44px] rounded-[4px] px-6 text-[18px] font-semibold",
          on ? (id === "twin" ? "bg-produce text-[#f4fbfa]" : "bg-ink text-[#fbf4e8]") : "text-ink-2",
          pressed === `mode-${id}` && "scale-[0.97]",
        )}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="absolute top-5 left-[300px]" style={{ opacity: a }}>
      <div className={cn(PANEL, "flex gap-1 p-1")}>
        {item("today", "Today's practice")}
        {item("twin", "Twin")}
      </div>
    </div>
  );
}

function StrokeGlyph({ up }: { up: number }) {
  const w = 120;
  const h = 34;
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const p = i / 64;
    pts.push(`${(p * w).toFixed(1)},${(h - 3 - carrierAt(p, up) * (h - 6)).toFixed(1)}`);
  }
  return (
    <svg width={w} height={h} className="block overflow-visible" aria-hidden>
      <line x1={up * w} x2={up * w} y1={2} y2={h - 2} stroke="var(--rule-strong)" strokeDasharray="2 3" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}

const PHASE_LABEL: Record<string, string> = {
  cold: "Waiting for steam",
  steam: "Steam going in",
  soak: "Soaking",
  produce: "Producing",
};

export function Readouts({ t, data }: { t: number; data: StoryData }) {
  const a = hud(t, "readouts");
  if (a <= 0.001) return null;
  const m = momentAt(data.well, modeAt(t), dayAt(t));
  const pumping = m.phase === "produce";
  const phaseTone = m.phase === "steam" ? "text-steam" : m.phase === "soak" ? "text-soak" : m.phase === "produce" ? "text-produce" : "text-ink-2";
  const row = (label: string, sub: string, value: string, unit: string, tone = "text-ink") => (
    <div className="flex items-end justify-between gap-4 border-t border-rule py-2.5 first:border-t-0">
      <div className="flex flex-col">
        <span className="text-[15px] font-semibold text-ink">{label}</span>
        <span className="text-[14px] text-ink-2">{sub}</span>
      </div>
      <span className={cn("flex items-baseline gap-1.5 font-mono", tone)}>
        <span className="text-[34px] leading-none font-medium tracking-[-0.03em]">{value}</span>
        <span className="text-[15px] text-ink-2">{unit}</span>
      </span>
    </div>
  );
  return (
    <div className={cn(PANEL, "absolute top-5 right-6 w-[352px] px-5 pt-3.5 pb-2")} style={{ opacity: a }}>
      <div className="flex items-center justify-between pb-1.5">
        <span className="text-[16px] font-bold text-ink">
          {data.well.wellId} · cycle {m.cycleNumber}
        </span>
        <span className={cn("text-[14px] font-semibold", phaseTone)}>{PHASE_LABEL[m.phase]}</span>
      </div>
      {row("Heated zone", "rock at the well", fmtInt(m.temperature_C), "°C", "text-heat")}
      {row("Crude", "in the tubing", fmtInt(m.tubingViscosity_cP), "cP")}
      {row("Oil", pumping ? "to surface" : "pump off", fmtFixed(m.oil_bbl_per_d, 1), "bbl/d", "text-produce")}
      <div className="flex items-end justify-between gap-3 border-t border-rule py-2.5">
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-ink">Pump</span>
          <span className="text-[14px] whitespace-nowrap text-ink-2">
            {!pumping ? "stopped" : m.upstrokeFraction < 0.49 ? "slow downstroke" : "constant speed"}
          </span>
        </div>
        <span className="flex items-baseline gap-1.5 font-mono text-ink">
          <span className="text-[34px] leading-none font-medium tracking-[-0.03em]">{pumping ? fmtFixed(m.spm, 1) : "0.0"}</span>
          <span className="text-[15px] text-ink-2">SPM</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule py-2.5" style={{ opacity: pumping ? 1 : 0.35 }}>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-ink">Stroke</span>
          <span className="font-mono text-[14px] whitespace-nowrap text-ink-2">
            up {Math.round(m.upstrokeFraction * 100)}% · down {Math.round((1 - m.upstrokeFraction) * 100)}%
          </span>
        </div>
        <StrokeGlyph up={m.upstrokeFraction} />
      </div>
    </div>
  );
}

export function FloatCounter({ t, data }: { t: number; data: StoryData }) {
  const a = hud(t, "floatCounter");
  if (a <= 0.001) return null;
  const m = momentAt(data.well, modeAt(t), dayAt(t));
  const floating = m.phase === "produce" && m.floatRatio >= 1;
  const n = m.floatDaysSoFar;
  return (
    <div className={cn(PANEL, "absolute top-[132px] left-6 w-[244px] px-5 py-4")} style={{ opacity: a }}>
      <span className="text-[15px] font-semibold text-ink">Rod-float days</span>
      <div className={cn("font-mono text-[60px] leading-[1.05] font-medium tracking-[-0.04em]", n > 0 ? "text-alert" : "text-produce")}>{n}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className={cn("size-2.5 rounded-full", floating ? "bg-alert" : "bg-produce")} />
        <span className={cn("text-[15px] font-semibold", floating ? "text-alert" : "text-produce")}>
          {m.phase !== "produce" ? "Pump stopped" : floating ? "Rods floating" : "Rods loaded"}
        </span>
      </div>
    </div>
  );
}

// Timeline.

const T0 = -77;
const T1 = 64;
const X0 = 250;
const X1 = 1576;
const xOf = (d: number) => X0 + ((d - T0) / (T1 - T0)) * (X1 - X0);

interface Run {
  phase: StoryDay["phase"];
  from: number;
  to: number;
}

function runs(sc: ScenarioStory): Run[] {
  const out: Run[] = [];
  for (const d of sc.days) {
    const last = out.at(-1);
    if (last && last.phase === d.phase && last.to === d.d) last.to = d.d + 1;
    else out.push({ phase: d.phase, from: d.d, to: d.d + 1 });
  }
  return out;
}

const RUN_COLOR: Record<StoryDay["phase"], string> = { steam: "var(--steam)", soak: "var(--soak)", produce: "var(--produce)" };

function Track({ sc, alpha, asOf, cycle }: { sc: ScenarioStory; alpha: number; asOf: string; cycle: number }) {
  if (alpha <= 0.001) return null;
  const float = sc.days.filter((d) => d.cycleNumber === cycle && d.pump && d.pump.floatRatio >= 1);
  return (
    <g opacity={alpha}>
      {runs(sc)
        .filter((r) => r.from < T1)
        .map((r) => (
          <rect key={`${r.phase}${r.from}`} x={xOf(r.from)} width={Math.max(1, xOf(Math.min(T1, r.to)) - xOf(r.from))} y={26} height={18} fill={RUN_COLOR[r.phase]} opacity={r.phase === "produce" ? 0.8 : 1} />
        ))}
      {float.map((d) => (
        <rect key={d.d} x={xOf(d.d)} width={xOf(d.d + 1) - xOf(d.d)} y={26} height={18} fill="url(#float-hatch)" />
      ))}
      <g transform={`translate(${xOf(sc.steamStart_d)}, 0)`}>
        <line y1={4} y2={46} stroke="var(--steam)" strokeWidth={2} />
        <text x={6} y={16} fontSize={14} fontWeight={700} fill="var(--steam)">
          Steam {shortDate(asOf, sc.steamStart_d)}
        </text>
      </g>
    </g>
  );
}

export function Timeline({ t, data }: { t: number; data: StoryData }) {
  const a = hud(t, "timeline");
  if (a <= 0.001) return null;
  const asOf = data.asOf;
  const day = dayAt(t);
  const mode = modeAt(t);
  // Crossfade the two plans around the toggle and the card scene's switch.
  const twinK = t < 122 ? smooth((t - TWIN_CLICK) / 0.45) : smooth((t - 129.5) / 0.45);
  const k = mode === "twin" ? twinK : 0;
  const advancing = Math.abs(dayAt(t + 0.15) - day) > 0.01;
  const months: number[] = [];
  for (let d = T0; d <= T1 - 5; d++) if (dateOf(asOf, d).getUTCDate() === 1) months.push(d);
  const cycle = data.well.cycle.cycleNumber;
  return (
    <div className={cn(PANEL, "absolute right-6 bottom-9 left-6 h-[76px]")} style={{ opacity: a }}>
      <div className="absolute top-0 left-0 flex h-full w-[226px] items-center gap-3.5 border-r border-rule px-4">
        <span data-cursor="play" className="flex size-11 items-center justify-center rounded-full bg-ink text-[#fbf4e8]">
          {advancing ? (
            <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden>
              <rect x="1" y="1" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="9" y="1" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden>
              <path d="M2 1.5 L13 8 L2 14.5 Z" fill="currentColor" />
            </svg>
          )}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-[15px] font-medium text-ink">{longDate(asOf, Math.floor(day)).replace(/ \d{4}$/, "")}</span>
          <span className="text-[14px] text-ink-2">{Math.floor(day) === 0 ? "today" : Math.floor(day) < 0 ? `${-Math.floor(day)} d ago` : `in ${Math.floor(day)} d`}</span>
        </div>
      </div>
      <svg className="absolute inset-0" width="100%" height="76" viewBox={`0 0 1552 76`} preserveAspectRatio="none" overflow="visible">
        <defs>
          <pattern id="float-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--alert)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2" opacity="0.55" />
          </pattern>
        </defs>
        <g transform="translate(-24, 0)">
          <rect x={X0} width={X1 - X0} y={26} height={18} fill="var(--sand-deep)" />
          <Track sc={data.well.before} alpha={1 - k} asOf={asOf} cycle={cycle} />
          <Track sc={data.well.after} alpha={k} asOf={asOf} cycle={cycle} />
          {k > 0.01 && (
            <g opacity={k * 0.8}>
              <line x1={xOf(data.well.before.steamStart_d)} x2={xOf(data.well.before.steamStart_d)} y1={22} y2={48} stroke="var(--ink-3)" strokeDasharray="3 3" strokeWidth={1.5} />
              <text x={xOf(data.well.before.steamStart_d) + 6} y={16} fontSize={14} fill="var(--ink-2)">
                was {shortDate(asOf, data.well.before.steamStart_d)}
              </text>
            </g>
          )}
          {months.map((d) => (
            <text key={d} x={xOf(d) + 4} y={64} fontSize={14} fill="var(--ink-2)" className="font-mono">
              {shortDate(asOf, d).split(" ")[1]}
            </text>
          ))}
          <line x1={xOf(0)} x2={xOf(0)} y1={20} y2={50} stroke="var(--ink)" strokeWidth={1.5} />
          <text x={xOf(0) - 6} y={16} fontSize={14} textAnchor="end" fill="var(--ink)" fontWeight={600}>
            today
          </text>
          <g transform={`translate(${xOf(day)}, 0)`}>
            <line y1={16} y2={52} stroke="var(--ink)" strokeWidth={2.5} />
            <circle data-cursor="playhead" cy={35} r={8} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={2.5} />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function LowerThird({ t }: { t: number }) {
  const a = hud(t, "lowerThird", 0.6);
  if (a <= 0.001) return null;
  return (
    <div className="absolute bottom-16 left-6" style={{ opacity: a, transform: `translateY(${(1 - a) * 10}px)` }}>
      <div className={cn(PANEL, "flex flex-col gap-1 border-l-[5px] border-l-steam px-6 py-4")}>
        <span className="text-[40px] leading-none font-extrabold tracking-[-0.02em] stretch-semi text-ink">{BRAND.product}</span>
        <span className="text-[18px] font-medium text-ink-2">{orgLine()} · Team 2</span>
      </div>
    </div>
  );
}
