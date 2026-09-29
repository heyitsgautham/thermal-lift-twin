import { DEFAULT_RELIABILITY, type Assumptions, type FailureType } from "@bgw/optimise";

// Demo fixture for the field. Public facts are fixed here, everything else is
// drawn from the seed. Sources for the public facts: OIL's field page and
// the April 2026 press release (52 wells drilled, 33 operational, 19 on CSS,
// 10,000 to 13,000 cP at 50 °C, 17 to 19° API, 46 to 48 °C reservoir,
// CSS pilot on BGW-8 in 2018, then two more wells, then field scale).

export interface CycleOverride {
  /** Day the current cycle's injection started, relative to the as-of date. */
  steamStart_d: number;
  cycleNumber?: number;
  /** Days of injection the cycle actually got, when it differs from design. */
  actualInjection_d?: number;
  /** Why the cycle differs from design. The generator writes it into the cycle note. */
  cause?: string;
}

export interface UpcomingFailure {
  wellId: string;
  day_d: number;
  type: FailureType;
  /** Days of precursor drift before the failure. */
  lead_d: number;
}

export interface FixtureConfig {
  seed: number;
  asOf: string;
  horizon_d: number;
  wellsDrilled: number;
  wellsProducing: number;
  wellsOnCss: number;
  pilotWell: number;
  expansionWells: number[];
  /** Wells the demo story names. They are always on CSS. */
  storyWells: number[];
  fishboneWells: number[];
  /** Wells whose logged history the model page plots against the model. */
  calibrationWells: string[];
  /**
   * Failures the synthetic truth places just after the as-of date, so their
   * precursor drift is visible today. The estimator never sees these records.
   */
  upcomingFailures: UpcomingFailure[];
  currentCycleOverrides: Record<string, CycleOverride>;
  assumptions: Assumptions;
}

export const FIXTURE: FixtureConfig = {
  seed: 18,
  asOf: "2026-09-28",
  horizon_d: 90,
  wellsDrilled: 52,
  wellsProducing: 33,
  wellsOnCss: 19,
  pilotWell: 8,
  expansionWells: [11, 14],
  storyWells: [14, 22],
  fishboneWells: [27, 41],
  calibrationWells: ["BGW-14", "BGW-8"],
  upcomingFailures: [
    { wellId: "BGW-29", day_d: 4, type: "rod parted", lead_d: 10 },
    { wellId: "BGW-45", day_d: 7, type: "pump unseated", lead_d: 10 },
  ],
  currentCycleOverrides: {
    "BGW-14": { steamStart_d: -74, actualInjection_d: 12, cause: "SG-2 trip" },
    "BGW-22": { steamStart_d: -74 },
  },
  assumptions: {
    generatorUnits: 2,
    generatorUnitCapacity_t_per_h: 12,
    steamCost_bbl_per_t: 0.5,
    minProductionLeg_d: 30,
    viscosityHighAnchor: { temperature_C: 200, viscosity_cP: 20 },
    reliability: DEFAULT_RELIABILITY,
  },
};
