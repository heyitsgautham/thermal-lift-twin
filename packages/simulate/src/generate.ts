import {
  FieldModel,
  WellModel,
  issuePlanByPractice,
  designLeg_d,
  type CycleRecord,
  type DowntimeEvent,
  type FieldDataset,
  type WellRecord,
} from "@bgw/optimise";
import { FIXTURE, type FixtureConfig } from "./fixture";
import { generateHistory, HISTORY_COLUMNS, type DailyColumns } from "./history";
import { fieldOutline, placeWells, structureGrid } from "./map";
import { Rng } from "./rng";

export const GENERATOR_VERSION = "field-2";
export const DAILY_FILE = "data/demo/daily.parquet";

const DAY_MS = 86_400_000;

function dayOffset(asOf: string, isoDate: string): number {
  return Math.round((Date.parse(isoDate) - Date.parse(asOf)) / DAY_MS);
}

const DOWNTIME_REASONS = [
  "Planned workover, rod string",
  "Planned pump change",
  "Tubing replacement",
  "Wellhead maintenance",
] as const;

function cssStartYear(n: number, config: FixtureConfig, r: Rng): number {
  if (n === config.pilotWell) return 2018;
  if (config.expansionWells.includes(n)) return 2020;
  return r.int(2023, 2024);
}

function buildCssWell(n: number, config: FixtureConfig, r: Rng): WellRecord {
  const id = `BGW-${n}`;
  const startYear = cssStartYear(n, config, r);
  return {
    id,
    number: n,
    status: "css",
    location: { x_km: 0, y_km: 0 },
    completion: r.next() < 0.3 ? "deviated" : "vertical",
    spudYear: Math.min(startYear - 1, r.int(2016, 2021)),
    fluid: {
      reservoirTemperature_C: r.stepped(46, 48, 0.5),
      api_deg: r.stepped(17, 19, 0.1),
      viscosityAt50C_cP: r.stepped(10_000, 13_000, 100),
    },
    css: {
      coldOilRate_bbl_per_d: r.stepped(8, 12, 0.1),
      heatedZoneExponent: r.stepped(0.4, 0.46, 0.01),
      baseWaterCut_frac: r.stepped(0.18, 0.35, 0.01),
      pump: {
        stroke_in: r.pick([100, 120, 144]),
        plungerDiameter_in: r.pick([2.25, 2.75]),
        fillage_frac: r.stepped(0.8, 0.9, 0.01),
      },
      design: {
        injectionRate_t_per_h: r.stepped(4.5, 6.5, 0.1),
        injection_d: r.int(14, 18),
        soak_d: r.int(5, 7),
        injectionTemperature_C: r.stepped(260, 310, 5),
      },
      cssStartYear: startYear,
    },
  };
}

function buildColdWell(n: number, config: FixtureConfig, r: Rng): WellRecord {
  const fishbone = config.fishboneWells.includes(n);
  return {
    id: `BGW-${n}`,
    number: n,
    status: "cold",
    location: { x_km: 0, y_km: 0 },
    completion: fishbone ? "fishbone" : r.next() < 0.3 ? "deviated" : "vertical",
    spudYear: fishbone ? 2025 : r.int(2016, 2024),
    fluid: {
      reservoirTemperature_C: r.stepped(46, 48, 0.5),
      api_deg: r.stepped(17, 19, 0.1),
      viscosityAt50C_cP: r.stepped(10_000, 13_000, 100),
    },
    cold: {
      oilRateAtAsOf_bbl_per_d: fishbone ? r.stepped(45, 70, 0.1) : r.stepped(18, 45, 0.1),
      decline_per_yr: r.stepped(0.08, 0.18, 0.01),
      waterCut_frac: r.stepped(0.15, 0.45, 0.01),
      pump: {
        stroke_in: r.pick([100, 120]),
        plungerDiameter_in: 2.25,
        fillage_frac: r.stepped(0.75, 0.9, 0.01),
      },
    },
  };
}

