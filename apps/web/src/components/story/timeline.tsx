"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dayInfo, shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { runOf, stopDay, storyData, FIRST_DAY } from "./data";
import { story, type StoryState } from "./store";

// The cycle on one bar: steam, soak and production, the plan's steam date and
// the twin's. The playhead is the day in view; drag it to scrub.

const D0 = FIRST_DAY - 3;
const D1 = 78;
const BAR_Y = 30;
const BAR_H = 26;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Timeline({ s }: { s: StoryState }) {
  const { asOf, well } = storyData();
  const run = runOf(s.mode);
  const [ref, w] = useWidth<HTMLDivElement>();
  const pad = 14;
  const x = (d: number) => pad + ((d - D0) / (D1 - D0)) * Math.max(1, w - 2 * pad);
  const dayAt = (px: number) => D0 + ((px - pad) / Math.max(1, w - 2 * pad)) * (D1 - D0);
  const dragging = useRef(false);

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    story.scrub(dayAt(e.clientX - e.currentTarget.getBoundingClientRect().left), true);
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    story.scrub(dayAt(e.clientX - e.currentTarget.getBoundingClientRect().left), true);
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    story.scrub(dayAt(e.clientX - e.currentTarget.getBoundingClientRect().left), false);
  };

  const peakOil = Math.max(...run.days.map((d) => d.oil_bbl_per_d));
  const months: number[] = [];
  for (let d = Math.ceil(D0); d <= D1; d++) if (dayInfo(asOf, d).firstOfMonth) months.push(d);
  const stop = stopDay(s.mode);
  const head = x(s.day);
  const today = runOf("today");

  return (
    <div className="flex min-h-0 items-stretch gap-5 rounded-[4px] border border-rule-strong bg-sheet/85 px-5 py-3" data-testid="timeline">
      <div className="flex w-[210px] shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => story.togglePlay()}
          data-testid="play"
          aria-label={s.playing ? "Pause" : "Play"}
          className={cn(
            "grid size-[54px] shrink-0 place-items-center rounded-full text-[#fbf4e8] shadow-[0_4px_12px_rgb(59_42_30/0.25)]",
            s.mode === "twin" ? "bg-produce" : "bg-ink",
          )}
        >
          {s.playing ? <Pause className="size-6" fill="currentColor" /> : <Play className="size-6 translate-x-[2px]" fill="currentColor" />}
        </button>
        <div className="flex flex-col leading-tight">
          <span className="text-[16px] font-bold text-ink">{well.wellId}</span>
          <span className="text-[14px] text-ink-2">
            cycles {well.cycleNumber} and {well.cycleNumber + 1}
          </span>
        </div>
      </div>
      <div ref={ref} className="relative min-w-0 flex-1">
        {w > 0 && (
          <svg
            width={w}
            height={96}
            className="block touch-none select-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            data-testid="timeline-track"
          >
            {months.map((d) => (
              <g key={d}>
                <path d={`M${x(d)} 6 V${BAR_Y + BAR_H + 4}`} stroke="var(--rule-strong)" />
                <text x={x(d) + 6} y={19} fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
                  {dayInfo(asOf, d).month}
                </text>
              </g>
            ))}
            <rect x={x(D0)} y={BAR_Y} width={x(run.days[0]!.d) - x(D0)} height={BAR_H} fill="var(--down)" opacity={0.35} />
            {run.days.map((d) => {
              const fill = d.phase === "steam" ? "var(--steam)" : d.phase === "soak" ? "var(--soak)" : "var(--produce)";
              const op = d.phase === "produce" ? 0.22 + 0.78 * (d.oil_bbl_per_d / peakOil) : 1;
              return <rect key={d.d} x={x(d.d)} y={BAR_Y} width={x(d.d + 1) - x(d.d) + 0.4} height={BAR_H} fill={fill} opacity={op} />;
            })}
            {run.days
              .filter((d) => d.floats && d.d <= s.day)
              .map((d) => (
                <rect key={`f${d.d}`} x={x(d.d) + 0.5} y={BAR_Y + BAR_H + 3} width={x(d.d + 1) - x(d.d) - 1} height={6} fill="var(--alert)" />
              ))}
            {s.mode === "twin" && (
              <g>
                <rect
                  x={x(today.nextSteam_d)}
                  y={BAR_Y - 3}
                  width={x(today.nextSoakEnd_d) - x(today.nextSteam_d)}
                  height={BAR_H + 6}
                  fill="none"
                  stroke="var(--ink-2)"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                />
                <text x={x(today.nextSteam_d) + 4} y={BAR_Y + BAR_H + 30} fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
                  plan {shortDate(asOf, today.nextSteam_d)}
                </text>
              </g>
            )}
            <g>
              <path d={`M${x(0)} ${BAR_Y - 4} V${BAR_Y + BAR_H + 14}`} stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="3 3" />
              <text x={x(0) + 5} y={BAR_Y + BAR_H + 30} fontSize={14} fill="var(--ink)" fontWeight={600} style={{ fontFamily: "var(--font-archivo)" }}>
                today {shortDate(asOf, 0)}
              </text>
            </g>
            <text
              x={x(run.nextSteam_d) + 4}
              y={BAR_Y + BAR_H + 30}
              fontSize={14}
              fontWeight={700}
              fill={s.mode === "twin" ? "var(--produce)" : "var(--steam)"}
              style={{ fontFamily: "var(--font-archivo)" }}
            >
              steam {shortDate(asOf, run.nextSteam_d)}
            </text>
            <path d={`M${x(run.nextSteam_d)} ${BAR_Y + BAR_H} V${BAR_Y + BAR_H + 16}`} stroke={s.mode === "twin" ? "var(--produce)" : "var(--steam)"} strokeWidth={1.6} />
            <rect x={head} y={BAR_Y - 1} width={Math.max(0, x(stop) - head)} height={BAR_H + 2} fill="var(--sheet)" opacity={0.55} />
            <rect x={x(stop)} y={BAR_Y - 1} width={Math.max(0, x(D1) - x(stop))} height={BAR_H + 2} fill="var(--sheet)" opacity={0.8} />
            <path d={`M${head} ${BAR_Y - 4} V${BAR_Y + BAR_H + 6}`} stroke="var(--ink)" strokeWidth={2.4} />
            <path d={`M${head - 6} ${BAR_Y - 9} h12 l-6 7 z`} fill="var(--ink)" />
          </svg>
        )}
      </div>
    </div>
  );
}
