import {
  heatedZoneStartTemperature_C,
  simulateStroke,
  steamTonnesToCweBbl,
  tubingViscosity_cP,
  viscosity_cP,
  fluidDensity_kg_per_m3,
  type SteamCycleSpec,
  type StrokeResult,
} from "@bgw/physics";
import {
  CREW_REACTION_D,
  cumulativeHazard,
  dailyImpact,
  operatingPlan,
  practiceLeg_d,
  repairPlan,
  resteamPoint,
  shiftSlot,
  slotSteam_t,
  type Capacity,
  type CycleInstance,
  type FieldModel,
  type OperatingPlan,
  type PlanEvaluation,
  type PumpSetting,
  type RepairMove,
  type RepairOption,
  type SteamSlot,
} from "@bgw/optimise";

// View-model for the 3D story. The canonical story numbers live in
// packages/optimise/src/story.ts; packages/optimise/test/story-3d.test.ts holds
// this view to the same values.
//
// The before/after story the demo tells, computed from the twin rather than
// typed in. One well, BGW-14, run two ways from the same steam cycle:
//
//   before  the plan as issued (steam on its booked slot) with today's pump
//           practice, constant speed and a pump-off timer;
//   after   the twin's re-steam day with the twin's day-by-day pump schedule.
//
// Then the field: moving BGW-14 to its re-steam day overloads the shared
// generators and the twin's repair clears it. Then one design cycle per CSS
// well, annualised, before against after.

export type StoryPhase = "steam" | "soak" | "produce";

export interface StoryDay {
  /** Calendar day, 0 = the as-of date. */
  d: number;
  phase: StoryPhase;
  cycleNumber: number;
  /** Heated-zone (bottomhole) temperature. */
  temperature_C: number;
  /** Crude viscosity at the heated-zone temperature. */
  viscosity_cP: number;
  /** Crude viscosity at the tubing's mean temperature, which sets rod drag. */
  tubingViscosity_cP: number;
  oil_bbl_per_d: number;
  /** The pump setting this scenario runs, null while the pump is off for steam and soak. */
  pump: PumpSetting | null;
}

export interface ScenarioStory {
  /** Day the next steam cycle starts. */
  steamStart_d: number;
  days: StoryDay[];
  /** Production days on which the rods float, float ratio at or above 1. */
  floatDays: number;
  firstFloat_d: number | null;
  peakFloatRatio: number;
}

export interface CycleFacts {
  cycleNumber: number;
  steamStart_d: number;
  injection_d: number;
  designInjection_d: number;
  soak_d: number;
  steam_t: number;
  designSteam_t: number;
  injectionTemperature_C: number;
  note: string | null;
  productionStart_d: number;
  /** Heated-zone temperature when production starts. */
  peakTemperature_C: number;
}

export interface WellStory {
  wellId: string;
  reservoirTemperature_C: number;
  /** The rock and crude at reservoir temperature, before any steam. */
  cold: { temperature_C: number; viscosity_cP: number; tubingViscosity_cP: number };
  cycle: CycleFacts;
  before: ScenarioStory;
  after: ScenarioStory;
  /** Same days and same oil, today's pump against the twin's: from the as-of date to the twin's steam day. */
  window: { from_d: number; to_d: number; oil_bbl: number; practice_kWh: number; twin_kWh: number; change_frac: number };
  /** One stroke on the last day before the twin's steam, both pump settings, from the wave-equation rod model. */
  card: {
    d: number;
    tubingViscosity_cP: number;
    practiceSetting: PumpSetting;
    twinSetting: PumpSetting;
    practice: StrokeResult;
    twin: StrokeResult;
  };
}

/** Production days of the next cycle kept after its soak, so the heat returning is visible. */
const NEXT_CYCLE_TAIL_D = 12;

function cycleSpec(c: CycleInstance): SteamCycleSpec {
  return {
    cycleNumber: c.cycleNumber,
    steam_t: slotSteam_t(c),
    injectionTemperature_C: c.injectionTemperature_C,
    soak_d: c.soak_d,
  };
}

/** Heated-zone temperature while steam goes in: a smooth rise to the temperature production starts at. */
function injectionTemperature(from_C: number, to_C: number, k: number, injection_d: number): number {
  const x = Math.min(1, (k + 1) / injection_d);
  return from_C + (to_C - from_C) * ((1 - Math.exp(-3 * x)) / (1 - Math.exp(-3)));
}

