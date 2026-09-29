"use client";

import type { StrokeResult } from "@bgw/physics";
import { shortDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoryData } from "../data";
import { hud, smooth } from "../script";
import { PANEL } from "./well-hud";

// The story's explaining panels: the two decisions made apart, the before and
// after for BGW-14, and the dynamometer card that proves the rods stay loaded.

export function Apart({ t }: { t: number }) {
  const a = hud(t, "apart", 0.5);
  if (a <= 0.001) return null;
  const k1 = smooth((t - 65.6) / 0.6);
  const k2 = smooth((t - 67.2) / 0.6);
  const split = smooth((t - 69.2) / 0.8);
  const card = (icon: React.ReactNode, title: string, line: string, k: number) => (
    <div className={cn(PANEL, "flex items-center gap-4 px-5 py-4")} style={{ opacity: k, transform: `translateX(${(1 - k) * -14}px)` }}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand-deep text-ink">{icon}</span>
      <div className="flex flex-col">
        <span className="text-[20px] font-bold text-ink">{title}</span>
        <span className="text-[16px] text-ink-2">{line}</span>
      </div>
    </div>
  );
  return (
    <div className="absolute top-[300px] left-6 flex w-[430px] flex-col gap-0" style={{ opacity: a }}>
      <span className="mb-3 text-[15px] font-bold tracking-[0.08em] text-ink-2 uppercase">Today, two decisions</span>
      {card(
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>,
        "Steam plan",
        "Booked from past cycles",
        k1,
      )}
      <div className="relative h-[54px]">
        <svg className="absolute left-[46px]" width="40" height="54" viewBox="0 0 40 54" aria-hidden>
          <line x1="20" y1="0" x2="20" y2={20 - split * 8} stroke="var(--ink-3)" strokeWidth="2.5" />
          <line x1="20" y1={34 + split * 8} x2="20" y2="54" stroke="var(--ink-3)" strokeWidth="2.5" />
          <g opacity={split} stroke="var(--alert)" strokeWidth="2.6" strokeLinecap="round">
            <line x1="13" y1="20" x2="27" y2="34" />
            <line x1="27" y1="20" x2="13" y2="34" />
          </g>
        </svg>
        <span className="absolute top-[15px] left-[96px] text-[16px] font-semibold text-alert" style={{ opacity: split }}>
          Planned apart
        </span>
      </div>
      {card(
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 16a8 8 0 1 1 16 0" />
          <path d="M12 16l4-5" />
          <circle cx="12" cy="16" r="1.4" fill="currentColor" />
        </svg>,
        "Pump settings",
        "Changed by hand, after trouble",
        k2,
      )}
    </div>
  );
}

export function BeforeAfter({ t, data }: { t: number; data: StoryData }) {
  const a = hud(t, "beforeAfter", 0.5);
  if (a <= 0.001) return null;
  const w = data.well;
  const rows: [string, string, string, string | null][] = [
    ["Steam date", shortDate(data.asOf, w.before.steamStart_d), shortDate(data.asOf, w.after.steamStart_d), `${w.before.steamStart_d - w.after.steamStart_d} days sooner`],
    ["Rod-float days", String(w.before.floatDays), String(w.after.floatDays), null],
    ["Pump electricity", `${fmtInt(w.window.practice_kWh)} kWh`, `${fmtInt(w.window.twin_kWh)} kWh`, `${Math.round(w.window.change_frac * 100)}%`.replace("-", "−")],
  ];
  return (
    <div className={cn(PANEL, "absolute top-[304px] left-6 w-[540px] px-6 pt-5 pb-4")} style={{ opacity: a }}>
      <div className="grid grid-cols-[1.25fr_1fr_1fr] items-end gap-x-4 border-b border-rule-strong pb-2.5">
        <span className="text-[17px] font-bold text-ink">{w.wellId}, cycle {w.cycle.cycleNumber}</span>
        <span className="text-[15px] font-semibold text-ink-2">Today&apos;s practice</span>
        <span className="text-[15px] font-semibold text-produce">Twin</span>
      </div>
      {rows.map(([label, before, after, note], i) => {
        const k = smooth((t - (110.0 + i * 0.8)) / 0.45);
        return (
          <div key={label} className="grid grid-cols-[1.25fr_1fr_1fr] items-baseline gap-x-4 border-b border-rule py-3 last:border-b-0" style={{ opacity: k }}>
            <span className="text-[17px] text-ink">{label}</span>
            <span className="font-mono text-[24px] text-ink-2">{before}</span>
            <span className="flex flex-col">
              <span className="font-mono text-[24px] font-semibold text-produce">{after}</span>
              {note && <span className="text-[14px] font-semibold text-produce">{note}</span>}
            </span>
          </div>
        );
      })}
      <p className="pt-2 text-[14px] text-ink-2">
        Electricity over the same days and the same {fmtInt(w.window.oil_bbl)} bbl, {shortDate(data.asOf, w.window.from_d)} to{" "}
        {shortDate(data.asOf, w.window.to_d)}.
      </p>
    </div>
  );
}

