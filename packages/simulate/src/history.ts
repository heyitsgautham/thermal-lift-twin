import {
  fluidDensity_kg_per_m3,
  pumpDisplacement_bbl_per_d,
  rodBuoyantWeight_N_per_m,
  fluidLoad_N,
  couetteDrag_N_s_per_m2,
  ROD_STRING,
  tubingViscosity_cP,
} from "@bgw/physics";
import {
  cumulativeHazard,
  dailyImpact,
  practiceSetting,
  slotSteam_t,
  WellModel,
  OPERATING,
  type Assumptions,
  type CalibrationSeries,
  type CycleRecord,
  type FailureRecord,
  type FailureType,
  type SteamSlot,
  type WellHealth,
  type WellRecord,
} from "@bgw/optimise";
import { Rng } from "./rng";

// Daily history since April 2017 for every producing well, generated from the same
// physics the twin runs. Current practice (constant speed, pump-off timer) sets
// the pump, rod-float days add impact loading, failures are drawn from the
// Weibull hazard, and card-shape drift rises for five to ten days before each
// one. Sensor noise, missing days and frozen tags are added last.

export const HISTORY_COLUMNS = [
  "date",
  "day",
  "well_id",
  "phase",
  "cycle",
  "oil_bbl",
  "water_bbl",
  "bht_C",
  "wht_C",
  "spm",
  "stroke_in",
  "runtime_frac",
  "fillage_frac",
  "prl_max_kN",
  "prl_min_kN",
  "vfd_hz",
  "motor_kWh",
  "card_drift",
  "failure",
] as const;

export interface DailyColumns {
  date: string[];
  day: number[];
  well_id: string[];
  phase: string[];
  cycle: number[];
  oil_bbl: (number | null)[];
  water_bbl: (number | null)[];
  bht_C: (number | null)[];
  wht_C: (number | null)[];
  spm: number[];
  stroke_in: number[];
  runtime_frac: number[];
  fillage_frac: number[];
  prl_max_kN: (number | null)[];
  prl_min_kN: (number | null)[];
  vfd_hz: number[];
  motor_kWh: number[];
  card_drift: number[];
  failure: number[];
}

export interface HistoryResult {
  columns: DailyColumns;
  failures: FailureRecord[];
  health: WellHealth[];
  calibration: CalibrationSeries[];
  missingFraction: number;
  frozenRuns: number;
}

const DAY_MS = 86_400_000;
const FUTURE_D = 30;
const HISTORY_START = "2017-04-01";

function isoDate(asOf: string, day: number): string {
  return new Date(Date.parse(`${asOf}T00:00:00Z`) + day * DAY_MS).toISOString().slice(0, 10);
}

function dayOffset(asOf: string, iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / DAY_MS);
}

