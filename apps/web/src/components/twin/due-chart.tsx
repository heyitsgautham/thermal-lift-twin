"use client";

import { shiftSlot, slotSteam_t } from "@bgw/optimise";
import { useMemo } from "react";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import type { Twin } from "./use-twin";

// Why a well is due: its oil rate this cycle against the net average a fresh
// cycle would make. Where the curve crosses that line is the re-steam day.

export function DueChart({ twin, wellId, asOf }: { twin: Twin; wellId: string; asOf: string }) {
  const { field } = twin;
  const anchor = field.anchorCycle(wellId);
  const point = field.currentResteam(wellId);
  const slot = twin.proposal.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d)[0]!;
  const planned_d = slot.start_d;
  const soakEnd = anchor.steamStart_d + anchor.injection_d + anchor.soak_d;
  const curve = field.model(wellId).cycleCurve({
    cycleNumber: anchor.cycleNumber,
    steam_t: slotSteam_t(anchor),
    injectionTemperature_C: anchor.injectionTemperature_C,
    soak_d: anchor.soak_d,
  });

  // What steaming on the re-steam day would add to this well's next 90 days, capacity aside.
  const gain90 = useMemo(() => {
    const bounds = field.slotBounds(twin.proposal, slot.id);
    const target = Math.max(bounds.min_d, point.day_d);
    const moved = field.evaluate(shiftSlot(twin.proposal, slot.id, target - slot.start_d), twin.capacity);
    const now = twin.evalView.timelines.find((t) => t.wellId === wellId)!;
    return moved.timelines.find((t) => t.wellId === wellId)!.oil90_bbl - now.oil90_bbl;
  }, [field, point.day_d, slot.id, slot.start_d, twin.capacity, twin.evalView, twin.proposal, wellId]);

  const bar = point.freshCycleNetAverage_bbl_per_d;
  const from = Math.max(soakEnd, point.day_d - 45);
  const to = planned_d + 12;
  const rate = (d: number) => curve.oil(d - soakEnd);

  let yMax = bar;
  for (let d = from; d <= to; d++) yMax = Math.max(yMax, rate(d));
  yMax *= 1.15;

  const W = 300;
  const H = 100;
  const padT = 6;
  const padB = 15;
  const xs = (d: number) => ((d - from) / (to - from)) * W;
  const ys = (q: number) => padT + (1 - q / yMax) * (H - padT - padB);
  const r2 = (v: number) => v.toFixed(2);

  const line: string[] = [];
  for (let d = from; d <= to; d++) line.push(`${r2(xs(d))},${r2(ys(rate(d)))}`);
  const area = `${r2(xs(from))},${H - padB} ${line.join(" ")} ${r2(xs(to))},${H - padB}`;
  const gap: string[] = [];
  for (let d = point.day_d; d <= planned_d; d++) gap.push(`${r2(xs(d))},${r2(ys(rate(d)))}`);
  const gapPoly = `${r2(xs(point.day_d))},${r2(ys(bar))} ${gap.join(" ")} ${r2(xs(planned_d))},${r2(ys(bar))}`;
  const barY = r2(ys(bar));

  return (
    <figure className="flex flex-col gap-1.5" data-testid="due-chart">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold stretch-semi text-ink">Why {wellId} is due</span>
        <span className="font-mono text-[9.5px] text-ink-3">cycle {anchor.cycleNumber}</span>
      </figcaption>
      {anchor.note && (
        <p className="text-[11.5px] leading-[1.4] text-ink-2">{anchor.note}, so this cycle is cooling faster than planned.</p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${wellId} oil rate against a fresh cycle`}>
        <polygon points={area} fill="var(--produce)" opacity={0.14} />
        <polyline points={line.join(" ")} fill="none" stroke="var(--produce)" strokeWidth={1.8} />
        <polygon points={gapPoly} fill="var(--alert)" opacity={0.28} />
        <line x1={0} x2={W} y1={barY} y2={barY} stroke="var(--ink)" strokeDasharray="4 3" strokeWidth={1} />
        <text x={3} y={Number(barY) - 4} fontSize={9.5} fill="var(--ink)" className="font-mono">
          fresh cycle, net {fmtFixed(bar, 1)} bbl/d
        </text>
        <text x={3} y={padT + 8} fontSize={9.5} fill="var(--produce)" className="font-mono">
          oil rate, this cycle
        </text>
        <line x1={r2(xs(point.day_d))} x2={r2(xs(point.day_d))} y1={padT} y2={H - padB} stroke="var(--ink)" strokeWidth={1.4} />
        <text x={r2(xs(point.day_d) - 3)} y={H - 3} textAnchor="end" fontSize={9.5} fill="var(--ink)" className="font-mono">
          re-steam {shortDate(asOf, point.day_d)}
        </text>
        <line x1={r2(xs(planned_d))} x2={r2(xs(planned_d))} y1={padT} y2={H - padB} stroke="var(--steam)" strokeWidth={1.4} />
        <text x={r2(xs(planned_d) + 3)} y={H - 3} fontSize={9.5} fill="var(--steam)" className="font-mono">
          plan
        </text>
        <line x1={0} x2={W} y1={H - padB + 0.5} y2={H - padB + 0.5} stroke="var(--ink)" strokeOpacity={0.3} />
      </svg>
      <p className="text-[11.5px] leading-[1.4] text-ink-2">
        Its oil rate falls below what a fresh cycle would average on{" "}
        <span className="font-semibold text-ink">{shortDate(asOf, point.day_d)}</span>, {planned_d - point.day_d} days before its
        planned slot. Steaming then adds{" "}
        <span className="font-mono font-semibold text-produce">{fmtInt(gain90)} bbl</span> to its next 90 days, if the generators
        allow it.
      </p>
    </figure>
  );
}