function scenario(
  field: FieldModel,
  wellId: string,
  anchor: CycleInstance,
  next: CycleInstance,
  pump: "practice" | "twin",
): ScenarioStory {
  const model = field.model(wellId);
  const css = model.well.css!;
  const fluid = model.fluid;
  const soakEnd = anchor.start_d + anchor.injection_d + anchor.soak_d;
  const leg = next.start_d - soakEnd;
  const tail: OperatingPlan = operatingPlan(fluid, css, cycleSpec(anchor), leg);
  const nextSpec = cycleSpec(next);
  const nextPlan = operatingPlan(fluid, css, nextSpec, NEXT_CYCLE_TAIL_D);
  const t0 = heatedZoneStartTemperature_C(fluid, cycleSpec(anchor));
  const t1 = heatedZoneStartTemperature_C(fluid, nextSpec);
  const res = fluid.reservoirTemperature_C;

  const days: StoryDay[] = [];
  const shut = (d: number, phase: StoryPhase, cycleNumber: number, temperature_C: number) =>
    days.push({
      d,
      phase,
      cycleNumber,
      temperature_C,
      viscosity_cP: viscosity_cP(fluid.viscosity, temperature_C),
      tubingViscosity_cP: tubingViscosity_cP(fluid, temperature_C),
      oil_bbl_per_d: 0,
      pump: null,
    });

  for (let k = 0; k < anchor.injection_d; k++) shut(anchor.start_d + k, "steam", anchor.cycleNumber, injectionTemperature(res, t0, k, anchor.injection_d));
  for (let k = 0; k < anchor.soak_d; k++) shut(anchor.start_d + anchor.injection_d + k, "soak", anchor.cycleNumber, t0);

  let floatDays = 0;
  let firstFloat: number | null = null;
  let peak = 0;
  for (const op of tail.days) {
    const d = soakEnd + op.t;
    const setting = pump === "twin" ? op.twin : op.practice;
    peak = Math.max(peak, setting.floatRatio);
    if (setting.floatRatio >= 1) {
      floatDays++;
      if (firstFloat === null) firstFloat = d;
    }
    days.push({
      d,
      phase: "produce",
      cycleNumber: anchor.cycleNumber,
      temperature_C: op.temperature_C,
      viscosity_cP: op.viscosity_cP,
      tubingViscosity_cP: op.tubingViscosity_cP,
      oil_bbl_per_d: op.oil_bbl_per_d,
      pump: setting,
    });
  }

  const last = tail.days.at(-1)?.temperature_C ?? t0;
  for (let k = 0; k < next.injection_d; k++) shut(next.start_d + k, "steam", next.cycleNumber, injectionTemperature(last, t1, k, next.injection_d));
  for (let k = 0; k < next.soak_d; k++) shut(next.start_d + next.injection_d + k, "soak", next.cycleNumber, t1);
  const nextSoakEnd = next.start_d + next.injection_d + next.soak_d;
  for (const op of nextPlan.days) {
    days.push({
      d: nextSoakEnd + op.t,
      phase: "produce",
      cycleNumber: next.cycleNumber,
      temperature_C: op.temperature_C,
      viscosity_cP: op.viscosity_cP,
      tubingViscosity_cP: op.tubingViscosity_cP,
      oil_bbl_per_d: op.oil_bbl_per_d,
      pump: pump === "twin" ? op.twin : op.practice,
    });
  }

  return { steamStart_d: next.start_d, days, floatDays, firstFloat_d: firstFloat, peakFloatRatio: peak };
}

