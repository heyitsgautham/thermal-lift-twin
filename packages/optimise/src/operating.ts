import {
  cssProductionState,
  fluidDensity_kg_per_m3,
  liftEnergy_kWh_per_d,
  pumpDisplacement_bbl_per_d,
  rodFloatRatio,
  ROD_STRING,
  type CssWellProperties,
  type ReservoirFluid,
  type SteamCycleSpec,
} from "@bgw/physics";

// Per-well cycle schedule. For each production day of a cycle the twin sets the
// pump to the cooling curve.
//
//  1. The stroke length is set once, during soak, and held for the cycle.
//  2. SPM follows what the well can deliver at a target fillage, in half-SPM
//     steps, between the unit's limits.
//  3. Below the unit's slowest constant speed, the VFD keeps the upstroke at
//     that speed and stretches the downstroke. The average SPM drops further,
//     the pump keeps running, and the rods fall slowly enough to stay loaded.
//  4. Only below the slowest stretched stroke does a pump-off timer take over.
//
// Current practice, for comparison, runs at constant speed and falls back to a
// pump-off timer as soon as the well cannot keep the slowest speed full.

export const OPERATING = {
  fillageTarget_frac: 0.85,
  spmStep: 0.5,
  /** Longest downstroke the VFD profile allows, as a multiple of the upstroke. */
  maxDownstrokeStretch: 2,
  /** Float ratio the twin keeps under. */
  floatRatioTarget: 0.85,
  /** Constant-speed float ratio from which a day is in the rod-float risk band. */
  riskBandRatio: 0.9,
  /** Pump-off timer step, 5% of a day. Timers are set in minutes, and a coarser step leaves the barrel part empty. */
  runtimeStep: 0.05,
  /** Shortest share of the day a pump-off timer runs the unit. */
  minRuntime_frac: 0.1,
} as const;

export interface PumpSetting {
  stroke_in: number;
  /** Average strokes per minute over the cycle of one stroke. */
  spm: number;
  /** Share of each stroke's time spent on the upstroke. 0.5 is constant speed. */
  upstrokeFraction: number;
  runtime_frac: number;
  fillage_frac: number;
  floatRatio: number;
  energy_kWh: number;
}

export interface OperatingDay {
  /** Production day, 0 = first day after soak. */
  t: number;
  temperature_C: number;
  wellheadTemperature_C: number;
  viscosity_cP: number;
  tubingViscosity_cP: number;
  oil_bbl_per_d: number;
  liquid_bbl_per_d: number;
  waterCut_frac: number;
  twin: PumpSetting;
  practice: PumpSetting;
}

export interface SettingChange {
  t: number;
  text: string;
}

export interface OperatingPlan {
  stroke_in: number;
  days: OperatingDay[];
  changes: SettingChange[];
  /** Production days on which current practice would sit in the rod-float risk band. */
  practiceRiskDays: number[];
  /** Days where the twin's own setting is still above the float target. */
  twinRiskDays: number[];
}

function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

function floorTo(value: number, step: number): number {
  return Math.floor(value / step + 1e-9) * step;
}

interface DayInputs {
  liquid: number;
  viscosity: number;
  density: number;
  perSpm: number;
  stroke: number;
}

function setting(d: DayInputs, spm: number, upstrokeFraction: number, runtime: number): PumpSetting {
  const displacement = d.perSpm * spm * runtime;
  return {
    stroke_in: d.stroke,
    spm,
    upstrokeFraction,
    runtime_frac: runtime,
    fillage_frac: Math.min(1, (d.liquid / displacement) * OPERATING.fillageTarget_frac),
    floatRatio: rodFloatRatio(d.viscosity, d.density, d.stroke, spm, upstrokeFraction),
    energy_kWh: liftEnergy_kWh_per_d({
      liquid_bbl_per_d: d.liquid,
      fluidDensity_kg_per_m3: d.density,
      viscosity_cP: d.viscosity,
      stroke_in: d.stroke,
      spm,
      runtime_frac: runtime,
    }),
  };
}

/** Constant speed, pump-off timer below the slowest speed. */
export function practiceSetting(d: DayInputs): PumpSetting {
  const needed = d.liquid / d.perSpm;
  const spm = Math.min(ROD_STRING.maxSpm, Math.max(ROD_STRING.minSpm, ceilTo(needed, OPERATING.spmStep)));
  const runtime = needed < ROD_STRING.minSpm ? Math.max(OPERATING.minRuntime_frac, ceilTo(needed / ROD_STRING.minSpm, OPERATING.runtimeStep)) : 1;
  return setting(d, spm, 0.5, runtime);
}