function buildIdleWell(n: number, r: Rng): WellRecord {
  return {
    id: `BGW-${n}`,
    number: n,
    location: { x_km: 0, y_km: 0 },
    status: r.next() < 0.6 ? "shut-in" : "observation",
    completion: "vertical",
    spudYear: r.int(2014, 2024),
    fluid: {
      reservoirTemperature_C: r.stepped(46, 48, 0.5),
      api_deg: r.stepped(17, 19, 0.1),
      viscosityAt50C_cP: r.stepped(10_000, 13_000, 100),
    },
  };
}

/** Cycle history for one CSS well: the current cycle plus evenly spread earlier ones. */
function buildCycles(well: WellRecord, config: FixtureConfig, r: Rng): CycleRecord[] {
  const css = well.css!;
  const design = css.design;
  const override = config.currentCycleOverrides[well.id];

  const cycleNumber =
    override?.cycleNumber ??
    (well.number === config.pilotWell ? 6 : config.expansionWells.includes(well.number) ? 5 : r.int(3, 5));
  const leg = designLeg_d(
    new WellModel(well, config.assumptions),
    cycleNumber,
    config.assumptions.steamCost_bbl_per_t,
    config.assumptions.minProductionLeg_d,
  );
  const cycleLength_d = design.injection_d + design.soak_d + leg;
  const steamStart_d = override?.steamStart_d ?? -r.int(1, cycleLength_d - 2);

  const current: CycleRecord = {
    wellId: well.id,
    cycleNumber,
    steamStart_d,
    injection_d: override?.actualInjection_d ?? design.injection_d,
    soak_d: design.soak_d,
    rate_t_per_h: design.injectionRate_t_per_h,
    injectionTemperature_C: design.injectionTemperature_C,
    ...(override?.actualInjection_d && override.actualInjection_d !== design.injection_d
      ? {
          note: `Injection stopped after ${override.actualInjection_d} of ${design.injection_d} days${override.cause ? `, ${override.cause}` : ""}`,
        }
      : {}),
  };

  const cssStart_d = dayOffset(config.asOf, `${css.cssStartYear}-0${r.int(2, 9)}-15`);
  const interval = (steamStart_d - cssStart_d) / Math.max(1, cycleNumber - 1);
  const history: CycleRecord[] = [];
  for (let k = 1; k < cycleNumber; k++) {
    const jitter = k === 1 ? 0 : r.int(-12, 12);
    history.push({
      wellId: well.id,
      cycleNumber: k,
      steamStart_d: Math.round(cssStart_d + (k - 1) * interval + jitter),
      injection_d: Math.max(10, design.injection_d + r.int(-2, 1)),
      soak_d: design.soak_d + r.int(-1, 1),
      rate_t_per_h: Number((design.injectionRate_t_per_h * r.uniform(0.94, 1.03)).toFixed(1)),
      injectionTemperature_C: design.injectionTemperature_C + r.pick([-10, -5, 0, 5]),
    });
  }
  return [...history, current];
}

export interface GeneratedField {
  dataset: FieldDataset;
  daily: DailyColumns;
}

/** The field without its daily history, which is all the scheduler needs. */
export function generateField(config: FixtureConfig = FIXTURE): FieldDataset {
  return buildField(config, false).dataset;
}

/** The field with its eight-year daily history and the derived health and calibration data. */
export function generateFieldWithHistory(config: FixtureConfig = FIXTURE): GeneratedField {
  return buildField(config, true);
}

