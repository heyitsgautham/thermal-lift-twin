import { FieldModel, slotSteam_t, type FieldDataset, type CycleInstance } from "@bgw/optimise";
import { analyseHero } from "./hero";

// Schedule tables for the Python API. The API schedules on the same oil
// curves the TypeScript twin computes, so the two can never drift apart on
// physics: `pnpm gen` exports each cycle's daily oil curve and re-steam leg,
// and `golden` records the TypeScript answer to the demo edit for the API's
// tests to match.

const CURVE_DAYS = 600;

export interface CycleTable {
  slotId: string | null;
  cycleNumber: number;
  start_d: number;
  injection_d: number;
  soak_d: number;
  rate_t_per_h: number;
  steam_t: number;
  productionLeg_d: number;
  oil: number[];
}

export interface ScheduleTables {
  horizon_d: number;
  steamCost_bbl_per_t: number;
  minProductionLeg_d: number;
  capacity: { units: number; unitCapacity_t_per_h: number };
  css: { wellId: string; opportunityRate_bbl_per_d: number; anchor: CycleTable; slots: CycleTable[] }[];
  cold: { wellId: string; oil: number[] }[];
  downtime: Record<string, number[]>;
  issuedPlan: FieldDataset["issuedPlan"];
  golden: {
    editedSlotId: string;
    editedStart_d: number;
    moves: { slotId: string; wellId: string; delta_d: number; valueChange_bbl: number; oilChange_bbl: number }[];
    editedOverloadDays: number[];
    issuedValue_bbl: number;
    proposalValue_bbl: number;
    proposalOil90_bbl: number;
  };
}

function table(field: FieldModel, wellId: string, c: CycleInstance): CycleTable {
  const curve = field.curveFor(wellId, c);
  const oil: number[] = [];
  for (let t = 0; t < CURVE_DAYS; t++) oil.push(curve.oil(t));
  return {
    slotId: c.slotId,
    cycleNumber: c.cycleNumber,
    start_d: c.start_d,
    injection_d: c.injection_d,
    soak_d: c.soak_d,
    rate_t_per_h: c.rate_t_per_h,
    steam_t: slotSteam_t(c),
    productionLeg_d: field.resteamOf(wellId, c).productionLeg_d,
    oil,
  };
}

export function scheduleTables(dataset: FieldDataset): ScheduleTables {
  const field = new FieldModel(dataset);
  const capacity = {
    units: dataset.assumptions.generatorUnits,
    unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
  };
  const issued = field.evaluate(dataset.issuedPlan, capacity);
  const hero = analyseHero(dataset);
  const downtime: Record<string, number[]> = {};
  for (const e of dataset.downtime) {
    const days = (downtime[e.wellId] ??= []);
    for (let d = e.start_d; d < e.start_d + e.duration_d; d++) days.push(d);
  }
  return {
    horizon_d: dataset.meta.horizon_d,
    steamCost_bbl_per_t: dataset.assumptions.steamCost_bbl_per_t,
    minProductionLeg_d: dataset.assumptions.minProductionLeg_d,
    capacity,
    css: field.cssWells.map((w) => {
      const [anchor, ...slots] = field.cyclesFor(w.id, dataset.issuedPlan);
      return {
        wellId: w.id,
        opportunityRate_bbl_per_d: field.opportunityRate(w.id),
        anchor: table(field, w.id, anchor!),
        slots: slots.map((s) => table(field, w.id, s)),
      };
    }),
    cold: issued.timelines
      .filter((t) => t.kind === "cold")
      .map((t) => ({
        wellId: t.wellId,
        oil: Array.from({ length: field.horizon_d }, (_, d) => field.model(t.wellId).coldState(d).oil_bbl_per_d),
      })),
    downtime,
    issuedPlan: dataset.issuedPlan,
    golden: {
      editedSlotId: hero.summary.slotId,
      editedStart_d: hero.summary.plannedStart_d + hero.summary.delta_d,
      moves: hero.repair.moves.map((m) => ({
        slotId: m.slotId,
        wellId: m.wellId,
        delta_d: m.delta_d,
        valueChange_bbl: m.valueChange_bbl,
        oilChange_bbl: m.oilChange_bbl,
      })),
      editedOverloadDays: hero.repair.edited.overloadDays,
      issuedValue_bbl: issued.totals.value_bbl,
      proposalValue_bbl: hero.repair.after.totals.value_bbl,
      proposalOil90_bbl: hero.repair.after.totals.fieldOil90_bbl,
    },
  };
}
