import {
  apiToSpecificGravity,
  heatedZoneStartTemperature_C,
  simulateStroke,
  steamTonnesToCweBbl,
  tubingViscosity_cP as tubingCrude_cP,
  viscosity_cP,
  type StrokeResult,
} from "@bgw/physics";
import { shiftSlot, type CycleInstance, type FieldModel, type PlanEvaluation } from "./field-model";
import { operatingPlan, type OperatingPlan, type PumpSetting } from "./operating";
import { practiceLeg_d } from "./policy";
import { cumulativeHazard, dailyImpact, DEFAULT_RELIABILITY, type ReliabilityAssumptions } from "./reliability";
import { repairPlan, type RepairResult } from "./repair";
import { resteamPoint } from "./resteam";
import { slotSteam_t, type Capacity } from "./types";
import { CREW_REACTION_D } from "./what-if";

// The before-and-after story the demo walks, computed from the same engine as
// every other screen. One well, BGW-14, lives through its cycle twice:
//
//   today  the issued plan's steam date, and the pump at constant speed with a
//          pump-off timer, the way the crew runs it now.
//   twin   the re-steam day from the marginal-value rule, and the twin's pump
//          schedule that follows the cooling curve.
//
// Then the field: the same steam move on the shared generators, and one year
// of the 19 steam wells under each way of working.

export const STORY_WELL = "BGW-14";

export type StoryMode = "today" | "twin";
export type StoryPhase = "steam" | "soak" | "produce";

export interface StoryDay {
  d: number;
  phase: StoryPhase;
  cycleNumber: number;
  /**
   * Heated-zone temperature. From the end of soak it is the engine's cooling
   * curve. During injection it moves in a straight line from the rock's
   * temperature to the cycle's start temperature, and holds through soak.
   */
  temperature_C: number;
  viscosity_cP: number;
  /** Viscosity at the tubing's mean temperature, which sets rod drag. The one viscosity the story shows. */
  tubingViscosity_cP: number;
  oil_bbl_per_d: number;
  /** Steam injected so far in this day's cycle. */
  steamed_t: number;
  setting: PumpSetting | null;
  floats: boolean;
}

export interface StoryRun {
  mode: StoryMode;
  nextSteam_d: number;
  nextSoakEnd_d: number;
  nextCycleNumber: number;
  nextSteam_t: number;
  /** Every day from the current cycle's first steam day to `end_d`. */
  days: StoryDay[];
  end_d: number;
  /** Production days on which the rods float, downstroke faster than they can fall. */
  floatDays: number[];
  peakFloatRatio: number;
}

export interface WellStory {
  wellId: string;
  /** The rock and its crude before the steam job starts. */
  rest: { temperature_C: number; viscosity_cP: number; tubingViscosity_cP: number };
  cycleNumber: number;
  anchorStart_d: number;
  injection_d: number;
  designInjection_d: number;
  soak_d: number;
  soakEnd_d: number;
  steam_t: number;
  designSteam_t: number;
  injectionTemperature_C: number;
  note: string | null;
  plannedSteam_d: number;
  resteam_d: number;
  today: StoryRun;
  twin: StoryRun;
  /** Today to the twin's steam date, the days both ways of working pump the same oil. */
  samePeriod: { from_d: number; to_d: number; oil_bbl: number; today_kWh: number; twin_kWh: number; change_frac: number };
  /** The last day before the twin's steam date, when the crude is at its thickest. */
  card: {
    day_d: number;
    tubingViscosity_cP: number;
    todaySetting: PumpSetting;
    twinSetting: PumpSetting;
    today: StrokeResult;
    twin: StrokeResult;
  };
}

/** Production days of the next cycle the story shows, so the pump is seen running hot again. */
const NEXT_CYCLE_DAYS = 12;

function spec(c: CycleInstance) {
  return {
    cycleNumber: c.cycleNumber,
    steam_t: slotSteam_t(c),
    injectionTemperature_C: c.injectionTemperature_C,
    soak_d: c.soak_d,
  };
}

function pick(day: { twin: PumpSetting; practice: PumpSetting }, mode: StoryMode): PumpSetting {
  return mode === "twin" ? day.twin : day.practice;
}

