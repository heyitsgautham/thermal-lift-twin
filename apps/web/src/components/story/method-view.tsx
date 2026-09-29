"use client";

import { dateWithYear } from "@/lib/dates";
import { dataset } from "@/lib/dataset";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { easeOut, since } from "./data";
import { SOURCES } from "./sources";
import type { StoryState } from "./store";

// What we read and what the twin is pinned to, then the synthetic history it
// generated from the same physics.

function historyCounts() {
  const counts = new Map<string, number>();
  for (const f of dataset.failures) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  return counts;
}

export function MethodView({ s }: { s: StoryState }) {
  const { history } = dataset;
  const counts = historyCounts();
  const from = Math.round((Date.parse(`${history.from}T00:00:00Z`) - Date.parse(`${dataset.meta.asOf}T00:00:00Z`)) / 86_400_000);
  const appear = (i: number) => easeOut(since(s.t, s.viewAt + 60 + i * 330, 450));
  const reading = Math.floor((s.t - s.viewAt - 4600) / 1500);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6" data-testid="method-view">
      <div className="flex items-baseline gap-4" style={{ opacity: appear(0) }}>
        <h2 className="text-[32px] leading-none font-bold stretch-semi">How we built it</h2>
        <span className="text-[18px] text-ink-2">What we read, and what every number on these screens is pinned to</span>
      </div>
      <div className="grid flex-1 grid-cols-4 grid-rows-[1fr_1fr_auto] gap-4">
        {SOURCES.map((src, i) => {
          const lit = reading === i;
          return (
            <article
              key={src.title}
              className={cn(
                "flex flex-col gap-2.5 rounded-[4px] border bg-sheet/90 p-5",
                lit ? "border-heat shadow-[0_6px_20px_rgb(194_65_12/0.14)]" : "border-rule-strong",
              )}
              style={{ opacity: appear(i + 1), transform: `translateY(${(1 - appear(i + 1)) * 10}px)` }}
            >
              <span className={cn("smallcaps text-[14px] font-bold", i < 4 ? "text-steam" : "text-produce")}>{src.kind}</span>
              <span className="text-[23px] leading-tight font-bold stretch-semi">{src.title}</span>
              <ul className="flex flex-col gap-1">
                {src.facts.map((f) => (
                  <li key={f} className="text-[17px] leading-snug text-ink-2">
                    {f}
                  </li>
                ))}
              </ul>
              <span className="mt-auto font-mono text-[15px] text-ink">{src.cite}</span>
            </article>
          );
        })}
        <article
          className={cn("col-span-4 flex items-center gap-10 rounded-[4px] border bg-ink px-6 py-5 text-[#fbf4e8]", reading === SOURCES.length ? "border-heat" : "border-ink")}
          style={{ opacity: appear(SOURCES.length + 1) }}
        >
          <span className="smallcaps text-[13px] font-bold text-[#f3c1a9]">Synthetic history, same physics</span>
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[34px] font-semibold">{fmtInt(history.dailyRows)}</span>
            <span className="text-[16px] text-[#fbf4e8]/80">daily well records since {dateWithYear(dataset.meta.asOf, from)}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[34px] font-semibold">{dataset.failures.length}</span>
            <span className="text-[16px] text-[#fbf4e8]/80">
              failures: {counts.get("rod parted") ?? 0} rods parted, {counts.get("pump unseated") ?? 0} pumps unseated, {counts.get("tubing leak") ?? 0} tubing leaks
            </span>
          </span>
        </article>
      </div>
    </div>
  );
}
