"use client";

import { PumpjackMark } from "@/components/shell/app-header";
import { dataset } from "@/lib/dataset";
import { dateWithYear } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoryData } from "../data";
import { hud, lerp, smooth } from "../script";
import { FIELD_SOURCES, historyFacts, MODEL_SOURCES, type Source } from "../sources";
import { PANEL } from "./well-hud";
import { BRAND, orgLine, eventLine } from "@/lib/brand";

// The close: a year on the field, what the twin is built from, and the end card.

const isoDate = (iso: string) => dateWithYear(iso, 0);

export function YearPanel({ t, data }: { t: number; data: StoryData }) {
  const a = hud(t, "year", 0.6);
  if (a <= 0.001) return null;
  const { before, after, wells } = data.year;
  const pct = (b: number, x: number) => `${Math.round((x / b - 1) * 100)}%`.replace("-", "−");
  const cols: { label: string; unit: string; b: number; x: number; digits: number; note: string }[] = [
    { label: "Rod-float days", unit: "a year", b: before.floatDays, x: after.floatDays, digits: 0, note: "on any well" },
    { label: "Rod and pump failures", unit: "expected a year", b: before.expectedFailures, x: after.expectedFailures, digits: 2, note: pct(before.expectedFailures, after.expectedFailures) },
    { label: "Pump electricity", unit: "kWh per barrel", b: before.kWhPerBbl, x: after.kWhPerBbl, digits: 2, note: pct(before.kWhPerBbl, after.kWhPerBbl) },
  ];
  return (
    <div className={cn(PANEL, "absolute top-[118px] left-1/2 w-[1060px] -translate-x-1/2 px-8 pt-6 pb-6")} style={{ opacity: a }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[28px] font-extrabold tracking-[-0.01em] stretch-semi text-ink">A year on the field</span>
        <span className="text-[15px] text-ink-2">
          {wells} wells on cyclic steam · model result on synthetic data
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-6">
        {cols.map((c, i) => {
          const k = smooth((t - (162.6 + i * 1.3)) / 0.5);
          const roll = smooth((t - (163.4 + i * 1.3)) / 1.2);
          return (
            <div key={c.label} className="flex flex-col gap-1 border-l border-rule-strong pl-5 first:border-l-0 first:pl-0" style={{ opacity: k }}>
              <span className="text-[18px] font-bold text-ink">{c.label}</span>
              <span className="text-[14.5px] text-ink-2">{c.unit}</span>
              <div className="mt-2 flex items-baseline gap-3 font-mono">
                <span className="text-[30px] text-ink-3 line-through decoration-2">{fmtFixed(c.b, c.digits)}</span>
                <span className="text-[52px] leading-none font-medium tracking-[-0.03em] text-produce">{fmtFixed(lerp(c.b, c.x, roll), c.digits)}</span>
              </div>
              <span className="text-[16px] font-semibold text-produce" style={{ opacity: roll }}>
                {c.note}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-5 border-t border-rule pt-3 text-[15px] text-ink-2">
        Today&apos;s practice against the twin, one design cycle per well, annualised. Same oil and same steam; the gain is in the rods and the power.
      </p>
    </div>
  );
}

function SourceItem({ s, k }: { s: Source; k: number }) {
  return (
    <li className="flex flex-col gap-0.5 border-t border-rule py-2.5 first:border-t-0" style={{ opacity: k, transform: `translateY(${(1 - k) * 6}px)` }}>
      <span className="text-[16px] font-bold text-ink">{s.label}</span>
      <span className="text-[15px] text-ink-2">
        <span className="italic">{s.title}</span> · {s.detail}
      </span>
    </li>
  );
}

export function SourcesPanel({ t }: { t: number }) {
  const a = hud(t, "sources", 0.6);
  if (a <= 0.001) return null;
  const h = historyFacts(dataset);
  const at = (i: number) => smooth((t - (177.6 + i * 0.9)) / 0.5);
  return (
    <div className={cn(PANEL, "absolute top-[96px] left-1/2 w-[1240px] -translate-x-1/2 px-8 pt-6 pb-6")} style={{ opacity: a }}>
      <span className="text-[30px] font-extrabold tracking-[-0.01em] stretch-semi text-ink">How we built it</span>
      <div className="mt-4 grid grid-cols-2 gap-10">
        <div>
          <span className="text-[15px] font-bold tracking-[0.08em] text-heat uppercase">The field, as published</span>
          <ul className="mt-1">
            {FIELD_SOURCES.map((s, i) => (
              <SourceItem key={s.label} s={s} k={at(i)} />
            ))}
          </ul>
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-[0.08em] text-produce uppercase">The physics the twin runs</span>
          <ul className="mt-1">
            {MODEL_SOURCES.map((s, i) => (
              <SourceItem key={s.label} s={s} k={at(i + 4)} />
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1 rounded-[4px] bg-sand-deep/70 px-5 py-3" style={{ opacity: at(8.4) }}>
        <span className="text-[16px] font-bold text-ink">Synthetic history, from the same physics</span>
        <span className="font-mono text-[15px] text-ink">
          {fmtInt(h.dailyRecords)} daily records · {isoDate(h.from)} to {isoDate(h.to)} · {h.failures} failures: {h.rodsParted} rods parted, {h.pumpsUnseated} pumps unseated,{" "}
          {h.tubingLeaks} tubing leaks
        </span>
      </div>
    </div>
  );
}

export function EndCard({ t }: { t: number }) {
  const a = hud(t, "end", 0.7);
  if (a <= 0.001) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#f4ebdd]" style={{ opacity: a }}>
      <div className="pointer-events-none absolute inset-10 rounded-[3px] border border-rule-strong" />
      <div className="flex w-[940px] flex-col gap-9" style={{ transform: `translateY(${(1 - smooth((t - 198.4) / 1)) * 12}px)` }}>
        <div className="flex items-center gap-6">
          <PumpjackMark size={2.8} />
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-bold tracking-[0.1em] text-steam uppercase">{orgLine()}</span>
            <span className="text-[80px] leading-[0.95] font-extrabold tracking-[-0.02em] stretch-semi text-ink">{BRAND.product}</span>
          </div>
        </div>
        <p className="max-w-[820px] text-[27px] leading-[1.3] text-ink">Steam on the right day, and run the pump to the cooling curve.</p>
        <div className="flex items-end justify-between gap-8 border-t border-rule-strong pt-6">
          <span className="text-[17px] font-bold tracking-[0.06em] text-ink uppercase">Working prototype on synthetic data</span>
          <span className="text-right text-[22px] leading-tight font-semibold stretch-semi text-ink">
            Team 2
            <br />
            <span className="text-[17px] font-medium text-ink-2">Saveetha Engineering College</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function Fade({ t }: { t: number }) {
  const a = hud(t, "fade", 0.75);
  if (a <= 0.001) return null;
  return <div className="absolute inset-0 bg-[#f3eadc]" style={{ opacity: a }} />;
}

export function Footer({ t }: { t: number }) {
  const a = 1 - hud(t, "end", 0.7);
  return (
    <div className="absolute right-0 bottom-0 left-0 flex h-[26px] items-center justify-between bg-sheet/90 px-6" style={{ opacity: a }}>
      <span className="text-[13px] font-semibold tracking-[0.08em] text-ink-2 uppercase">Working prototype · synthetic data</span>
      <span className="font-mono text-[13px] text-ink-2">{eventLine}</span>
    </div>
  );
}