function gaussian(r: Rng): number {
  const u = Math.max(1e-12, r.next());
  const v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface DayTruth {
  day: number;
  phase: "steam" | "soak" | "produce" | "down" | "cold";
  cycle: number;
  oil: number;
  water: number;
  bht: number;
  wht: number;
  spm: number;
  stroke: number;
  runtime: number;
  fillage: number;
  prlMax: number;
  prlMin: number;
  kWh: number;
  floatRatio: number;
  impact: number;
  failure: FailureType | null;
}

/** Mills acceleration factor, S in inches and N in SPM. */
function millsFactor(stroke_in: number, spm: number): number {
  return (stroke_in * spm * spm) / 70_500;
}

function loads(
  plunger_in: number,
  density: number,
  viscosity_cP: number,
  stroke_in: number,
  spm: number,
  fillage: number,
): { max: number; min: number } {
  const L = ROD_STRING.pumpDepth_m;
  const Wrf = rodBuoyantWeight_N_per_m(density) * L;
  const Fo = fluidLoad_N(plunger_in, density) * Math.min(1, 0.4 + 0.6 * fillage);
  const alpha = millsFactor(stroke_in, spm);
  const v = (Math.PI * stroke_in * 0.0254 * spm) / 60;
  const drag = (couetteDrag_N_s_per_m2(viscosity_cP) + ROD_STRING.baseDamping_N_s_per_m2) * L * v;
  return { max: ((Wrf + Fo) * (1 + alpha) + drag) / 1000, min: (Wrf * (1 - alpha) - drag) / 1000 };
}

function simulateWell(
  well: WellRecord,
  cycles: CycleRecord[],
  future: SteamSlot[],
  assumptions: Assumptions,
  asOf: string,
  r: Rng,
  forced: { day_d: number; type: FailureType }[],
): DayTruth[] {
  const model = new WellModel(well, assumptions);
  const density = fluidDensity_kg_per_m3(model.fluid);
  const a = assumptions.reliability;
  const start = Math.max(dayOffset(asOf, HISTORY_START), dayOffset(asOf, `${well.spudYear + 1}-01-15`));
  const all = [
    ...cycles.map((c) => ({ ...c, start_d: c.steamStart_d })),
    ...future.map((s) => ({
      wellId: s.wellId,
      cycleNumber: s.cycleNumber,
      steamStart_d: s.start_d,
      start_d: s.start_d,
      injection_d: s.injection_d,
      soak_d: s.soak_d,
      rate_t_per_h: s.rate_t_per_h,
      injectionTemperature_C: s.injectionTemperature_C,
    })),
  ].sort((x, y) => x.start_d - y.start_d);

  const pump = well.css?.pump ?? well.cold!.pump;
  const perSpm = pumpDisplacement_bbl_per_d({ ...pump, fillage_frac: OPERATING.fillageTarget_frac }, 1);
  const days: DayTruth[] = [];
  let impact = 0;
  let downUntil = -Infinity;
  let floatCycle = -1;
  let floatDays = 0;
  let reactAfter = 0;
  const baseDaily = a.baseFailuresPerYear / 365;

  for (let d = start; d < FUTURE_D; d++) {
    let c: (typeof all)[number] | null = null;
    for (const cand of all) if (cand.start_d <= d) c = cand;

    let phase: DayTruth["phase"];
    let oil = 0;
    let liquid = 0;
    let bht = well.fluid.reservoirTemperature_C;
    let tubing_cP = 0;
    let cycle = c?.cycleNumber ?? 0;
    if (well.status === "cold" || !c) {
      phase = "cold";
      const s = well.cold ? model.coldState(d) : null;
      if (s) {
        oil = s.oil_bbl_per_d;
        liquid = s.liquid_bbl_per_d;
        tubing_cP = s.tubingViscosity_cP;
      } else {
        const coldRate = well.css!.coldOilRate_bbl_per_d;
        oil = coldRate;
        liquid = coldRate / (1 - well.css!.baseWaterCut_frac);
        tubing_cP = tubingViscosity_cP(model.fluid, well.fluid.reservoirTemperature_C);
      }
      cycle = 0;
    } else {
      const rel = d - c.start_d;
      if (rel < c.injection_d) {
        phase = "steam";
        bht = c.injectionTemperature_C;
      } else if (rel < c.injection_d + c.soak_d) {
        phase = "soak";
        bht = c.injectionTemperature_C - ((rel - c.injection_d + 1) / c.soak_d) * 0.4 * (c.injectionTemperature_C - 150);
      } else {
        phase = "produce";
        const t = rel - c.injection_d - c.soak_d;
        const s = model
          .cycleCurve({
            cycleNumber: c.cycleNumber,
            steam_t: slotSteam_t(c),
            injectionTemperature_C: c.injectionTemperature_C,
            soak_d: c.soak_d,
          })
          .state(t);
        oil = s.oil_bbl_per_d;
        liquid = s.liquid_bbl_per_d;
        bht = s.temperature_C;
        tubing_cP = s.tubingViscosity_cP;
      }
    }

    if (d < downUntil) phase = "down";
    const pumping = phase === "produce" || phase === "cold";
    const setting = pumping
      ? practiceSetting({ liquid, viscosity: tubing_cP, density, perSpm, stroke: pump.stroke_in })
      : null;
    // Cold wells, and CSS wells before their first cycle, run the slow schedule
    // cold crude needs, so they only carry the base failure rate. CSS wells run
    // constant speed through each cycle until the crew notices the rods
    // pounding and slows the unit, some days after float starts.
    if (cycle !== floatCycle) {
      floatCycle = cycle;
      floatDays = 0;
      reactAfter = r.int(8, 20);
    }
    const hot = phase === "produce" && well.status === "css";
    let floatRatio = setting && hot ? setting.floatRatio : 0;
    if (floatRatio > a.impactFromRatio) {
      floatDays++;
      if (floatDays > reactAfter) floatRatio = 0;
    }
    const added = pumping ? dailyImpact(floatRatio, a) : 0;
    const before = cumulativeHazard(impact, a);
    impact += added;
    const loadingHazard = cumulativeHazard(impact, a) - before;
    let failure: FailureType | null = null;
    const force = forced.find((f) => f.day_d === d);
    if (pumping && d < FUTURE_D) {
      const p = 1 - Math.exp(-(loadingHazard + baseDaily));
      const draw = r.next();
      const fails = d >= 0 ? Boolean(force) : draw < p;
      if (fails) {
        failure = force?.type ?? (loadingHazard > baseDaily ? "rod parted" : r.next() < 0.6 ? "pump unseated" : "tubing leak");
        downUntil = d + 1 + r.int(3, 6);
        impact *= failure === "rod parted" ? 0.2 : 0.8;
      }
    }

    const l = setting
      ? loads(pump.plungerDiameter_in, density, tubing_cP, pump.stroke_in, setting.spm, setting.fillage_frac)
      : { max: 0, min: 0 };
    days.push({
      day: d,
      phase,
      cycle,
      oil: phase === "down" ? 0 : oil,
      water: phase === "down" || !pumping ? 0 : liquid - oil,
      bht,
      wht: pumping ? 30 + 0.55 * (bht - 30) : bht > 100 ? 30 + 0.8 * (bht - 30) : 35,
      spm: setting?.spm ?? 0,
      stroke: pump.stroke_in,
      runtime: setting?.runtime_frac ?? 0,
      fillage: setting?.fillage_frac ?? 0,
      prlMax: l.max,
      prlMin: l.min,
      kWh: setting?.energy_kWh ?? 0,
      floatRatio,
      impact,
      failure,
    });
  }
  return days;
}

/** Card-shape drift: scatter, slow wear, and a ramp in the days before each failure. */
function driftSeries(
  days: DayTruth[],
  r: Rng,
  scale_impact: number,
  leads: Map<number, number>,
): { drift: number[]; precursors: Map<number, number> } {
  const drift = days.map((t) => 0.05 + 0.012 * Math.abs(gaussian(r)) + 0.06 * Math.min(1, t.impact / scale_impact));
  const precursors = new Map<number, number>();
  days.forEach((t, i) => {
    if (!t.failure) return;
    const drawn = r.int(5, 10);
    const lead = leads.get(t.day) ?? drawn;
    const peak = r.uniform(0.22, 0.42);
    precursors.set(t.day, lead);
    for (let k = 1; k <= lead && i - k >= 0; k++) {
      drift[i - k]! += peak * Math.pow((lead - k + 1) / lead, 1.4);
    }
  });
  return { drift, precursors };
}

export function generateHistory(
  wells: WellRecord[],
  cycles: CycleRecord[],
  issuedPlan: SteamSlot[],
  assumptions: Assumptions,
  asOf: string,
  root: Rng,
  calibrationWells: string[],
  upcoming: { wellId: string; day_d: number; type: FailureType; lead_d: number }[],
): HistoryResult {
  const columns: DailyColumns = {
    date: [],
    day: [],
    well_id: [],
    phase: [],
    cycle: [],
    oil_bbl: [],
    water_bbl: [],
    bht_C: [],
    wht_C: [],
    spm: [],
    stroke_in: [],
    runtime_frac: [],
    fillage_frac: [],
    prl_max_kN: [],
    prl_min_kN: [],
    vfd_hz: [],
    motor_kWh: [],
    card_drift: [],
    failure: [],
  };
  const failures: FailureRecord[] = [];
  const health: WellHealth[] = [];
  const calibration: CalibrationSeries[] = [];
  let rows = 0;
  let missing = 0;
  let frozenRuns = 0;

  for (const well of wells.filter((w) => w.status === "css" || w.status === "cold")) {
    const r = root.fork(`history:${well.number}`);
    const truth = simulateWell(
      well,
      cycles.filter((c) => c.wellId === well.id),
      issuedPlan.filter((s) => s.wellId === well.id),
      assumptions,
      asOf,
      r,
      upcoming.filter((u) => u.wellId === well.id),
    );
    const leads = new Map(upcoming.filter((u) => u.wellId === well.id).map((u) => [u.day_d, u.lead_d]));
    const { drift, precursors } = driftSeries(truth, r, assumptions.reliability.weibullScale_impact, leads);

    for (const [i, t] of truth.entries()) {
      if (t.failure && t.day < 0) {
        failures.push({
          wellId: well.id,
          day_d: t.day,
          type: t.failure,
          precursor_d: precursors.get(t.day) ?? 0,
          downtime_d: truth.slice(i + 1).findIndex((x) => x.phase !== "down") + 0,
        });
      }
    }

    const past = truth.map((t, i) => ({ t, drift: drift[i]! })).filter((x) => x.t.day < 0);
    let frozenLeft = 0;
    let frozenValue = 0;
    for (const { t, drift: dr } of past) {
      const noise = Math.exp(0.06 * gaussian(r));
      const isMissing = r.next() < 0.01;
      if (frozenLeft === 0 && r.next() < 0.0015) {
        frozenLeft = r.int(3, 7);
        frozenValue = Number((t.wht + 0.8 * gaussian(r)).toFixed(1));
        frozenRuns++;
      }
      const wht = frozenLeft > 0 ? frozenValue : Number((t.wht + 0.8 * gaussian(r)).toFixed(1));
      if (frozenLeft > 0) frozenLeft--;
      if (isMissing) missing++;
      rows++;
      columns.date.push(isoDate(asOf, t.day));
      columns.day.push(t.day);
      columns.well_id.push(well.id);
      columns.phase.push(t.phase);
      columns.cycle.push(t.cycle);
      columns.oil_bbl.push(isMissing ? null : Number((t.oil * noise).toFixed(2)));
      columns.water_bbl.push(isMissing ? null : Number((t.water * Math.exp(0.05 * gaussian(r))).toFixed(2)));
      columns.bht_C.push(isMissing ? null : Number((t.bht + 0.6 * gaussian(r)).toFixed(1)));
      columns.wht_C.push(isMissing ? null : wht);
      columns.spm.push(t.spm);
      columns.stroke_in.push(t.stroke);
      columns.runtime_frac.push(Number(t.runtime.toFixed(2)));
      columns.fillage_frac.push(Number(t.fillage.toFixed(3)));
      columns.prl_max_kN.push(t.spm > 0 && !isMissing ? Number((t.prlMax * Math.exp(0.02 * gaussian(r))).toFixed(2)) : null);
      columns.prl_min_kN.push(t.spm > 0 && !isMissing ? Number((t.prlMin + 0.4 * gaussian(r)).toFixed(2)) : null);
      columns.vfd_hz.push(Number((t.spm * 10).toFixed(1)));
      columns.motor_kWh.push(Number(t.kWh.toFixed(1)));
      columns.card_drift.push(Number(dr.toFixed(4)));
      columns.failure.push(t.failure ? 1 : 0);
    }

    const lastPast = past.slice(-60);
    const wellFailures = failures.filter((f) => f.wellId === well.id);
    health.push({
      wellId: well.id,
      drift60: lastPast.map((x) => Number(x.drift.toFixed(4))),
      impact: Number((past.at(-1)?.t.impact ?? 0).toFixed(3)),
      failures: wellFailures.length,
      lastFailure_d: wellFailures.at(-1)?.day_d ?? null,
    });

    if (calibrationWells.includes(well.id)) {
      const span = past.slice(-420);
      const series: CalibrationSeries = { wellId: well.id, from_d: span[0]!.t.day, logged: [], model: [] };
      const offset = past.length - span.length;
      span.forEach((x, i) => {
        series.model.push(Number(x.t.oil.toFixed(2)));
        series.logged.push(columns.oil_bbl[columns.oil_bbl.length - past.length + offset + i] ?? null);
      });
      calibration.push(series);
    }
  }

  return {
    columns,
    failures: failures.sort((a, b) => a.day_d - b.day_d),
    health,
    calibration,
    missingFraction: missing / rows,
    frozenRuns,
  };
}