/** Average SPM when the upstroke runs at the slowest constant speed and the downstroke takes `stretch` times as long. */
function stretchedSpm(stretch: number): number {
  const up_s = 60 / ROD_STRING.minSpm / 2;
  return 60 / (up_s * (1 + stretch));
}

export function twinSetting(d: DayInputs, previousSpm: number | null): PumpSetting {
  const needed = d.liquid / d.perSpm;
  if (needed >= ROD_STRING.minSpm) {
    let spm = Math.min(ROD_STRING.maxSpm, ceilTo(needed, OPERATING.spmStep));
    if (previousSpm !== null && spm > previousSpm && spm < previousSpm + 2 * OPERATING.spmStep) spm = previousSpm;
    let f = 0.5;
    const constant = rodFloatRatio(d.viscosity, d.density, d.stroke, spm, 0.5);
    if (constant > OPERATING.floatRatioTarget) {
      f = Math.max(1 / (1 + OPERATING.maxDownstrokeStretch), floorTo(1 - (0.5 * constant) / OPERATING.floatRatioTarget, 0.01));
    }
    return setting(d, spm, f, 1);
  }
  // Below the slowest constant speed: stretch the downstroke first.
  const minAvg = stretchedSpm(OPERATING.maxDownstrokeStretch);
  if (needed >= minAvg) {
    const stretch = Math.min(OPERATING.maxDownstrokeStretch, (60 / needed) / (60 / ROD_STRING.minSpm / 2) - 1);
    const s = Math.round(stretch * 20) / 20;
    return setting(d, stretchedSpm(s), 1 / (1 + s), 1);
  }
  const runtime = Math.max(OPERATING.minRuntime_frac, ceilTo(needed / minAvg, OPERATING.runtimeStep));
  return setting(d, minAvg, 1 / (1 + OPERATING.maxDownstrokeStretch), runtime);
}

function describe(s: PumpSetting): string {
  const parts = [`${s.spm.toFixed(1)} SPM`];
  if (s.upstrokeFraction < 0.5) {
    parts.push(`slow downstroke ${Math.round(s.upstrokeFraction * 100)}/${Math.round((1 - s.upstrokeFraction) * 100)}`);
  }
  if (s.runtime_frac < 1) parts.push(`runs ${Math.round(s.runtime_frac * 100)}% of the day`);
  return parts.join(", ");
}

export type { DayInputs };

export function operatingPlan(
  fluid: ReservoirFluid,
  well: CssWellProperties,
  cycle: SteamCycleSpec,
  productionLeg_d: number,
): OperatingPlan {
  const density = fluidDensity_kg_per_m3(fluid);
  const stroke = well.pump.stroke_in;
  const perSpm = pumpDisplacement_bbl_per_d({ ...well.pump, fillage_frac: OPERATING.fillageTarget_frac }, 1);
  const days: OperatingDay[] = [];
  const changes: SettingChange[] = [];
  const practiceRiskDays: number[] = [];
  const twinRiskDays: number[] = [];
  let last: string | null = null;
  let lastSpm: number | null = null;

  for (let t = 0; t < productionLeg_d; t++) {
    const state = cssProductionState(fluid, well, cycle, t);
    const inputs: DayInputs = { liquid: state.liquid_bbl_per_d, viscosity: state.tubingViscosity_cP, density, perSpm, stroke };
    const twin = twinSetting(inputs, lastSpm);
    const practice = practiceSetting(inputs);
    lastSpm = twin.spm;
    const text = describe(twin);
    if (text !== last) {
      changes.push({ t, text: t === 0 ? `Start at ${text}, stroke ${stroke} in` : text });
      last = text;
    }
    if (practice.floatRatio >= OPERATING.riskBandRatio) practiceRiskDays.push(t);
    if (twin.floatRatio > OPERATING.floatRatioTarget + 1e-6) twinRiskDays.push(t);
    days.push({
      t,
      temperature_C: state.temperature_C,
      wellheadTemperature_C: state.wellheadTemperature_C,
      viscosity_cP: state.viscosity_cP,
      tubingViscosity_cP: state.tubingViscosity_cP,
      oil_bbl_per_d: state.oil_bbl_per_d,
      liquid_bbl_per_d: state.liquid_bbl_per_d,
      waterCut_frac: state.waterCut_frac,
      twin,
      practice,
    });
  }
  return { stroke_in: stroke, days, changes, practiceRiskDays, twinRiskDays };
}