function buildRun(field: FieldModel, wellId: string, anchor: CycleInstance, next: CycleInstance, mode: StoryMode): StoryRun {
  const model = field.model(wellId);
  const css = model.well.css!;
  const Tr = model.fluid.reservoirTemperature_C;
  const thickness = (T: number) => viscosity_cP(model.fluid.viscosity, T);
  const soakEnd = anchor.start_d + anchor.injection_d + anchor.soak_d;
  const tail: OperatingPlan = operatingPlan(model.fluid, css, spec(anchor), next.start_d - soakEnd);
  const nextSoakEnd = next.start_d + next.injection_d + next.soak_d;
  const head: OperatingPlan = operatingPlan(model.fluid, css, spec(next), NEXT_CYCLE_DAYS);
  const end_d = nextSoakEnd + NEXT_CYCLE_DAYS - 1;

  const shutIn = (c: CycleInstance, d: number, fromT: number): StoryDay => {
    const start = heatedZoneStartTemperature_C(model.fluid, spec(c));
    const rel = d - c.start_d;
    const injecting = rel < c.injection_d;
    const temperature_C = injecting ? fromT + (start - fromT) * ((rel + 1) / c.injection_d) : start;
    return {
      d,
      phase: injecting ? "steam" : "soak",
      cycleNumber: c.cycleNumber,
      temperature_C,
      viscosity_cP: thickness(temperature_C),
      tubingViscosity_cP: tubingCrude_cP(model.fluid, temperature_C),
      oil_bbl_per_d: 0,
      steamed_t: c.rate_t_per_h * 24 * Math.min(rel + 1, c.injection_d),
      setting: null,
      floats: false,
    };
  };

  const days: StoryDay[] = [];
  const floatDays: number[] = [];
  let peak = 0;
  for (let d = anchor.start_d; d <= end_d; d++) {
    if (d < soakEnd) {
      days.push(shutIn(anchor, d, Tr));
    } else if (d < next.start_d) {
      const op = tail.days[d - soakEnd]!;
      const setting = pick(op, mode);
      const floats = setting.floatRatio >= 1;
      if (floats) floatDays.push(d);
      peak = Math.max(peak, setting.floatRatio);
      days.push({
        d,
        phase: "produce",
        cycleNumber: anchor.cycleNumber,
        temperature_C: op.temperature_C,
        viscosity_cP: op.viscosity_cP,
        tubingViscosity_cP: op.tubingViscosity_cP,
        oil_bbl_per_d: op.oil_bbl_per_d,
        steamed_t: slotSteam_t(anchor),
        setting,
        floats,
      });
    } else if (d < nextSoakEnd) {
      days.push(shutIn(next, d, tail.days.at(-1)!.temperature_C));
    } else {
      const op = head.days[d - nextSoakEnd]!;
      const setting = pick(op, mode);
      days.push({
        d,
        phase: "produce",
        cycleNumber: next.cycleNumber,
        temperature_C: op.temperature_C,
        viscosity_cP: op.viscosity_cP,
        tubingViscosity_cP: op.tubingViscosity_cP,
        oil_bbl_per_d: op.oil_bbl_per_d,
        steamed_t: slotSteam_t(next),
        setting,
        floats: setting.floatRatio >= 1,
      });
    }
  }
  return {
    mode,
    nextSteam_d: next.start_d,
    nextSoakEnd_d: nextSoakEnd,
    nextCycleNumber: next.cycleNumber,
    nextSteam_t: slotSteam_t(next),
    days,
    end_d,
    floatDays,
    peakFloatRatio: peak,
  };
}

