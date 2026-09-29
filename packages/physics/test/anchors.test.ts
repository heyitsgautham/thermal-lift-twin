import { describe, expect, it } from "vitest";
import {
  apiToSpecificGravity,
  coldProductionState,
  cssProductionState,
  fitWalther,
  pumpDisplacement_bbl_per_d,
  rodFallSpeed_m_per_s,
  rodFloatRatio,
  simulateStroke,
  steamTonnesToCweBbl,
  tubingViscosity_cP,
  viscosity_cP,
  type CssWellProperties,
  type ReservoirFluid,
} from "../src";

// Published field points (OIL field page, April 2026 press release):
// 10,000 to 13,000 cP at 50 °C, 17 to 19° API, 46 to 48 °C reservoir,
// Jodhpur Sandstone at about 1,150 m, 50 to 350 bbl/d per well by cycle stage.

const HIGH = { temperature_C: 200, viscosity_cP: 20 };

function fluid(mu50 = 12_000, api = 18, tr = 47): ReservoirFluid {
  return { reservoirTemperature_C: tr, api_deg: api, viscosity: fitWalther({ temperature_C: 50, viscosity_cP: mu50 }, HIGH, api) };
}

const WELL: CssWellProperties = {
  coldOilRate_bbl_per_d: 10,
  heatedZoneExponent: 0.43,
  baseWaterCut_frac: 0.25,
  pump: { stroke_in: 144, plungerDiameter_in: 2.25, fillage_frac: 0.85 },
};

describe("viscosity, ASTM D341 Walther fit", () => {
  it("passes through the published 50 °C points across the whole range", () => {
    for (const mu50 of [10_000, 12_000, 13_000]) {
      const f = fluid(mu50);
      expect(viscosity_cP(f.viscosity, 50)).toBeCloseTo(mu50, -1);
      expect(viscosity_cP(f.viscosity, 200)).toBeCloseTo(20, 3);
    }
  });

  it("falls monotonically as the crude heats", () => {
    const f = fluid();
    let last = Infinity;
    for (let t = 40; t <= 260; t += 5) {
      const mu = viscosity_cP(f.viscosity, t);
      expect(mu).toBeLessThan(last);
      last = mu;
    }
  });

  it("puts reservoir-temperature crude above the 50 °C value, as it is cooler", () => {
    const f = fluid();
    expect(viscosity_cP(f.viscosity, 47)).toBeGreaterThan(12_000);
    expect(viscosity_cP(f.viscosity, 47)).toBeLessThan(20_000);
  });
});

describe("units and gravity", () => {
  it("maps 17 to 19° API to the heavy-crude gravity range", () => {
    expect(apiToSpecificGravity(17)).toBeCloseTo(0.9529, 3);
    expect(apiToSpecificGravity(19)).toBeCloseTo(0.9402, 3);
  });

  it("counts one tonne of steam as one cubic metre of cold water", () => {
    expect(steamTonnesToCweBbl(1)).toBeCloseTo(6.2898, 3);
  });
});

