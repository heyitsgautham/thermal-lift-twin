"use client";

import { useEffect } from "react";
import { PumpjackMark } from "@/components/shell/app-header";
import { longDate, shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { easeOut, since, storyData } from "./data";
import { FieldView } from "./field-view";
import { MethodView } from "./method-view";
import { PumpCard } from "./pump-card";
import { story, useStory, type StoryState, type View } from "./store";
import { Timeline } from "./timeline";
import { WellDrawing } from "./well-drawing";
import { WellPanel } from "./well-panel";
import { BRAND, orgLine } from "@/lib/brand";

// The demo story: BGW-14's cycle today and with the twin, the pump card, the
// field's shared steam, one year on the field, and what it was built from.

declare global {
  interface Window {
    __story?: {
      advance(ms: number): void;
      setView(v: View): void;
      lowerThird(on: boolean): void;
      state(): StoryState;
      events(): { t: number; name: string }[];
      summary(): Record<string, unknown>;
    };
  }
}

const NAV: { id: View; label: string }[] = [
  { id: "well", label: "Well BGW-14" },
  { id: "field", label: "Field" },
  { id: "method", label: "Method" },
];

function TopBar({ s }: { s: StoryState }) {
  const { asOf } = storyData();
  return (
    <header className="flex h-[58px] shrink-0 items-stretch justify-between border-b border-rule-strong px-6">
      <div className="flex items-center gap-3">
        <PumpjackMark size={1.25} />
        <div className="flex flex-col leading-none">
          <span className="smallcaps text-[16px] font-extrabold stretch-wide text-ink">{BRAND.product}</span>
          <span className="mt-1.5 text-[14px] text-ink-2">{orgLine()}</span>
        </div>
      </div>
      <nav className="flex items-stretch" aria-label="Views">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            data-testid={`nav-${n.id}`}
            onClick={() => story.setView(n.id)}
            className={cn(
              "relative px-6 text-[17px] font-semibold",
              s.view === n.id ? "text-ink" : "text-ink-3",
            )}
          >
            {n.label}
            {s.view === n.id && <span className="absolute inset-x-5 bottom-0 h-[3px] bg-steam" />}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-[15px] text-ink-2">
        <span>
          as of <span className="font-semibold text-ink">{longDate(asOf, 0)}</span>
        </span>
        <span className="rounded-[3px] border border-rule-strong px-2 py-0.5 text-[14px]">synthetic data</span>
      </div>
    </header>
  );
}

function LowerThird({ s }: { s: StoryState }) {
  const k = s.lowerThird ? easeOut(since(s.t, s.lowerThirdAt, 700)) : 1 - easeOut(since(s.t, s.lowerThirdAt, 500));
  if (k <= 0.001) return null;
  return (
    <div
      className="pointer-events-none absolute bottom-[22px] left-9 z-20 flex items-stretch gap-4 rounded-[4px] bg-ink/95 py-4 pr-7 pl-5 text-[#fbf4e8] shadow-[0_10px_30px_rgb(47_33_24/0.35)]"
      style={{ opacity: k, transform: `translateX(${(1 - k) * -40}px)` }}
      data-testid="lower-third"
    >
      <span className="w-1.5 rounded-full bg-steam" />
      <div className="flex flex-col gap-1.5">
        <span className="text-[30px] leading-none font-extrabold stretch-semi">{BRAND.product}</span>
        <span className="text-[17px] text-[#fbf4e8]/85">{orgLine()} · Team 2, Saveetha Engineering College</span>
      </div>
    </div>
  );
}

function EndView({ s }: { s: StoryState }) {
  const k = (i: number) => easeOut(since(s.t, s.viewAt + 200 + i * 500, 700));
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="end-view">
      <div className="pointer-events-none absolute inset-10 rounded-[3px] border border-rule-strong" />
      <div className="flex w-[980px] flex-col gap-10">
        <div className="flex items-center gap-6" style={{ opacity: k(0), transform: `translateY(${(1 - k(0)) * 10}px)` }}>
          <PumpjackMark size={2.8} />
          <div className="flex flex-col gap-2">
            <span className="smallcaps text-[16px] font-bold text-steam">{orgLine()}</span>
            <h1 className="text-[76px] leading-[0.95] font-extrabold tracking-[-0.02em] stretch-semi text-ink">{BRAND.product}</h1>
          </div>
        </div>
        <p className="text-[28px] leading-[1.3] text-ink" style={{ opacity: k(1) }}>
          Steam the right well on the right day, and run its pump to the cooling curve.
        </p>
        <div className="flex items-end justify-between gap-8 border-t border-rule-strong pt-6" style={{ opacity: k(2) }}>
          <div className="flex flex-col gap-2">
            <span className="smallcaps text-[15px] font-bold text-ink">Working prototype on synthetic data</span>
            <span className="text-[17px] text-ink-2">Built from {BRAND.field ? `${BRAND.field}'s` : "OIL's"} published field numbers</span>
          </div>
          <span className="text-right text-[22px] leading-tight font-semibold stretch-semi text-ink">
            Team 2
            <br />
            <span className="text-[18px] font-medium text-ink-2">Saveetha Engineering College</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Cursor({ s }: { s: StoryState }) {
  if (!s.cursor.seen) return null;
  const age = s.t - s.cursor.tapAt;
  const tap = age >= 0 && age < 450 ? age / 450 : null;
  return (
    <>
      {tap !== null && (
        <div
          className="pointer-events-none fixed z-[60] rounded-full border-[2.5px] border-heat"
          style={{
            left: s.cursor.x,
            top: s.cursor.y,
            width: 40,
            height: 40,
            opacity: 0.9 * (1 - tap),
            transform: `translate(-50%, -50%) scale(${0.3 + 0.9 * easeOut(tap)})`,
          }}
        />
      )}
      <svg
        className="pointer-events-none fixed z-[61]"
        style={{ left: s.cursor.x - 4, top: s.cursor.y - 2, filter: "drop-shadow(0 2px 3px rgba(59,42,30,0.35))" }}
        width={28}
        height={28}
        viewBox="0 0 28 28"
        aria-hidden
      >
        <path d="M4 2 L4 21 L9 16.5 L12.6 24.5 L15.8 23.1 L12.2 15.4 L19.5 15.4 Z" fill="#2a1d14" stroke="#fbf7f0" strokeWidth={1.7} strokeLinejoin="round" />
      </svg>
    </>
  );
}

export function StoryApp() {
  const s = useStory();

  useEffect(() => {
    const record = new URLSearchParams(window.location.search).has("record");
    const onMove = (e: PointerEvent) => story.cursorTo(e.clientX, e.clientY);
    const onDown = () => story.tap();
    if (record) {
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerdown", onDown, true);
      window.__story = {
        advance: (ms) => story.advance(ms),
        setView: (v) => story.setView(v),
        lowerThird: (on) => story.setLowerThird(on),
        state: () => story.get(),
        events: () => story.events,
        summary: () => {
          const { well, fieldStory, year, asOf } = storyData();
          const prod = well.today.days.filter((d) => d.phase === "produce" && d.cycleNumber === well.cycleNumber);
          const late = (days: typeof prod) => days.filter((d) => d.d < 30).at(-1)!.setting!.spm;
          const twinProd = well.twin.days.filter((d) => d.phase === "produce" && d.cycleNumber === well.cycleNumber);
          const firstFloat = well.today.days.find((d) => d.floats)!;
          return {
            asOf,
            restTemperature_C: well.rest.temperature_C,
            restViscosity_cP: Math.round(well.rest.tubingViscosity_cP),
            injection_d: well.injection_d,
            designInjection_d: well.designInjection_d,
            note: well.note,
            steam_t: well.steam_t,
            designSteam_t: well.designSteam_t,
            hottest_C: Math.max(...prod.map((d) => d.temperature_C)),
            thinnest_cP: Math.min(...prod.map((d) => d.tubingViscosity_cP)),
            firstOil: prod[0]!.oil_bbl_per_d,
            todaySpmLate: late(prod),
            twinSpmLate: late(twinProd),
            todayFirstFloat: shortDate(asOf, firstFloat.d),
            floatStartTubing_cP: firstFloat.tubingViscosity_cP,
            todaySteam: shortDate(asOf, well.today.nextSteam_d),
            twinSteam: shortDate(asOf, well.twin.nextSteam_d),
            cardDate: shortDate(asOf, well.card.day_d),
            plannedSteam_d: well.plannedSteam_d,
            resteam_d: well.resteam_d,
            todayFloatDays: well.today.floatDays.length,
            twinFloatDays: well.twin.floatDays.length,
            todayPeakRatio: well.today.peakFloatRatio,
            twinPeakRatio: well.twin.peakFloatRatio,
            samePeriod: well.samePeriod,
            card: { day_d: well.card.day_d, tubing_cP: well.card.tubingViscosity_cP, todayMin_kN: well.card.today.minLoad_kN, twinMin_kN: well.card.twin.minLoad_kN, todaySpm: well.card.todaySetting.spm, twinSpm: well.card.twinSetting.spm },
            field: {
              overloadDays: fieldStory.repair.edited.overloadDays,
              peak_t_per_h: fieldStory.repair.edited.totals.peakLoad_t_per_h,
              capacity_t_per_h: fieldStory.repair.edited.capacity_t_per_h,
              moves: fieldStory.repair.moves,
              clears: fieldStory.repair.options.filter((o) => o.status === "clears").length,
              change: fieldStory.change,
            },
            year,
          };
        },
      };
      return () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerdown", onDown, true);
        delete window.__story;
      };
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      story.advance(Math.min(50, now - last));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-testid="story">
      {s.view !== "end" && <TopBar s={s} />}
      {s.view === "well" && (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_500px] grid-rows-[minmax(0,1fr)_128px] gap-3 p-4">
          <section className="relative min-h-0 overflow-hidden rounded-[4px] border border-rule-strong bg-sheet/60">
            <WellDrawing s={s} />
            {s.panel === "card" && <PumpCard s={s} />}
          </section>
          <WellPanel s={s} />
          <div className="col-span-2 min-h-0">
            <Timeline s={s} />
          </div>
        </div>
      )}
      {s.view === "field" && <FieldView s={s} />}
      {s.view === "method" && <MethodView s={s} />}
      {s.view === "end" && <EndView s={s} />}
      <LowerThird s={s} />
      {s.view !== "end" && <Cursor s={s} />}
    </div>
  );
}
