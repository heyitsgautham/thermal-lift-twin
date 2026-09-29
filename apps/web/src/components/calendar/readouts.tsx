"use client";

import type { Capacity, PlanEvaluation } from "@bgw/optimise";
import { fmtFixed, fmtInt, fmtPercent, fmtSigned } from "@/lib/format";
import { Readout } from "@/components/kit/readout";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";

// Field readouts. The big number is the plan on screen (the proposal once it
// differs), the line under it compares against the plan in force.

function Delta({ value, digits = 0, unit, goodWhen }: { value: number; digits?: number; unit?: string; goodWhen: "up" | "down" }) {
  const zero = Number(value.toFixed(digits)) === 0;
  const good = goodWhen === "up" ? value > 0 : value < 0;
  return (
    <span className={cn("font-mono font-semibold", zero ? "text-ink-3" : good ? "text-produce" : "text-alert")}>
      {fmtSigned(value, digits)}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

export function Readouts({
  view,
  base,
  capacity,
  dirty,
}: {
  view: PlanEvaluation;
  base: PlanEvaluation;
  capacity: Capacity;
  dirty: boolean;
}) {
  const oil = useTween(view.totals.fieldOil90_bbl);
  const sor = useTween(view.totals.sor90 ?? 0);
  const steam = useTween(view.totals.steam90_t);
  const peak = useTween(view.totals.peakLoad_t_per_h);
  const total = capacity.units * capacity.unitCapacity_t_per_h;
  const over = view.overloadDays.length;
  const oilDelta = view.totals.fieldOil90_bbl - base.totals.fieldOil90_bbl;
  const sorDelta = (view.totals.sor90 ?? 0) - (base.totals.sor90 ?? 0);
  const steamDelta = view.totals.steam90_t - base.totals.steam90_t;

  return (
    <div className="grid shrink-0 grid-cols-[repeat(4,auto)] gap-x-5 max-[1600px]:gap-x-3.5" data-testid="readouts" data-dirty={dirty}>
      <Readout
        testId="readout-oil"
        label="Field oil, 90 days"
        value={fmtInt(oil)}
        unit="bbl"
        note={
          dirty ? (
            <>
              <Delta value={oilDelta} unit="bbl" goodWhen="up" />{" "}
              <span className="font-mono">({fmtPercent(oilDelta / base.totals.fieldOil90_bbl, 1)})</span> vs current
            </>
          ) : (
            <>current plan, {fmtInt(view.totals.fieldOil90_bbl / view.load.length)} bbl/d</>
          )
        }
      />
      <Readout
        testId="readout-sor"
        label="Steam-oil ratio"
        value={view.totals.sor90 === null ? "Not defined" : fmtFixed(sor, 2)}
        note={
          dirty ? (
            <>
              <Delta value={sorDelta} digits={2} goodWhen="down" /> from{" "}
              <span className="font-mono">{fmtFixed(base.totals.sor90 ?? 0, 2)}</span>
            </>
          ) : (
            <>CSS wells, CWE bbl per bbl</>
          )
        }
      />
      <Readout
        testId="readout-steam"
        label="Steam, 90 days"
        value={fmtInt(steam)}
        unit="t"
        note={
          dirty ? (
            <>
              <Delta value={steamDelta} unit="t" goodWhen="down" /> vs current
            </>
          ) : (
            <>{fmtFixed(view.totals.steam90_t / view.load.length / 24, 1)} t/h average</>
          )
        }
      />
      <Readout
        testId="readout-generators"
        label="Generator load"
        tone={over > 0 ? "alert" : "ink"}
        value={over > 0 ? `${over} d over` : fmtFixed(peak, 1)}
        unit={over > 0 ? undefined : "t/h peak"}
        note={
          <>
            of <span className="font-mono">{fmtFixed(total, 1)}</span> t/h, assumed
          </>
        }
      />
    </div>
  );
}
