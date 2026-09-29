import { FieldModel, repairPlan, shiftSlot, type FieldDataset, type RepairResult } from "@bgw/optimise";

// Replays the demo story on a dataset without a browser: move the story well's
// next steam slot to its re-steam day, then let the twin repair the plan.
// Tests use it to hold the fixture to the story; the UI runs the same
// functions live when the presenter drags.

export const HERO_WELL = "BGW-14";

export interface HeroSummary {
  wellId: string;
  slotId: string;
  plannedStart_d: number;
  resteamDay_d: number;
  delta_d: number;
  overloadDays: number[];
  peakEdited_t_per_h: number;
  moves: { wellId: string; delta_d: number; oilChange_bbl: number; valueChange_bbl: number }[];
  issuedOil90_bbl: number;
  proposalOil90_bbl: number;
  issuedSor90: number | null;
  proposalSor90: number | null;
  feasible: boolean;
}

export function analyseHero(
  dataset: FieldDataset,
  wellId = HERO_WELL,
): { summary: HeroSummary; repair: RepairResult } {
  const field = new FieldModel(dataset);
  const capacity = {
    units: dataset.assumptions.generatorUnits,
    unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
  };
  const plan = dataset.issuedPlan;
  const slot = plan.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d)[0];
  if (!slot) throw new Error(`${wellId} has no planned steam slot in the window`);
  const resteam = field.currentResteam(wellId);
  const bounds = field.slotBounds(plan, slot.id);
  const target = Math.min(bounds.max_d, Math.max(bounds.min_d, resteam.day_d));
  const delta = target - slot.start_d;
  const edited = shiftSlot(plan, slot.id, delta);
  const repair = repairPlan(field, edited, new Set([slot.id]), capacity);
  const issued = field.evaluate(plan, capacity);
  return {
    repair,
    summary: {
      wellId,
      slotId: slot.id,
      plannedStart_d: slot.start_d,
      resteamDay_d: resteam.day_d,
      delta_d: delta,
      overloadDays: repair.edited.overloadDays,
      peakEdited_t_per_h: repair.edited.totals.peakLoad_t_per_h,
      moves: repair.moves.map((m) => ({
        wellId: m.wellId,
        delta_d: m.delta_d,
        oilChange_bbl: Math.round(m.oilChange_bbl),
        valueChange_bbl: Math.round(m.valueChange_bbl),
      })),
      issuedOil90_bbl: Math.round(issued.totals.fieldOil90_bbl),
      proposalOil90_bbl: Math.round(repair.after.totals.fieldOil90_bbl),
      issuedSor90: issued.totals.sor90,
      proposalSor90: repair.after.totals.sor90,
      feasible: repair.feasible,
    },
  };
}
