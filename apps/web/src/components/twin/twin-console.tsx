"use client";

import { steamTonnesToCweBbl } from "@bgw/physics";
import type { PlanEvaluation, RepairOption } from "@bgw/optimise";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateRange, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt, fmtShift, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import { runsOf } from "../calendar/runs";
import { DueChart } from "./due-chart";
import type { Twin } from "./use-twin";

/** Value changes smaller than this are rounding, not cost. */
const VALUE_NOISE_BBL = 1;

interface Props {
  twin: Twin;
  asOf: string;
  holdOverload: boolean;
}

function Section({
  title,
  aside,
  children,
  className,
  testId,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cn("border-t border-rule-strong pt-3", className)} data-testid={testId}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="smallcaps text-[9.5px] font-bold text-ink">{title}</h3>
        {aside && <span className="font-mono text-[9.5px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Step({ tone, children }: { tone: "ink" | "alert" | "shift" | "ok"; children: React.ReactNode }) {
  return (
    <li className="rise-in grid grid-cols-[14px_1fr] gap-2 text-[12.5px] leading-[1.4] text-ink">
      <span
        className={cn(
          "mt-[5px] size-[9px] rounded-[1px]",
          tone === "ink" && "bg-ink",
          tone === "alert" && "bg-alert",
          tone === "shift" && "bg-shift",
          tone === "ok" && "bg-produce",
        )}
      />
      <span>{children}</span>
    </li>
  );
}

function overloadSummary(ev: PlanEvaluation, asOf: string) {
  const runs = runsOf(ev.overloadDays);
  let worst = 0;
  for (const d of ev.overloadDays) worst = Math.max(worst, ev.load[d]!.total_t_per_h);
  return {
    days: ev.overloadDays.length,
    ranges: runs.map((r) => dateRange(asOf, r.from, r.to)).join(", "),
    worst,
  };
}

function wellSetTotals(ev: PlanEvaluation, wells: ReadonlySet<string>) {
  let oil = 0;
  let steam = 0;
  for (const t of ev.timelines) {
    if (!wells.has(t.wellId)) continue;
    oil += t.oil90_bbl;
    steam += t.steam90_t;
  }
  return { oil, sor: oil > 0 ? steamTonnesToCweBbl(steam) / oil : null };
}

function OptionRow({ option, chosen }: { option: RepairOption; chosen: boolean }) {
  const result =
    option.status === "clears"
      ? "clears"
      : option.status === "partial"
        ? `${option.overloadDaysAfter} d still over`
        : option.reason;
  return (
    <tr className={cn("border-b border-rule last:border-b-0", chosen && "bg-shift/15")} data-testid={chosen ? "option-chosen" : undefined}>
      <td className="py-[5px] pl-1.5 text-[12px] font-semibold stretch-semi text-ink">{option.wellId}</td>
      <td className="py-[5px] font-mono text-[11px] text-ink">{option.delta_d === null ? "fixed" : fmtShift(option.delta_d)}</td>
      <td className="py-[5px] text-right font-mono text-[11px] text-ink">
        {option.valueChange_bbl === null
          ? ""
          : fmtSigned(option.valueChange_bbl, Math.abs(option.valueChange_bbl) < 10 ? 1 : 0)}
      </td>
      <td className={cn("py-[5px] pr-1.5 pl-3 text-[11.5px]", option.status === "clears" ? "text-produce" : "text-ink-2")}>
        {chosen ? <span className="font-semibold text-ink">chosen</span> : result}
      </td>
    </tr>
  );
}

function Stepper({
  value,
  onDec,
  onInc,
  label,
  decDisabled,
  incDisabled,
}: {
  value: string;
  onDec(): void;
  onInc(): void;
  label: string;
  decDisabled?: boolean;
  incDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon-xs" aria-label={`Lower ${label}`} onClick={onDec} disabled={decDisabled} className="border-rule-strong bg-sheet">
        <Minus />
      </Button>
      <span className="min-w-9 text-center font-mono text-[12px] font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <Button variant="outline" size="icon-xs" aria-label={`Raise ${label}`} onClick={onInc} disabled={incDisabled} className="border-rule-strong bg-sheet">
        <Plus />
      </Button>
    </div>
  );
}

export function TwinConsole({ twin, asOf, holdOverload }: Props) {
  const { stage, evalView, evalCurrent, capacity, edit, repair, drag, field } = twin;
  const total = capacity.units * capacity.unitCapacity_t_per_h;
  const assumptions = field.assumptions;

  const liveOver = overloadSummary(evalView, asOf);
  const editedOver = repair ? overloadSummary(repair.edited, asOf) : liveOver;
  const move = repair?.moves[0] ?? null;
  const chosenOption = repair?.options.find((o) => move && o.slotId === move.slotId) ?? null;
  const clearingOptions = repair?.options.filter((o) => o.status === "clears").length ?? 0;

  const due = field.cssWells
    .map((w) => {
      const point = field.currentResteam(w.id);
      const slot = twin.proposal.filter((s) => s.wellId === w.id).sort((a, b) => a.start_d - b.start_d)[0];
      return { wellId: w.id, due: point.day_d, planned: slot?.start_d ?? null };
    })
    .filter((d) => d.planned !== null && d.due >= 0 && d.planned - d.due >= 5)
    .sort((a, b) => b.planned! - b.due - (a.planned! - a.due))
    .slice(0, 3);

  const changed = new Set<string>([...(edit ? [edit.wellId] : []), ...(repair?.moves.map((m) => m.wellId) ?? [])]);
  const changeBefore = wellSetTotals(evalCurrent, changed);
  const changeAfter = wellSetTotals(evalView, changed);

  let headline: React.ReactNode;
  let sub: React.ReactNode;
  let chip: { text: string; tone: "ok" | "alert" | "shift" | "ink" };
  if (stage === "dragging" && drag) {
    chip = { text: "Checking", tone: "ink" };
    headline = (
      <>
        {drag.wellId} steam {drag.delta_d === 0 ? "held" : fmtShift(drag.delta_d)}
      </>
    );
    sub =
      liveOver.days > 0 ? (
        <span className="text-alert">
          Over capacity on {liveOver.days} {liveOver.days === 1 ? "day" : "days"}, peak {fmtFixed(liveOver.worst, 1)} t/h.
        </span>
      ) : (
        <>Fits. Peak {fmtFixed(evalView.totals.peakLoad_t_per_h, 1)} t/h against {fmtFixed(total, 1)}.</>
      );
  } else if (stage === "overload") {
    chip = { text: "Over capacity", tone: "alert" };
    headline = <span className="text-alert">Generators over capacity on {liveOver.days} days</span>;
    sub = (
      <>
        {liveOver.ranges}, peak {fmtFixed(liveOver.worst, 1)} t/h against {fmtFixed(total, 1)}.
      </>
    );
  } else if (stage === "resolving") {
    chip = { text: "Re-sequencing", tone: "shift" };
    headline = <>Twin is re-sequencing</>;
    sub = <>Trying each other well on those days, one day at a time, up to 21 days either way.</>;
  } else if (stage === "resolved" && repair && move) {
    chip = { text: "Proposal ready", tone: "ok" };
    headline = <>Proposal fits the generators</>;
    sub = (
      <>
        {move.wellId} steam moved {fmtShift(move.delta_d)}. Cheapest of {clearingOptions} {clearingOptions === 1 ? "move" : "moves"} that clear it.
      </>
    );
  } else if (stage === "resolved" && repair && !repair.feasible) {
    chip = { text: "No fit", tone: "alert" };
    headline = <span className="text-alert">No supported proposal</span>;
    sub = <>No single move within 21 days clears the overload. Lower the demand or raise capacity.</>;
  } else if (stage === "resolved") {
    chip = { text: "Fits", tone: "ok" };
    headline = <>Proposal fits the generators</>;
    sub = <>Peak {fmtFixed(evalView.totals.peakLoad_t_per_h, 1)} t/h against {fmtFixed(total, 1)}. No re-sequencing needed.</>;
  } else {
    chip = evalView.overloadDays.length > 0 ? { text: "Over capacity", tone: "alert" } : { text: "Fits", tone: "ok" };
    headline = <>Current plan fits the generators</>;
    sub = (
      <>
        Peak {fmtFixed(evalView.totals.peakLoad_t_per_h, 1)} t/h on {shortDate(asOf, evalView.totals.peakDay_d)} against{" "}
        {fmtFixed(total, 1)} t/h.
      </>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[3px] [scrollbar-width:none] max-[1600px]:gap-2.5 border border-rule-strong bg-sheet/80 px-4 pt-3.5 pb-3 shadow-[0_1px_0_rgb(59_42_30/0.06)]" data-testid="twin-console" data-stage={stage}>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="smallcaps text-[11px] font-bold stretch-wide text-ink">Twin</span>
          <span className="text-[11px] text-ink-3">scheduler</span>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-[2px] px-1.5 py-[3px] smallcaps text-[9px] font-bold",
            chip.tone === "ok" && "bg-produce/12 text-produce",
            chip.tone === "alert" && "bg-alert/12 text-alert",
            chip.tone === "shift" && "bg-shift/20 text-ink",
            chip.tone === "ink" && "bg-ink/8 text-ink",
          )}
        >
          <span
            className={cn(
              "size-[6px] rounded-full",
              chip.tone === "ok" && "bg-produce",
              chip.tone === "alert" && "blink-alert bg-alert",
              chip.tone === "shift" && "blink-alert bg-shift",
              chip.tone === "ink" && "bg-ink",
            )}
          />
          {chip.text}
        </span>
      </div>

      <div className="flex min-h-[64px] flex-col gap-1">
        <p className="text-[19px] leading-[1.15] font-semibold stretch-semi text-ink">{headline}</p>
        <p className="text-[12.5px] leading-[1.4] text-ink-2">{sub}</p>
        {stage === "resolving" && (
          <div className="relative mt-1 h-[3px] overflow-hidden rounded-full bg-shift/20">
            <div className="absolute inset-y-0 w-2/5 rounded-full bg-shift" style={{ animation: "scan 900ms ease-in-out infinite" }} />
          </div>
        )}
        {stage === "overload" && holdOverload && (
          <Button size="sm" className="mt-1 w-fit" onClick={twin.resolveNow}>
            Let the twin resolve
          </Button>
        )}
      </div>

      {edit || repair ? (
        <Section title="What happened" testId="what-happened">
          <ol className="flex flex-col gap-2">
            {edit && (
              <Step tone="ink">
                You moved <b className="font-semibold">{edit.wellId}</b> steam {Math.abs(edit.delta_d)} d{" "}
                {edit.delta_d < 0 ? "earlier" : "later"}, to start {shortDate(asOf, edit.toStart_d)}.
              </Step>
            )}
            {editedOver.days > 0 && (stage === "overload" || stage === "resolving" || stage === "resolved") && (
              <Step tone="alert">
                Generators over capacity on {editedOver.days} {editedOver.days === 1 ? "day" : "days"}, {editedOver.ranges}. Peak{" "}
                {fmtFixed(editedOver.worst, 1)} t/h against {fmtFixed(total, 1)}.
              </Step>
            )}
            {stage === "resolved" && move && (
              <Step tone="shift">
                Twin moved <b className="font-semibold">{move.wellId}</b> steam {Math.abs(move.delta_d)} d{" "}
                {move.delta_d > 0 ? "later" : "earlier"}, to start {shortDate(asOf, move.toStart_d)}, which clears every
                overloaded day. {move.wellId} gives up {fmtInt(Math.abs(move.oilChange_bbl))} bbl inside the 90 days
                {move.valueChange_bbl > -VALUE_NOISE_BBL
                  ? " and makes it back after day 90."
                  : `, a net cost of ${fmtInt(-move.valueChange_bbl)} bbl once later oil is counted.`}
              </Step>
            )}
          </ol>
        </Section>
      ) : (
        <Section title="Due for steam" aside={due.length > 0 ? "re-steam day before planned slot" : undefined} testId="due-for-steam">
          {due.length > 0 ? (
            <ul className="flex flex-col">
              {due.map((d) => (
                <li key={d.wellId} className="grid grid-cols-[62px_1fr_auto] items-baseline gap-2 border-b border-rule py-[5px] last:border-b-0">
                  <span className="text-[12.5px] font-semibold stretch-semi text-ink">{d.wellId}</span>
                  <span className="text-[11.5px] text-ink-2">
                    due {shortDate(asOf, d.due)}, planned {shortDate(asOf, d.planned!)}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-ink">{d.planned! - d.due} d late</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-ink-2">Every planned slot is on or before its re-steam day.</p>
          )}
          <p className="mt-2 text-[11.5px] leading-[1.45] text-ink-3">
            Drag a steam block to move a cycle. The twin checks the generators and re-sequences if they overload.
          </p>
          {due[0] && (
            <div className="mt-3 border-t border-rule pt-3">
              <DueChart twin={twin} wellId={due[0].wellId} asOf={asOf} />
            </div>
          )}
        </Section>
      )}

      {stage === "resolved" && repair && repair.options.length > 0 && (
        <Section title="Options tested" aside={`${repair.tested.slots} wells · ${repair.tested.shifts} shifts`} testId="options-tested">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-rule-strong text-left">
                <th className="pb-1 pl-1.5 smallcaps text-[8.5px] font-semibold text-ink-3">Well</th>
                <th className="pb-1 smallcaps text-[8.5px] font-semibold text-ink-3">Move</th>
                <th className="pb-1 text-right smallcaps text-[8.5px] font-semibold text-ink-3">Value, bbl</th>
                <th className="pb-1 pl-3 smallcaps text-[8.5px] font-semibold text-ink-3">Result</th>
              </tr>
            </thead>
            <tbody>
              {repair.options.slice(0, 4).map((o) => (
                <OptionRow key={`${o.wellId}-${o.slotId}`} option={o} chosen={o === chosenOption} />
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[10.5px] leading-[1.4] text-ink-3">
            Value is 90-day oil, less steam at {fmtFixed(assumptions.steamCost_bbl_per_t, 2)} bbl/t, plus what each cycle
            carries past day 90.
          </p>
        </Section>
      )}

      {twin.dirty && stage !== "dragging" && changed.size > 0 && (
        <Section title="Wells in this change" aside={[...changed].join(" · ")} testId="wells-change">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="smallcaps text-[8.5px] font-semibold text-ink-3">Oil, 90 days</span>
              <span className="font-mono text-[13px] text-ink">
                {fmtInt(changeBefore.oil)} <span className="text-ink-3">→</span> {fmtInt(changeAfter.oil)}
              </span>
              <span className={cn("font-mono text-[10.5px] font-semibold", changeAfter.oil >= changeBefore.oil ? "text-produce" : "text-alert")}>
                {fmtSigned(changeAfter.oil - changeBefore.oil)} bbl
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="smallcaps text-[8.5px] font-semibold text-ink-3">Steam-oil ratio</span>
              <span className="font-mono text-[13px] text-ink">
                {changeBefore.sor === null ? "n/a" : fmtFixed(changeBefore.sor, 2)} <span className="text-ink-3">→</span>{" "}
                {changeAfter.sor === null ? "n/a" : fmtFixed(changeAfter.sor, 2)}
              </span>
              <span className="font-mono text-[10.5px] text-ink-3">CWE bbl per bbl</span>
            </div>
          </div>
        </Section>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1 disabled:bg-sand-deep disabled:text-ink-3 disabled:opacity-100"
          disabled={!twin.dirty || stage !== "resolved" || (repair !== null && !repair.feasible)}
          onClick={twin.adopt}
          data-testid="adopt"
        >
          Adopt proposal
        </Button>
        <Button variant="outline" className="border-rule-strong bg-sheet" onClick={twin.reset} data-testid="reset">
          <RotateCcw data-icon="inline-start" />
          Reset
        </Button>
      </div>

      <Section title="Assumptions" className="mt-auto" aside="settings">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] leading-tight font-semibold stretch-semi text-ink">
              Steam generators
              <span className="block text-[10.5px] font-normal text-ink-3">units × t/h each</span>
            </span>
            <div className="flex items-center gap-1.5">
              <Stepper
                label="generator units"
                value={String(capacity.units)}
                decDisabled={capacity.units <= 1}
                incDisabled={capacity.units >= 3}
                onDec={() => twin.setCapacity({ ...capacity, units: capacity.units - 1 })}
                onInc={() => twin.setCapacity({ ...capacity, units: capacity.units + 1 })}
              />
              <span className="text-[11px] text-ink-3">×</span>
              <Stepper
                label="capacity per unit"
                value={fmtFixed(capacity.unitCapacity_t_per_h, 1)}
                decDisabled={capacity.unitCapacity_t_per_h <= 8}
                incDisabled={capacity.unitCapacity_t_per_h >= 16}
                onDec={() => twin.setCapacity({ ...capacity, unitCapacity_t_per_h: capacity.unitCapacity_t_per_h - 0.5 })}
                onInc={() => twin.setCapacity({ ...capacity, unitCapacity_t_per_h: capacity.unitCapacity_t_per_h + 0.5 })}
              />
            </div>
          </div>
          <p className={cn("text-[10.5px] leading-[1.45] text-ink-3", (edit || repair) && "hidden")}>
            OIL has not published generator capacity. {twin.defaultCapacity.units} ×{" "}
            {fmtFixed(twin.defaultCapacity.unitCapacity_t_per_h, 1)} t/h is our assumption. Steam is priced at{" "}
            {fmtFixed(assumptions.steamCost_bbl_per_t, 2)} bbl oil per tonne in the re-steam rule.
          </p>
        </div>
      </Section>
    </aside>
  );
}
