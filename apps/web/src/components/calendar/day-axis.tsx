"use client";

import { dayInfo, shortDate } from "@/lib/dates";
import { useNoOverlap } from "@/lib/use-no-overlap";
import { useMemo, useRef } from "react";
import type { Geometry } from "./geometry";
import type { DayRun } from "./runs";

export function DayAxis({ geo, asOf }: { geo: Geometry; asOf: string }) {
  const days = useMemo(
    () => Array.from({ length: geo.horizon_d }, (_, d) => dayInfo(asOf, d)),
    [asOf, geo.horizon_d],
  );
  const everyDay = geo.dayPx >= 17;
  const ref = useRef<HTMLDivElement>(null);
  useNoOverlap(ref, [geo.dayPx, geo.x0, asOf], 5);
  return (
    <div ref={ref} className="absolute" style={{ left: 0, top: geo.axisTop, width: geo.width, height: geo.axisH }}>
      <div
        className="absolute flex items-end justify-between whitespace-nowrap pr-2"
        style={{ left: geo.padX, width: geo.labelW, top: 0, height: geo.axisH - 2 }}
      >
        <span className="smallcaps text-[9.5px] font-semibold text-ink-2">Well · cycle</span>
        <span className="smallcaps text-[9.5px] text-ink-3">oil today</span>
      </div>
      {days.map((info) => {
        const left = geo.x0 + info.day * geo.dayPx;
        const startsMonth = info.firstOfMonth || info.day === 0;
        return (
          <div key={info.day}>
            {startsMonth && (
              <span
                data-label={info.firstOfMonth ? 0 : 1}
                className="absolute smallcaps whitespace-nowrap text-[10px] leading-none font-semibold text-ink"
                style={{ left: left + 3, top: 0 }}
              >
                {info.day === 0 && !info.firstOfMonth ? info.month : `${info.month} ${info.year}`}
              </span>
            )}
            {info.monday && (
              <span data-label={2} className="absolute whitespace-nowrap font-mono text-[9px] leading-none text-ink-3" style={{ left: left + 3, top: 1 }}>
                W{info.isoWeek}
              </span>
            )}
            {!everyDay && (
              <span
                className="absolute w-px bg-ink/25"
                style={{ left: left, height: info.monday ? 6 : 3, bottom: 0 }}
              />
            )}
            {(everyDay || info.monday || info.day === 0) && (
              <span
                data-label={info.day === 0 ? 0 : info.monday ? 1 : 3}
                className={`absolute text-center font-mono text-[9.5px] leading-none ${
                  info.day === 0 ? "font-bold text-ink" : info.monday ? "font-semibold text-ink" : "text-ink-3"
                }`}
                style={everyDay ? { left, width: geo.dayPx, bottom: 3 } : { left: left + 2, bottom: 5 }}
              >
                {info.dayOfMonth}
              </span>
            )}
          </div>
        );
      })}
      <div
        className="absolute smallcaps text-right text-[9.5px] font-semibold text-ink-2"
        style={{ left: geo.x0 + geo.gridW + 4, width: geo.oilW - 4, bottom: 3 }}
      >
        Oil 90 d, bbl
      </div>
      <span className="sr-only">Day 0 is {shortDate(asOf, 0)}</span>
    </div>
  );
}

/** Day, week and month rules behind the rows, plus the overloaded-day wash. */
export function GridLines({
  geo,
  asOf,
  overload,
  top,
}: {
  geo: Geometry;
  asOf: string;
  overload: DayRun[];
  top: number;
}) {
  const height = geo.bottom - top;
  return (
    <>
      <svg className="pointer-events-none absolute" style={{ left: geo.x0, top }} width={geo.gridW + 1} height={height}>
        {Array.from({ length: geo.horizon_d + 1 }, (_, d) => {
          const info = dayInfo(asOf, d);
          const strong = info.firstOfMonth;
          const week = info.monday;
          const xx = d * geo.dayPx + 0.5;
          return (
            <line
              key={d}
              x1={xx}
              x2={xx}
              y1={0}
              y2={height}
              stroke="var(--ink)"
              strokeOpacity={d === 0 || d === geo.horizon_d ? 0.55 : strong ? 0.3 : week ? 0.16 : 0.06}
            />
          );
        })}
      </svg>
      {overload.map((run) => (
        <div
          key={run.from}
          className="pointer-events-none absolute border-x border-dashed border-alert/70 bg-alert/[0.07]"
          style={{
            left: geo.x0 + run.from * geo.dayPx,
            width: (run.to - run.from + 1) * geo.dayPx + 1,
            top: geo.laneTop,
            height: geo.bottom - geo.laneTop,
          }}
        />
      ))}
    </>
  );
}