export function wellStory(field: FieldModel, wellId: string, issued: readonly SteamSlot[]): WellStory {
  const model = field.model(wellId);
  const css = model.well.css!;
  const [anchor, booked] = field.cyclesFor(wellId, issued);
  if (!anchor || !booked) throw new Error(`${wellId} needs a running cycle and a booked steam slot`);
  const resteam = field.currentResteam(wellId);
  const twinNext: CycleInstance = { ...booked, start_d: resteam.day_d };
  const record = field.anchorCycle(wellId);
  const design = css.design;

  const before = scenario(field, wellId, anchor, booked, "practice");
  const after = scenario(field, wellId, anchor, twinNext, "twin");

  // Same days and same oil, the only difference is how the pump runs.
  const soakEnd = anchor.start_d + anchor.injection_d + anchor.soak_d;
  const shared = operatingPlan(model.fluid, css, cycleSpec(anchor), resteam.day_d - soakEnd);
  let oil = 0;
  let practice_kWh = 0;
  let twin_kWh = 0;
  for (const op of shared.days) {
    if (soakEnd + op.t < 0) continue;
    oil += op.oil_bbl_per_d;
    practice_kWh += op.practice.energy_kWh;
    twin_kWh += op.twin.energy_kWh;
  }

  const cardDay = shared.days.at(-1)!;
  const density = fluidDensity_kg_per_m3(model.fluid);
  const stroke = (s: PumpSetting) =>
    simulateStroke({
      stroke_in: s.stroke_in,
      spm: s.spm,
      upstrokeFraction: s.upstrokeFraction,
      viscosity_cP: cardDay.tubingViscosity_cP,
      fluidDensity_kg_per_m3: density,
      plungerDiameter_in: css.pump.plungerDiameter_in,
      fillage_frac: Math.max(0.3, s.fillage_frac),
    });

  return {
    wellId,
    reservoirTemperature_C: model.fluid.reservoirTemperature_C,
    cold: {
      temperature_C: model.fluid.reservoirTemperature_C,
      viscosity_cP: viscosity_cP(model.fluid.viscosity, model.fluid.reservoirTemperature_C),
      tubingViscosity_cP: tubingViscosity_cP(model.fluid, model.fluid.reservoirTemperature_C),
    },
    cycle: {
      cycleNumber: anchor.cycleNumber,
      steamStart_d: anchor.start_d,
      injection_d: anchor.injection_d,
      designInjection_d: design.injection_d,
      soak_d: anchor.soak_d,
      steam_t: slotSteam_t(anchor),
      designSteam_t: design.injectionRate_t_per_h * 24 * design.injection_d,
      injectionTemperature_C: anchor.injectionTemperature_C,
      note: record.note ?? null,
      productionStart_d: soakEnd,
      peakTemperature_C: heatedZoneStartTemperature_C(model.fluid, cycleSpec(anchor)),
    },
    before,
    after,
    window: {
      from_d: 0,
      to_d: resteam.day_d - 1,
      oil_bbl: oil,
      practice_kWh,
      twin_kWh,
      change_frac: twin_kWh / practice_kWh - 1,
    },
    card: {
      d: soakEnd + cardDay.t,
      tubingViscosity_cP: cardDay.tubingViscosity_cP,
      practiceSetting: cardDay.practice,
      twinSetting: cardDay.twin,
      practice: stroke(cardDay.practice),
      twin: stroke(cardDay.twin),
    },
  };
}

export interface WellSetTotals {
  oil_bbl: number;
  sor: number | null;
}

function wellSetTotals(ev: PlanEvaluation, wells: ReadonlySet<string>): WellSetTotals {
  let oil = 0;
  let steam = 0;
  for (const t of ev.timelines) {
    if (!wells.has(t.wellId)) continue;
    oil += t.oil90_bbl;
    steam += t.steam90_t;
  }
  return { oil_bbl: oil, sor: oil > 0 ? steamTonnesToCweBbl(steam) / oil : null };
}

export interface FieldStory {
  wellId: string;
  slotId: string;
  capacity_t_per_h: number;
  fromStart_d: number;
  toStart_d: number;
  issued: SteamSlot[];
  edited: SteamSlot[];
  proposal: SteamSlot[];
  /** Total generator load per day of the window, t/h. */
  load: { issued: number[]; edited: number[]; proposal: number[] };
  overloadDays: number[];
  peakEdited_t_per_h: number;
  options: RepairOption[];
  tested: { slots: number; shifts: number };
  moves: RepairMove[];
  feasible: boolean;
  changedWells: string[];
  changeBefore: WellSetTotals;
  changeAfter: WellSetTotals;
}