export function wellStory(field: FieldModel, wellId = STORY_WELL): WellStory {
  const model = field.model(wellId);
  const css = model.well.css!;
  const [anchor, planned] = field.cyclesFor(wellId, field.dataset.issuedPlan);
  if (!anchor || !planned) throw new Error(`${wellId} needs a running cycle and a planned steam slot`);
  const resteam = field.currentResteam(wellId);
  const moved: CycleInstance = { ...planned, start_d: resteam.day_d };
  const today = buildRun(field, wellId, anchor, planned, "today");
  const twin = buildRun(field, wellId, anchor, moved, "twin");

  let oil = 0;
  let todayKWh = 0;
  let twinKWh = 0;
  const soakEnd = anchor.start_d + anchor.injection_d + anchor.soak_d;
  const tail = operatingPlan(model.fluid, css, spec(anchor), resteam.day_d - soakEnd);
  for (const op of tail.days) {
    if (soakEnd + op.t < 0) continue;
    oil += op.oil_bbl_per_d;
    todayKWh += op.practice.energy_kWh;
    twinKWh += op.twin.energy_kWh;
  }

  const last = tail.days.at(-1)!;
  const density = apiToSpecificGravity(model.fluid.api_deg) * 1000;
  const stroke = (s: PumpSetting) =>
    simulateStroke({
      stroke_in: s.stroke_in,
      spm: s.spm,
      upstrokeFraction: s.upstrokeFraction,
      viscosity_cP: last.tubingViscosity_cP,
      fluidDensity_kg_per_m3: density,
      plungerDiameter_in: css.pump.plungerDiameter_in,
      fillage_frac: Math.max(0.3, s.fillage_frac),
    });

  const record = field.dataset.cycles.find((c) => c.wellId === wellId && c.cycleNumber === anchor.cycleNumber);
  return {
    wellId,
    rest: {
      temperature_C: model.fluid.reservoirTemperature_C,
      viscosity_cP: viscosity_cP(model.fluid.viscosity, model.fluid.reservoirTemperature_C),
      tubingViscosity_cP: tubingCrude_cP(model.fluid, model.fluid.reservoirTemperature_C),
    },
    cycleNumber: anchor.cycleNumber,
    anchorStart_d: anchor.start_d,
    injection_d: anchor.injection_d,
    designInjection_d: css.design.injection_d,
    soak_d: anchor.soak_d,
    soakEnd_d: soakEnd,
    steam_t: slotSteam_t(anchor),
    designSteam_t: css.design.injectionRate_t_per_h * 24 * css.design.injection_d,
    injectionTemperature_C: anchor.injectionTemperature_C,
    note: record?.note ?? null,
    plannedSteam_d: planned.start_d,
    resteam_d: resteam.day_d,
    today,
    twin,
    samePeriod: {
      from_d: 0,
      to_d: resteam.day_d - 1,
      oil_bbl: oil,
      today_kWh: todayKWh,
      twin_kWh: twinKWh,
      change_frac: twinKWh / todayKWh - 1,
    },
    card: {
      day_d: soakEnd + last.t,
      tubingViscosity_cP: last.tubingViscosity_cP,
      todaySetting: last.practice,
      twinSetting: last.twin,
      today: stroke(last.practice),
      twin: stroke(last.twin),
    },
  };
}

export interface FieldStory {
  capacity: Capacity;
  wellId: string;
  slotId: string;
  from_d: number;
  to_d: number;
  issued: PlanEvaluation;
  repair: RepairResult;
  /** The wells the edit and the twin's fix touch, over the 90-day window. */
  change: { wells: string[]; oilBefore_bbl: number; oilAfter_bbl: number; sorBefore: number; sorAfter: number };
}

/** The story's steam move on the field: BGW-14 to its re-steam day, then the twin's repair. */
export function fieldStory(field: FieldModel, wellId = STORY_WELL): FieldStory {
  const { dataset } = field;
  const capacity = {
    units: dataset.assumptions.generatorUnits,
    unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
  };
  const slot = dataset.issuedPlan.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d)[0]!;
  const to_d = field.currentResteam(wellId).day_d;
  const edited = shiftSlot(dataset.issuedPlan, slot.id, to_d - slot.start_d);
  const repair = repairPlan(field, edited, new Set([slot.id]), capacity);
  const issued = field.evaluate(dataset.issuedPlan, capacity);
  const wells = [wellId, ...repair.moves.map((m) => m.wellId)];
  const totals = (ev: PlanEvaluation) => {
    let oil = 0;
    let steam = 0;
    for (const t of ev.timelines) {
      if (!wells.includes(t.wellId)) continue;
      oil += t.oil90_bbl;
      steam += t.steam90_t;
    }
    return { oil, sor: steamTonnesToCweBbl(steam) / oil };
  };
  const before = totals(issued);
  const after = totals(repair.after);
  return {
    capacity,
    wellId,
    slotId: slot.id,
    from_d: slot.start_d,
    to_d,
    issued,
    repair,
    change: { wells, oilBefore_bbl: before.oil, oilAfter_bbl: after.oil, sorBefore: before.sor, sorAfter: after.sor },
  };
}

