"use client";

import { X } from "lucide-react";
import { fmtFixed, fmtInt } from "@/lib/format";
import { easeOut, since, storyData } from "./data";
import { story, type StoryState } from "./store";

// One year of the field's steam wells, the twin against today, from the engine's fieldYear.

export function YearOverlay({ s }: { s: StoryState }) {
  const { year } = storyData();
  const at = s.field.yearAt;
  const k = easeOut(since(s.t, at, 500));
  const tiles = [
    { label: "Rod-float days a year", before: year.before.floatDays, after: year.after.floatDays, digits: 0, unit: "" },
    { label: "Expected rod and pump failures a year", before: year.before.failures, after: year.after.failures, digits: 2, unit: "" },
    { label: "Pump electricity per barrel", before: year.before.kWhPerBbl, after: year.after.kWhPerBbl, digits: 2, unit: "kWh" },
  ];
  const fmt = (v: number, digits: number) => (digits === 0 ? fmtInt(v) : fmtFixed(v, digits));
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col gap-6 rounded-[4px] border border-rule-strong bg-sheet p-8 shadow-[0_12px_40px_rgb(59_42_30/0.18)]"
      style={{ opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}
      data-testid="year-overlay"
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="text-[34px] leading-none font-bold stretch-semi">One year on the field</h2>
          <span className="text-[18px] text-ink-2">
            {year.wells} steam wells, one cycle each at design steam, the twin against today
          </span>
        </div>
        <button
          type="button"
          onClick={() => story.showYear(false)}
          className="flex h-10 items-center gap-2 rounded-[4px] border border-rule-strong bg-sheet px-4 text-[15px] font-semibold text-ink"
        >
          <X className="size-4" /> Back
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-5">
        {tiles.map((tile, i) => {
          const c = easeOut(since(s.t, at + 700 + i * 900, 1500));
          const shown = tile.before + (tile.after - tile.before) * c;
          const unit = tile.unit ? ` ${tile.unit}` : "";
          return (
            <div
              key={tile.label}
              className="grid grid-cols-[300px_1fr] items-center gap-8 rounded-[4px] border border-rule-strong bg-sand/50 px-7 py-5"
              style={{ opacity: easeOut(since(s.t, at + 400 + i * 900, 500)) }}
            >
              <span className="text-[22px] leading-snug font-semibold text-ink">{tile.label}</span>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="w-14 shrink-0 text-[17px] text-ink-2">today</span>
                  <div className="h-7 rounded-[3px] bg-ink-3/45" style={{ width: "calc((100% - 300px) * 1)" }} />
                  <span className="font-mono text-[28px] text-ink-2">
                    {fmt(tile.before, tile.digits)}
                    <span className="text-[17px]">{unit}</span>
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-14 shrink-0 text-[17px] font-semibold text-produce">twin</span>
                  <div className="h-7 rounded-[3px] bg-produce" style={{ width: `max(4px, calc((100% - 300px) * ${(shown / tile.before).toFixed(4)}))` }} />
                  <span className="font-mono text-[46px] leading-none font-semibold text-produce">
                    {fmt(shown, tile.digits)}
                    <span className="text-[20px]">{unit}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <span className="text-[16px] text-ink-2">
        Model result on synthetic data. Field oil and steam-oil ratio stay the same; the gain is in rods, pumps and power.
      </span>
    </div>
  );
}
