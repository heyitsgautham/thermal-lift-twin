"use client";

import { Chip, Panel } from "@/components/kit/panel";
import type { CycleView } from "@/lib/cycle-view";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";

// The cycle plan's side panels: the pump schedule step by step, and why the
// steam lands on the day it does.

export function PumpSchedule({ view, asOf }: { view: CycleView; asOf: string }) {
  const next = view.next;
  const cycleNumber = view.anchor.cycleNumber;
  const tailRuns = view.tailPlan.changes.map((c) => ({ ...c, day_d: view.anchorSoakEnd_d + c.t }));
  return (
    <Panel
      title={`Pump schedule, cycle ${cycleNumber}`}
      aside={`${view.tailPlan.stroke_in} in stroke`}
      className="min-h-0 flex-1"
      bodyClassName="overflow-y-auto [scrollbar-width:none]"
    >
      <ol className="flex flex-col px-3.5 py-1" data-testid="pump-schedule">
        {(() => {
          const past = tailRuns.filter((c) => c.day_d < 0);
          const lastPast = past.at(-1);
          return past.length > 0 ? (
            <li className="border-b border-rule py-[6px] text-[11.5px] leading-snug text-ink-3">
              {shortDate(asOf, past[0]!.day_d)} to {shortDate(asOf, -1)}: {past.length} steps, from {past[0]!.text.replace(/^Start at /, "").replace(/, stroke.*$/, "")}{" "}
              down to {lastPast!.text}.
            </li>
          ) : null;
        })()}
        <li className="flex items-center gap-2 py-1.5">
          <span className="smallcaps text-[8.5px] font-bold text-steam">today, {shortDate(asOf, 0)}</span>
          <span className="h-px flex-1 bg-steam/40" />
        </li>
        {(() => {
          const current = [...tailRuns].reverse().find((c) => c.day_d <= 0);
          const ahead = tailRuns.filter((c) => c.day_d > 0);
          const rows = [...(current ? [{ ...current, day_d: 0, label: "now" }] : []), ...ahead.map((c) => ({ ...c, label: `day ${c.t + 1}` }))];
          return rows.map((c) => (
            <li key={`${c.t}-${c.label}`} className="grid grid-cols-[48px_52px_1fr] items-baseline gap-2 border-b border-rule py-[6px]">
              <span className="font-mono text-[10px] text-ink-3">{c.label}</span>
              <span className="font-mono text-[10.5px] text-ink-2">{shortDate(asOf, c.day_d)}</span>
              <span className="text-[12.5px] leading-snug text-ink">{c.text}</span>
            </li>
          ));
        })()}
        {next && (
          <li className="grid grid-cols-[48px_52px_1fr] items-baseline gap-2 py-[6px]">
            <span className="font-mono text-[10px] text-steam">steam</span>
            <span className="font-mono text-[10.5px] font-semibold text-steam">{shortDate(asOf, next.start_d)}</span>
            <span className="text-[12.5px] leading-snug font-semibold text-steam">
              Pump off, {fmtInt(view.nextCycleSteam_t)} t of steam over {next.injection_d} days
            </span>
          </li>
        )}
      </ol>
    </Panel>
  );
}

export function WhyTheseDates({ view, asOf, steamCost_bbl_per_t }: { view: CycleView; asOf: string; steamCost_bbl_per_t: number }) {
  const next = view.next;
  const upcoming = view.days.filter((d) => d.d >= 0 && d.part === "tail");
  const riskDays = upcoming.filter((d) => d.practice && d.practice.floatRatio >= 0.9).length;
  const twinMaxFloat = Math.max(0, ...upcoming.map((d) => d.twin?.floatRatio ?? 0));
  return (
    <Panel title="Why these dates" testId="why-dates">
      <div className="flex flex-col gap-2.5 px-3.5 py-3 text-[12.5px] leading-[1.45] text-ink">
        {next && (
          <p>
            <b className="font-semibold">Re-steam {shortDate(asOf, view.currentResteam.day_d)}.</b> That day the oil rate falls to{" "}
            <span className="font-mono">{fmtFixed(view.currentResteam.oilRate_bbl_per_d, 1)}</span> bbl/d, below the{" "}
            <span className="font-mono">{fmtFixed(view.currentResteam.freshCycleNetAverage_bbl_per_d, 1)}</span> bbl/d a fresh cycle would average
            after paying for its steam at {fmtFixed(steamCost_bbl_per_t, 2)} bbl/t.
          </p>
        )}
        <p className="flex items-start gap-2">
          <Chip tone={riskDays > 0 ? "alert" : "produce"} className="mt-[3px]">
            {riskDays > 0 ? `${riskDays} d at risk` : "no float"}
          </Chip>
          <span>
            {view.practiceFloatFrom_d !== null ? (
              <>
                At constant speed the rods start to float on {shortDate(asOf, view.practiceFloatFrom_d)}, as the crude in the tubing passes{" "}
                <span className="font-mono">
                  {fmtInt(view.days.find((d) => d.d === view.practiceFloatFrom_d)?.tubingViscosity_cP ?? 0)}
                </span>{" "}
                cP.
              </>
            ) : riskDays > 0 ? (
              <>At constant speed the rods run close to floating late in the cycle.</>
            ) : (
              <>The rods stay loaded at constant speed through this plan.</>
            )}{" "}
            The twin&apos;s slow downstroke keeps the float ratio at or under{" "}
            <span className="font-mono">{fmtFixed(Math.max(0.01, twinMaxFloat), 2)}</span>.
          </span>
        </p>
      </div>
    </Panel>
  );
}
