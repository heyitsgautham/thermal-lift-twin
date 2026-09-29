"use client";

import type { Capacity, PlanEvaluation } from "@bgw/optimise";
import { fmtFixed } from "@/lib/format";
import type { Geometry } from "./geometry";
import { runsOf } from "./runs";

interface Props {
  geo: Geometry;
  evaluation: PlanEvaluation;
  capacity: Capacity;
  /** Load the edited plan asked for, shown as a dashed ghost once the twin has cleared it. */
  cleared: PlanEvaluation | null;
  wellTone: Map<string, number>;
  editedWells: ReadonlySet<string>;
  movedWells: ReadonlySet<string>;
  focusWell: string | null;
}

export function GeneratorLane({
  geo,
  evaluation,
  capacity,
  cleared,
  wellTone,
  editedWells,
  movedWells,
  focusWell,
}: Props) {
  const total = capacity.units * capacity.unitCapacity_t_per_h;
  const peak = Math.max(
    evaluation.totals.peakLoad_t_per_h,
    cleared ? cleared.totals.peakLoad_t_per_h : 0,
  );
  const yMax = Math.max(total * 1.3, peak + 2);
  const chartTop = 18;
  const h = geo.laneH;
  const y = (v: number) => h - (v / yMax) * (h - chartTop);
  const x = (d: number) => d * geo.dayPx;
  const barInset = geo.dayPx >= 10 ? 1 : 0.5;

  const overRuns = runsOf(evaluation.overloadDays);
  const clearedRuns = cleared ? runsOf(cleared.overloadDays) : [];

  const bandLabels = Array.from({ length: capacity.units }, (_, u) => ({
    name: `SG-${u + 1}`,
    mid: y((u + 0.5) * capacity.unitCapacity_t_per_h),
  }));

  return (
    <div className="absolute" style={{ left: 0, top: geo.laneTop, width: geo.width, height: h }} data-testid="generator-lane">
      <div className="absolute flex flex-col" style={{ left: geo.padX, top: 0, width: geo.labelW - 14 }}>
        <span className="smallcaps whitespace-nowrap text-[10px] font-semibold text-ink">
          {geo.compact ? "Generators" : "Steam generators"}
        </span>
        <span className="text-[10.5px] leading-tight text-ink-2">
          load, t/h
        </span>
      </div>
      {bandLabels.map((b) => (
        <div
          key={b.name}
          className="absolute flex items-baseline justify-end gap-1.5 pr-2"
          style={{ left: geo.padX, width: geo.labelW - 4, top: b.mid - 7, height: 14 }}
        >
          <span className="text-[11px] font-semibold stretch-semi text-ink">{b.name}</span>
          <span className="font-mono text-[9.5px] text-ink-3">{fmtFixed(capacity.unitCapacity_t_per_h, 1)}</span>
        </div>
      ))}

      <svg
        className="absolute overflow-visible"
        style={{ left: geo.x0, top: 0 }}
        width={geo.gridW}
        height={h}
        role="img"
        aria-label="Steam generator load by day"
      >
        <defs>
          <pattern id="hatch-alert" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--alert)" opacity="0.18" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--alert)" strokeWidth="2.2" />
          </pattern>
        </defs>

        {Array.from({ length: capacity.units }, (_, u) => (
          <rect
            key={u}
            x={0}
            width={geo.gridW}
            y={y((u + 1) * capacity.unitCapacity_t_per_h)}
            height={y(u * capacity.unitCapacity_t_per_h) - y((u + 1) * capacity.unitCapacity_t_per_h)}
            fill="var(--ink)"
            opacity={u % 2 === 0 ? 0.035 : 0.065}
          />
        ))}
        {Array.from({ length: capacity.units - 1 }, (_, u) => (
          <line
            key={u}
            x1={0}
            x2={geo.gridW}
            y1={Math.round(y((u + 1) * capacity.unitCapacity_t_per_h)) + 0.5}
            y2={Math.round(y((u + 1) * capacity.unitCapacity_t_per_h)) + 0.5}
            stroke="var(--ink)"
            strokeOpacity={0.28}
            strokeDasharray="2 3"
          />
        ))}

        {evaluation.load.map((day, d) => {
          let base = 0;
          return day.segments.map((seg, i) => {
            const y1 = y(base + seg.rate_t_per_h);
            const y0 = y(base);
            base += seg.rate_t_per_h;
            const edited = editedWells.has(seg.wellId);
            const moved = movedWells.has(seg.wellId);
            const tone = wellTone.get(seg.wellId) ?? 0;
            const fill = edited ? "var(--ink)" : moved ? "var(--shift)" : tone % 2 === 0 ? "var(--steam)" : "var(--steam-deep)";
            const dim = focusWell && focusWell !== seg.wellId && !edited && !moved;
            return (
              <rect
                key={`${d}-${i}`}
                x={x(d) + barInset}
                width={geo.dayPx - 2 * barInset}
                y={y1}
                height={Math.max(0, y0 - y1 - 0.75)}
                fill={fill}
                opacity={dim ? 0.62 : 1}
                style={{ transition: "y 380ms ease, height 380ms ease, opacity 450ms ease" }}
              >
                <title>{`${seg.wellId} ${fmtFixed(seg.rate_t_per_h, 1)} t/h`}</title>
              </rect>
            );
          });
        })}

        {clearedRuns.map((run) => {
          const days = run.to - run.from + 1;
          const top = Math.min(...Array.from({ length: days }, (_, i) => y(cleared!.load[run.from + i]!.total_t_per_h)));
          return (
            <g key={`c-${run.from}`} className="rise-in">
              <rect
                x={x(run.from) + 0.5}
                width={days * geo.dayPx - 1}
                y={top}
                height={y(total) - top}
                fill="none"
                stroke="var(--alert)"
                strokeWidth={1.25}
                strokeDasharray="3 2"
                opacity={0.85}
              />
              <text
                x={x(run.from) + (days * geo.dayPx) / 2}
                y={Math.max(9, top - 4)}
                textAnchor="middle"
                className="font-mono"
                fontSize={10}
                fontWeight={600}
                fill="var(--produce)"
              >
                {`${days} d cleared`}
              </text>
            </g>
          );
        })}

        {evaluation.overloadDays.map((d) => {
          const t = evaluation.load[d]!.total_t_per_h;
          return (
            <rect
              key={`o-${d}`}
              x={x(d) + barInset}
              width={geo.dayPx - 2 * barInset}
              y={y(t)}
              height={y(total) - y(t)}
              fill="url(#hatch-alert)"
              stroke="var(--alert)"
              strokeWidth={1}
            />
          );
        })}

        {overRuns.map((run) => {
          const days = run.to - run.from + 1;
          let worst = 0;
          for (let d = run.from; d <= run.to; d++) worst = Math.max(worst, evaluation.load[d]!.total_t_per_h);
          const cx = x(run.from) + (days * geo.dayPx) / 2;
          return (
            <g key={`ol-${run.from}`}>
              <text
                x={cx}
                y={Math.max(10, y(worst) - 5)}
                textAnchor="middle"
                className="font-mono"
                fontSize={10.5}
                fontWeight={600}
                fill="var(--alert)"
              >
                {`${fmtFixed(worst, 1)} t/h`}
              </text>
            </g>
          );
        })}

        <line
          x1={0}
          x2={geo.gridW}
          y1={Math.round(y(total)) + 0.5}
          y2={Math.round(y(total)) + 0.5}
          stroke="var(--ink)"
          strokeWidth={1.25}
        />
        <line x1={0} x2={geo.gridW} y1={h - 0.5} y2={h - 0.5} stroke="var(--ink)" strokeOpacity={0.35} />
      </svg>

      <div
        className="absolute flex items-center gap-1 rounded-[2px] bg-sheet px-1"
        style={{ left: geo.x0 + geo.gridW + 6, top: Math.round(y(total)) - 8, height: 16 }}
      >
        <span className="font-mono text-[10px] font-semibold text-ink">{fmtFixed(total, 1)}</span>
      </div>
      <div
        className="absolute smallcaps text-[8.5px] text-ink-3"
        style={{ left: geo.x0 + geo.gridW + 7, top: Math.round(y(total)) + 8 }}
      >
        capacity
      </div>
    </div>
  );
}