export interface YearSide {
  oil_bbl: number;
  steam_t: number;
  sor: number;
  floatDays: number;
  failures: number;
  kWhPerBbl: number;
}

/**
 * One year of the field's steam wells, each running its next cycle at design
 * steam, annualised by cycle length. Before: the practice production leg and
 * the pump at constant speed, with the crew slowing a pounding unit after
 * CREW_REACTION_D days. After: the re-steam rule's leg and the twin's pump.
 * Expected failures come from the stated Weibull hazard on impact loading plus
 * the base rate, so this is a model result on synthetic data, not a forecast.
 */
export function fieldYear(
  field: FieldModel,
  reliability: ReliabilityAssumptions = DEFAULT_RELIABILITY,
): { wells: number; before: YearSide; after: YearSide } {
  const acc = {
    before: { oil: 0, steam: 0, float: 0, hazard: 0, kWh: 0 },
    after: { oil: 0, steam: 0, float: 0, hazard: 0, kWh: 0 },
  };
  for (const w of field.cssWells) {
    const model = field.model(w.id);
    const design = w.css!.design;
    const n = field.anchorCycle(w.id).cycleNumber + 1;
    const steam = design.injectionRate_t_per_h * 24 * design.injection_d;
    const cycle = { cycleNumber: n, steam_t: steam, injectionTemperature_C: design.injectionTemperature_C, soak_d: design.soak_d };
    const legBefore = practiceLeg_d(field, w.id, n);
    const legAfter = resteamPoint(
      model.cycleCurve(cycle),
      { start_d: 0, injection_d: design.injection_d, soak_d: design.soak_d },
      { curve: model.cycleCurve({ ...cycle, cycleNumber: n + 1 }), injection_d: design.injection_d, soak_d: design.soak_d, steam_t: steam },
      field.assumptions.steamCost_bbl_per_t,
      field.assumptions.minProductionLeg_d,
    ).productionLeg_d;
    for (const [side, leg, mode] of [
      ["before", legBefore, "today"],
      ["after", legAfter, "twin"],
    ] as const) {
      const plan = operatingPlan(model.fluid, w.css!, cycle, leg);
      let oil = 0;
      let kWh = 0;
      let float = 0;
      let band = 0;
      let impact = 0;
      for (const d of plan.days) {
        const s = pick(d, mode);
        oil += d.oil_bbl_per_d;
        kWh += s.energy_kWh;
        if (s.floatRatio >= 1) float++;
        if (s.floatRatio > reliability.impactFromRatio) {
          band++;
          if (mode === "twin" || band <= CREW_REACTION_D) impact += dailyImpact(s.floatRatio, reliability);
        }
      }
      const length = design.injection_d + design.soak_d + leg;
      const perYear = 365 / length;
      const a = acc[side];
      a.oil += oil * perYear;
      a.steam += steam * perYear;
      a.float += float * perYear;
      a.kWh += kWh * perYear;
      a.hazard += (cumulativeHazard(impact, reliability) + (reliability.baseFailuresPerYear * length) / 365) * perYear;
    }
  }
  const side = (a: (typeof acc)["before"]): YearSide => ({
    oil_bbl: a.oil,
    steam_t: a.steam,
    sor: steamTonnesToCweBbl(a.steam) / a.oil,
    floatDays: a.float,
    failures: a.hazard,
    kWhPerBbl: a.kWh / a.oil,
  });
  return { wells: field.cssWells.length, before: side(acc.before), after: side(acc.after) };
}