function buildField(config: FixtureConfig, withHistory: boolean): GeneratedField {
  const root = new Rng(config.seed);
  const all = Array.from({ length: config.wellsDrilled }, (_, i) => i + 1);

  const forcedCss = [...new Set([config.pilotWell, ...config.expansionWells, ...config.storyWells])];
  const pool = root
    .fork("selection")
    .shuffle(all.filter((n) => !forcedCss.includes(n) && !config.fishboneWells.includes(n)));
  const cssNumbers = [...forcedCss, ...pool.slice(0, config.wellsOnCss - forcedCss.length)];
  const coldCount = config.wellsProducing - config.wellsOnCss - config.fishboneWells.length;
  const coldNumbers = [
    ...config.fishboneWells,
    ...pool.slice(config.wellsOnCss - forcedCss.length, config.wellsOnCss - forcedCss.length + coldCount),
  ];

  const wells: WellRecord[] = all.map((n) => {
    const r = root.fork(`well:${n}`);
    if (cssNumbers.includes(n)) return buildCssWell(n, config, r);
    if (coldNumbers.includes(n)) return buildColdWell(n, config, r);
    return buildIdleWell(n, r);
  });

  const mr = root.fork("map");
  const locations = placeWells(wells, config.pilotWell, mr.fork("wells"));
  for (const w of wells) w.location = locations.get(w.number)!;

  const cycles = wells
    .filter((w) => w.status === "css")
    .flatMap((w) => buildCycles(w, config, root.fork(`cycles:${w.number}`)));

  const dr = root.fork("downtime");
  const downtimeCandidates = dr.shuffle(wells.filter((w) => w.status === "cold"));
  const downtime: DowntimeEvent[] = downtimeCandidates.slice(0, 4).map((w) => ({
    wellId: w.id,
    start_d: dr.int(4, config.horizon_d - 10),
    duration_d: dr.int(2, 6),
    reason: dr.pick(DOWNTIME_REASONS),
  }));

  const dataset: FieldDataset = {
    meta: {
      seed: config.seed,
      asOf: config.asOf,
      horizon_d: config.horizon_d,
      generatorVersion: GENERATOR_VERSION,
    },
    field: {
      name: "Heavy-oil field",
      wellsDrilled: config.wellsDrilled,
      wellsProducing: config.wellsProducing,
      wellsOnCss: config.wellsOnCss,
    },
    assumptions: config.assumptions,
    wells,
    cycles: cycles.sort((a, b) => a.wellId.localeCompare(b.wellId) || a.cycleNumber - b.cycleNumber),
    issuedPlan: [],
    downtime: downtime.sort((a, b) => a.start_d - b.start_d),
    failures: [],
    health: [],
    calibration: [],
    history: {
      from: "",
      to: "",
      dailyRows: 0,
      columns: [...HISTORY_COLUMNS],
      failures: 0,
      missingFraction: 0,
      frozenRuns: 0,
      file: DAILY_FILE,
    },
    map: { outline_km: fieldOutline(mr.fork("outline")), structure: structureGrid(mr.fork("structure")) },
  };

  const field = new FieldModel(dataset);
  dataset.issuedPlan = issuePlanByPractice(field, {
    units: config.assumptions.generatorUnits,
    unitCapacity_t_per_h: config.assumptions.generatorUnitCapacity_t_per_h,
  });

  const empty: DailyColumns = Object.fromEntries(HISTORY_COLUMNS.map((c) => [c, []])) as unknown as DailyColumns;
  if (!withHistory) return { dataset, daily: empty };

  const history = generateHistory(
    wells,
    dataset.cycles,
    dataset.issuedPlan,
    config.assumptions,
    config.asOf,
    root.fork("history"),
    config.calibrationWells,
    config.upcomingFailures,
  );
  const dates = history.columns.date;
  dataset.failures = history.failures;
  dataset.health = history.health;
  dataset.calibration = history.calibration;
  dataset.history = {
    from: dates.reduce((m, d) => (d < m ? d : m), dates[0] ?? ""),
    to: dates.reduce((m, d) => (d > m ? d : m), dates[0] ?? ""),
    dailyRows: dates.length,
    columns: [...HISTORY_COLUMNS],
    failures: history.failures.length,
    missingFraction: Number(history.missingFraction.toFixed(4)),
    frozenRuns: history.frozenRuns,
    file: DAILY_FILE,
  };
  return { dataset, daily: history.columns };
}