function loopPath(r: StrokeResult, xs: (v: number) => number, ys: (v: number) => number): string {
  return r.surface.map((p, i) => `${i ? "L" : "M"}${xs(p.position_m).toFixed(1)},${ys(p.load_kN).toFixed(1)}`).join("") + "Z";
}

export function CardPanel({ t, data }: { t: number; data: StoryData }) {
  const a = hud(t, "card", 0.5);
  if (a <= 0.001) return null;
  const c = data.well.card;
  const W = 860;
  const H = 440;
  const m = { l: 70, r: 24, t: 20, b: 50 };
  const all = [...c.practice.surface, ...c.twin.surface];
  const lo = Math.min(-10, ...all.map((p) => p.load_kN));
  const hi = Math.max(...all.map((p) => p.load_kN)) * 1.06;
  const pmax = Math.max(...all.map((p) => p.position_m)) * 1.03;
  const xs = (v: number) => m.l + (v / pmax) * (W - m.l - m.r);
  const ys = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const drawP = smooth((t - 123.8) / 2.6);
  const drawT = smooth((t - 129.8) / 2.6);
  const len = 4000;
  const ticks = [-10, 0, 20, 40, 60, 80].filter((v) => v >= lo && v <= hi);
  return (
    <div className={cn(PANEL, "absolute top-[104px] right-6 w-[908px] px-6 pt-5 pb-5")} style={{ opacity: a }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[20px] font-bold text-ink">Surface card, {shortDate(data.asOf, c.d)}</span>
        <span className="text-[15px] text-ink-2">rod load over one stroke, {fmtInt(c.tubingViscosity_cP)} cP crude</span>
      </div>
      <svg width={W} height={H} className="mt-2 block overflow-visible">
        <rect x={m.l} y={ys(0)} width={W - m.l - m.r} height={ys(lo) - ys(0)} fill="var(--alert)" opacity={0.09} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={ys(v)} y2={ys(v)} stroke={v === 0 ? "var(--alert)" : "var(--rule-strong)"} strokeWidth={v === 0 ? 1.6 : 1} />
            <text x={m.l - 10} y={ys(v) + 5} textAnchor="end" fontSize={14} className="font-mono" fill="var(--ink-2)">
              {v}
            </text>
          </g>
        ))}
        <text x={W - m.r - 8} y={ys(lo) - 10} textAnchor="end" fontSize={15} fontWeight={600} fill="var(--alert)">
          Below zero, the rods are slack
        </text>
        <text x={m.l} y={H - 12} fontSize={14} fill="var(--ink-2)">
          Polished-rod position, m
        </text>
        <text transform={`translate(18, ${m.t + 150}) rotate(-90)`} fontSize={14} fill="var(--ink-2)" textAnchor="middle">
          Load, kN
        </text>
        <path d={loopPath(c.practice, xs, ys)} fill="none" stroke="var(--alert)" strokeWidth={3} strokeDasharray={len} strokeDashoffset={len * (1 - drawP)} strokeLinejoin="round" />
        <path d={loopPath(c.twin, xs, ys)} fill="var(--produce)" fillOpacity={0.08 * drawT} stroke="var(--produce)" strokeWidth={3.4} strokeDasharray={len} strokeDashoffset={len * (1 - drawT)} strokeLinejoin="round" />
      </svg>
      <div className="mt-3 flex gap-4">
        <div className="flex items-center gap-3 rounded-[4px] border border-alert/30 bg-alert/5 px-4 py-2.5" style={{ opacity: drawP }}>
          <span className="h-[3px] w-7 bg-alert" />
          <span className="text-[16px] font-semibold text-ink">Today&apos;s practice, constant speed</span>
          <span className="font-mono text-[18px] font-semibold text-alert">min {c.practice.minLoad_kN.toFixed(1).replace("-", "−")} kN</span>
        </div>
        <div className="flex items-center gap-3 rounded-[4px] border border-produce/30 bg-produce/5 px-4 py-2.5" style={{ opacity: drawT }}>
          <span className="h-[3px] w-7 bg-produce" />
          <span className="text-[16px] font-semibold text-ink">Twin, slow downstroke</span>
          <span className="font-mono text-[18px] font-semibold text-produce">min +{c.twin.minLoad_kN.toFixed(1)} kN</span>
        </div>
      </div>
    </div>
  );
}
