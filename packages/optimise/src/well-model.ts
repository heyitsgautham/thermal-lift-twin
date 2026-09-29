import {
  coldProductionState,
  cssProductionState,
  fitWalther,
  type ReservoirFluid,
  type SteamCycleSpec,
  type WellDayState,
} from "@bgw/physics";
import type { Assumptions, WellRecord } from "./types";

// Builds physics inputs from a well record and caches per-cycle production curves.

export function reservoirFluid(well: WellRecord, assumptions: Assumptions): ReservoirFluid {
  return {
    reservoirTemperature_C: well.fluid.reservoirTemperature_C,
    api_deg: well.fluid.api_deg,
    viscosity: fitWalther(
      { temperature_C: 50, viscosity_cP: well.fluid.viscosityAt50C_cP },
      assumptions.viscosityHighAnchor,
      well.fluid.api_deg,
    ),
  };
}

export interface CycleCurve {
  /** Oil rate on production day t (t = 0 is the first day after soak). */
  oil(t: number): number;
  state(t: number): WellDayState;
  /** Cumulative oil over production days 0..t inclusive. */
  cumulativeOil(t: number): number;
}

export class WellModel {
  readonly fluid: ReservoirFluid;
  private readonly curves = new Map<string, { states: WellDayState[]; cumulative: number[] }>();

  constructor(
    readonly well: WellRecord,
    assumptions: Assumptions,
  ) {
    this.fluid = reservoirFluid(well, assumptions);
  }

  cycleCurve(spec: SteamCycleSpec): CycleCurve {
    const css = this.well.css;
    if (!css) throw new Error(`${this.well.id} is not a CSS well`);
    const key = `${spec.cycleNumber}|${spec.steam_t.toFixed(1)}|${spec.injectionTemperature_C}|${spec.soak_d ?? 6}`;
    let entry = this.curves.get(key);
    if (!entry) {
      entry = { states: [], cumulative: [] };
      this.curves.set(key, entry);
    }
    const cache = entry;
    const ensure = (t: number) => {
      for (let i = cache.states.length; i <= t; i++) {
        const s = cssProductionState(this.fluid, css, spec, i);
        cache.states.push(s);
        cache.cumulative.push((cache.cumulative[i - 1] ?? 0) + s.oil_bbl_per_d);
      }
    };
    return {
      oil: (t) => {
        ensure(t);
        return cache.states[t]!.oil_bbl_per_d;
      },
      state: (t) => {
        ensure(t);
        return cache.states[t]!;
      },
      cumulativeOil: (t) => {
        if (t < 0) return 0;
        ensure(t);
        return cache.cumulative[t]!;
      },
    };
  }

  coldState(daysFromAsOf: number): WellDayState {
    const cold = this.well.cold;
    if (!cold) throw new Error(`${this.well.id} is not a cold-production well`);
    return coldProductionState(this.fluid, cold, daysFromAsOf);
  }
}

export function buildWellModels(wells: WellRecord[], assumptions: Assumptions): Map<string, WellModel> {
  const models = new Map<string, WellModel>();
  for (const well of wells) {
    if (well.status === "css" || well.status === "cold") {
      models.set(well.id, new WellModel(well, assumptions));
    }
  }
  return models;
}