describe("pump and rods", () => {
  it("uses the API RP 11L displacement constant", () => {
    expect(pumpDisplacement_bbl_per_d({ stroke_in: 1, plungerDiameter_in: 1, fillage_frac: 1 }, 1)).toBeCloseTo(0.1166, 6);
    expect(pumpDisplacement_bbl_per_d({ stroke_in: 120, plungerDiameter_in: 2.25, fillage_frac: 1 }, 6)).toBeCloseTo(425.0, 0);
  });

  it("gives the Couette terminal fall speed of a 7/8 in rod in 2 7/8 in tubing", () => {
    // w_b = (7850 - 946) * 9.81 * pi/4 * 0.0222^2, about 26.2 N/m; ln(R/r) = ln(0.062/0.0222), about 1.027.
    const wb = (7850 - 946) * 9.81 * (Math.PI / 4) * 0.0222 ** 2;
    const expected = (wb * Math.log(0.062 / 0.0222)) / (2 * Math.PI * 1);
    expect(rodFallSpeed_m_per_s(1000, 946)).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(4.29, 2);
  });

  it("slows the rods' fall as the crude thickens", () => {
    expect(rodFallSpeed_m_per_s(10_000, 946)).toBeLessThan(rodFallSpeed_m_per_s(1000, 946) / 9.9);
  });

  it("floats the rods at constant speed in cold crude and keeps them loaded with a slow downstroke", () => {
    const constant = simulateStroke({ stroke_in: 120, spm: 3, upstrokeFraction: 0.5, viscosity_cP: 12_000, fluidDensity_kg_per_m3: 946, plungerDiameter_in: 2.25, fillage_frac: 0.9 });
    const hot = simulateStroke({ stroke_in: 120, spm: 3, upstrokeFraction: 0.5, viscosity_cP: 100, fluidDensity_kg_per_m3: 946, plungerDiameter_in: 2.25, fillage_frac: 0.9 });
    const slow = simulateStroke({ stroke_in: 120, spm: 2, upstrokeFraction: 1 / 3, viscosity_cP: 12_000, fluidDensity_kg_per_m3: 946, plungerDiameter_in: 2.25, fillage_frac: 0.9 });
    expect(constant.floats).toBe(true);
    expect(hot.floats).toBe(false);
    expect(slow.slackFraction).toBeLessThan(constant.slackFraction);
  });

  it("puts the peak polished-rod load between rod weight plus fluid load and twice that", () => {
    const r = simulateStroke({ stroke_in: 120, spm: 5, upstrokeFraction: 0.5, viscosity_cP: 50, fluidDensity_kg_per_m3: 946, plungerDiameter_in: 2.25, fillage_frac: 1 });
    const statik = r.rodWeightInFluid_kN + r.fluidLoad_kN;
    expect(r.peakLoad_kN).toBeGreaterThan(statik);
    expect(r.peakLoad_kN).toBeLessThan(2 * statik);
  });
});

describe("the coupled well state", () => {
  const f = fluid();
  const cycle = { cycleNumber: 3, steam_t: 2200, injectionTemperature_C: 285, soak_d: 6 };

  it("cools back toward the published reservoir temperature", () => {
    expect(cssProductionState(f, WELL, cycle, 0).temperature_C).toBeGreaterThan(120);
    expect(cssProductionState(f, WELL, cycle, 400).temperature_C).toBeCloseTo(47, 0);
  });

  it("peaks inside the published 50 to 350 bbl/d per well after steam", () => {
    let peak = 0;
    for (let t = 0; t < 30; t++) peak = Math.max(peak, cssProductionState(f, WELL, cycle, t).oil_bbl_per_d);
    expect(peak).toBeGreaterThan(50);
    expect(peak).toBeLessThan(350);
  });

  it("never lifts more liquid than the pump displaces", () => {
    for (let t = 0; t < 60; t++) {
      const s = cssProductionState(f, WELL, cycle, t);
      expect(s.liquid_bbl_per_d).toBeLessThanOrEqual(s.pumpCapacityLiquid_bbl_per_d + 1e-9);
    }
  });

  it("brings rod float late in the leg, never right after steam", () => {
    const early = cssProductionState(f, WELL, cycle, 5);
    const late = cssProductionState(f, WELL, cycle, 160);
    expect(rodFloatRatio(early.tubingViscosity_cP, 946, 144, 3)).toBeLessThan(0.2);
    expect(rodFloatRatio(late.tubingViscosity_cP, 946, 144, 3)).toBeGreaterThan(0.9);
  });

  it("makes less oil each later cycle, so the steam-oil ratio climbs", () => {
    const cycleOil = (n: number) => {
      let q = 0;
      for (let t = 0; t < 100; t++) q += cssProductionState(f, WELL, { ...cycle, cycleNumber: n }, t).oil_bbl_per_d;
      return q;
    };
    const sor = (n: number) => steamTonnesToCweBbl(cycle.steam_t) / cycleOil(n);
    expect(sor(1)).toBeGreaterThan(2);
    expect(sor(1)).toBeLessThan(3.6);
    expect(sor(5)).toBeGreaterThan(sor(3));
    expect(sor(5)).toBeGreaterThan(4);
  });

  it("reads the tubing viscosity cooler, so thicker, than bottomhole", () => {
    expect(tubingViscosity_cP(f, 80)).toBeGreaterThan(viscosity_cP(f.viscosity, 80));
  });

  it("keeps a cold well at reservoir temperature", () => {
    const s = coldProductionState(f, { oilRateAtAsOf_bbl_per_d: 30, decline_per_yr: 0.1, waterCut_frac: 0.3, pump: WELL.pump }, 0);
    expect(s.temperature_C).toBe(47);
    expect(s.oil_bbl_per_d).toBeCloseTo(30, 5);
  });
});
