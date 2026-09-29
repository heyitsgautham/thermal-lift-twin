"use client";

import type { CardPoint } from "@bgw/physics";
import { X } from "lucide-react";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { easeOut, since, storyData } from "./data";
import { story, type StoryState } from "./store";

// The surface dynamometer card on the last day before the twin's steam date,
// both ways of running the pump, from the wave-equation rod model.

const W = 1000;
const H = 470;
const M = { left: 76, right: 30, top: 24, bottom: 52 };
const X_MAX = 3.8;
const Y_MIN = -12;
const Y_MAX = 92;

const sx = (m: number) => M.left + (m / X_MAX) * (W - M.left - M.right);
const sy = (kN: number) => M.top + ((Y_MAX - kN) / (Y_MAX - Y_MIN)) * (H - M.top - M.bottom);

/** The card as one closed path: the stroke ends where it began, so the last point joins the first. */
function loop(points: CardPoint[]): string {
  return [...points, points[0]!].map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.position_m).toFixed(1)} ${sy(p.load_kN).toFixed(1)}`).join(" ") + " Z";
}

function lowest(points: CardPoint[]): CardPoint {
  return points.reduce((a, b) => (b.load_kN < a.load_kN ? b : a));
}

export function PumpCard({ s }: { s: StoryState }) {
  const { well, asOf } = storyData();
  const { card } = well;
  const k = easeOut(since(s.t, s.panelAt, 500));
  const showToday = easeOut(since(s.t, s.panelAt + 500, 700));
  const showTwin = easeOut(since(s.t, s.panelAt + 2300, 700));
  const labels = since(s.t, s.panelAt + 3400, 500);
  const lowToday = lowest(card.today.surface);
  const lowTwin = lowest(card.twin.surface);
  // Each dot runs its loop at about a quarter of real time, so the twin's longer, slower stroke shows as a slower dot.
  const markAt = (pts: CardPoint[]) => {
    const period_ms = (pts.at(-1)!.t_s + pts[1]!.t_s) * 1000 * 0.26;
    return pts[Math.floor(((s.t / period_ms) % 1) * pts.length)]!;
  };
  const mToday = markAt(card.today.surface);
  const mTwin = markAt(card.twin.surface);

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col gap-3 rounded-[4px] border border-rule-strong bg-sheet p-6 shadow-[0_12px_40px_rgb(59_42_30/0.18)]"
      style={{ opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}
      data-testid="pump-card"
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-[26px] leading-tight font-bold stretch-semi">
            Surface card, {well.wellId}, {shortDate(asOf, card.day_d)}
          </span>
          <span className="text-[16px] text-ink-2">
            Load on the polished rod over one stroke, crude in the tubing at{" "}
            <span className="font-mono text-ink">{fmtInt(card.tubingViscosity_cP)} cP</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => story.setPanel("none")}
          className="flex h-10 items-center gap-2 rounded-[4px] border border-rule-strong bg-sheet px-4 text-[15px] font-semibold text-ink"
          data-testid="close-card"
        >
          <X className="size-4" /> Back to the well
        </button>
      </div>
      <div className="flex items-center gap-8 text-[16px]">
        <span className="flex items-center gap-2.5">
          <span className="h-[3px] w-8 bg-alert" />
          Today, constant speed, {fmtFixed(card.todaySetting.spm, 1)} strokes/min
        </span>
        <span className="flex items-center gap-2.5">
          <span className="h-[3px] w-8 bg-produce" />
          Twin, slow downstroke, {fmtFixed(card.twinSetting.spm, 1)} strokes/min
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block min-h-0 w-full flex-1" role="img" aria-label="Surface dynamometer cards">
        <rect x={sx(0)} y={sy(0)} width={sx(X_MAX) - sx(0)} height={sy(Y_MIN) - sy(0)} fill="var(--alert)" opacity={0.09} />
        {[0, 20, 40, 60, 80].map((v) => (
          <g key={v}>
            <path d={`M${sx(0)} ${sy(v)} H${sx(X_MAX)}`} stroke={v === 0 ? "var(--ink)" : "var(--rule)"} strokeWidth={v === 0 ? 1.6 : 1} />
            <text x={sx(0) - 12} y={sy(v) + 5} textAnchor="end" fontSize={15} fill="var(--ink-2)" className="font-mono">
              {v}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3].map((v) => (
          <text key={v} x={sx(v)} y={H - M.bottom + 26} textAnchor="middle" fontSize={15} fill="var(--ink-2)" className="font-mono">
            {v}
          </text>
        ))}
        <text x={sx(X_MAX)} y={H - 6} textAnchor="end" fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
          rod position, m
        </text>
        <text x={16} y={sy(86)} fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
          load, kN
        </text>
        <text x={sx(X_MAX) - 8} y={sy(Y_MIN) - 8} textAnchor="end" fontSize={16} fontWeight={700} fill="var(--alert)" style={{ fontFamily: "var(--font-archivo)" }}>
          below zero, the rod string is slack
        </text>
        <path d={loop(card.today.surface)} fill="rgb(204 31 26 / 0.05)" stroke="var(--alert)" strokeWidth={3.2} strokeLinejoin="round" opacity={showToday} />
        <path d={loop(card.twin.surface)} fill="rgb(15 118 110 / 0.06)" stroke="var(--produce)" strokeWidth={3.2} strokeLinejoin="round" opacity={showTwin} />
        <circle cx={sx(mToday.position_m)} cy={sy(mToday.load_kN)} r={6.5} fill="var(--alert)" stroke="var(--sheet)" strokeWidth={2} opacity={showToday} />
        <circle cx={sx(mTwin.position_m)} cy={sy(mTwin.load_kN)} r={6.5} fill="var(--produce)" stroke="var(--sheet)" strokeWidth={2} opacity={showTwin} />
        <g opacity={labels}>
          <circle cx={sx(lowToday.position_m)} cy={sy(lowToday.load_kN)} r={5} fill="none" stroke="var(--alert)" strokeWidth={2} />
          <text x={sx(lowToday.position_m)} y={sy(lowToday.load_kN) + 30} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--alert)" className="font-mono">
            {fmtFixed(lowToday.load_kN, 1).replace("-", "−")} kN
          </text>
          <circle cx={sx(lowTwin.position_m)} cy={sy(lowTwin.load_kN)} r={5} fill="none" stroke="var(--produce)" strokeWidth={2} />
          <text x={sx(lowTwin.position_m)} y={sy(lowTwin.load_kN) - 14} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--produce)" className="font-mono">
            +{fmtFixed(lowTwin.load_kN, 1)} kN
          </text>
        </g>
      </svg>
    </div>
  );
}