/** The field beat: the story well goes to its re-steam day and the twin clears the generator overload. */
export function fieldStory(field: FieldModel, wellId: string, issued: readonly SteamSlot[], capacity: Capacity): FieldStory {
  const slot = issued.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d)[0];
  if (!slot) throw new Error(`${wellId} has no booked steam slot`);
  const target = field.currentResteam(wellId).day_d;
  const edited = shiftSlot(issued, slot.id, target - slot.start_d);
  const repair = repairPlan(field, edited, new Set([slot.id]), capacity);
  const before = field.evaluate(issued, capacity);
  const after = field.evaluate(repair.proposal, capacity);
  const changed = new Set([wellId, ...repair.moves.map((m) => m.wellId)]);
  const total = (ev: PlanEvaluation) => ev.load.map((l) => l.total_t_per_h);
  return {
    wellId,
    slotId: slot.id,
    capacity_t_per_h: before.capacity_t_per_h,
    fromStart_d: slot.start_d,
    toStart_d: target,
    issued: [...issued],
    edited,
    proposal: repair.proposal,
    load: { issued: total(before), edited: total(repair.edited), proposal: total(after) },
    overloadDays: repair.edited.overloadDays,
    peakEdited_t_per_h: repair.edited.totals.peakLoad_t_per_h,
    options: repair.options,
    tested: repair.tested,
    moves: repair.moves,
    feasible: repair.feasible,
    changedWells: [...changed],
    changeBefore: wellSetTotals(before, changed),
    changeAfter: wellSetTotals(after, changed),
  };
}

export interface YearTotals {
  oil_bbl: number;
  steam_t: number;
  sor: number;
  floatDays: number;
  expectedFailures: number;
  kWhPerBbl: number;
}

export interface FieldYear {
  wells: number;
  before: YearTotals;
  after: YearTotals;
}

/**
 * One design cycle per CSS well at its next cycle number, annualised by 365
 * over the cycle length. Before runs today's production leg and pump practice,
 * after runs the re-steam rule and the twin's pump. The hazard is the stated
 * Weibull on rod-float impact plus the base rate; today's crews slow a pounding
 * unit after CREW_REACTION_D days, the twin never lets it pound.
 */
export function fieldYear(field: FieldModel): FieldYear {
  const rel = field.assumptions.reliability;
  const sum = { before: { oil: 0, steam: 0, float: 0, haz: 0, kWh: 0 }, after: { oil: 0, steam: 0, float: 0, haz: 0, kWh: 0 } };
  for (const w of field.cssWells) {
    const wm = field.model(w.id);
    const design = w.css!.design;
    const n = field.anchorCycle(w.id).cycleNumber + 1;
    const steam = design.injectionRate_t_per_h * 24 * design.injection_d;
    const spec = { cycleNumber: n, steam_t: steam, injectionTemperature_C: design.injectionTemperature_C, soak_d: design.soak_d };
    const legBefore = practiceLeg_d(field, w.id, n);
    const legAfter = resteamPoint(
      wm.cycleCurve(spec),
      { start_d: 0, injection_d: design.injection_d, soak_d: design.soak_d },
      { curve: wm.cycleCurve({ ...spec, cycleNumber: n + 1 }), injection_d: design.injection_d, soak_d: design.soak_d, steam_t: steam },
      field.assumptions.steamCost_bbl_per_t,
      field.assumptions.minProductionLeg_d,
    ).productionLeg_d;
    for (const [key, leg, pump] of [
      ["before", legBefore, "practice"],
      ["after", legAfter, "twin"],
    ] as const) {
      const plan = operatingPlan(wm.fluid, w.css!, spec, leg);
      let oil = 0;
      let kWh = 0;
      let float = 0;
      let band = 0;
      let impact = 0;
      for (const d of plan.days) {
        const s = pump === "twin" ? d.twin : d.practice;
        oil += d.oil_bbl_per_d;
        kWh += s.energy_kWh;
        if (s.floatRatio >= 1) float++;
        if (s.floatRatio > rel.impactFromRatio) {
          band++;
          if (pump === "twin" || band <= CREW_REACTION_D) impact += dailyImpact(s.floatRatio, rel);
        }
      }
      const length = design.injection_d + design.soak_d + leg;
      const perYear = 365 / length;
      const t = sum[key];
      t.oil += oil * perYear;
      t.steam += steam * perYear;
      t.float += float * perYear;
      t.kWh += kWh * perYear;
      t.haz += (cumulativeHazard(impact, rel) + (rel.baseFailuresPerYear * length) / 365) * perYear;
    }
  }
  const totals = (t: (typeof sum)["before"]): YearTotals => ({
    oil_bbl: t.oil,
    steam_t: t.steam,
    sor: steamTonnesToCweBbl(t.steam) / t.oil,
    floatDays: t.float,
    expectedFailures: t.haz,
    kWhPerBbl: t.kWh / t.oil,
  });
  return { wells: field.cssWells.length, before: totals(sum.before), after: totals(sum.after) };
}
