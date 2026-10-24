"use client";

import { useMemo } from "react";
import { useTwinContext } from "@/components/twin/twin-provider";
import { buildCycleView, type CycleView } from "@/lib/cycle-view";

// Hooks the cycle plan, pump twin, what-if and model screens share.

export function useCycleView(wellId: string): CycleView {
  const { twin } = useTwinContext();
  // The "was" marker compares with the plan as issued, so it survives adopting the proposal.
  const { dataset } = useTwinContext();
  const { field, proposal } = twin;
  const issued = dataset.issuedPlan;
  return useMemo(() => buildCycleView(field, wellId, proposal, issued), [field, proposal, issued, wellId]);
}

export function useCssWellOptions() {
  const { field } = useTwinContext().twin;
  return useMemo(
    () =>
      field.cssWells
        .map((w) => ({ id: w.id, number: w.number, note: `cycle ${field.anchorCycle(w.id).cycleNumber}` }))
        .sort((a, b) => a.number - b.number),
    [field],
  );
}
