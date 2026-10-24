import { describe, expect, it } from "vitest";
import { generateField } from "../../simulate/src/generate";
import { CREW_REACTION_D, cycleScenario, FieldModel, MAX_RESTEAM_SEARCH_D, type ScenarioInput } from "../src";

const dataset = generateField();
const field = new FieldModel(dataset);
const { minProductionLeg_d: minLeg, reliability, steamCost_bbl_per_t } = dataset.assumptions;
const model = field.model("BGW-14");
const design = model.well.css!.design;
const designSteam = design.injectionRate_t_per_h * 24 * design.injection_d;
const base: ScenarioInput = { steam_t: designSteam, soak_d: design.soak_d, steamCost_bbl_per_t, pump: "twin" };
const run = (patch: Partial<ScenarioInput> = {}) => cycleScenario(model, 6, { ...base, ...patch }, minLeg, reliability);

describe("what-if cycle scenario", () => {
  it("injects the design steam over the design injection days", () => {
    const r = run();
    expect(r.injection_d).toBe(design.injection_d);
    expect(r.cycleLength_d).toBe(r.injection_d + design.soak_d + r.productionLeg_d);
    expect(r.oil).toHaveLength(r.productionLeg_d);
    expect(r.temperature_C).toHaveLength(r.productionLeg_d);
  });

  it("keeps its totals consistent with the daily series", () => {
    const r = run();
    const oil = r.oil.reduce((s, q) => s + q, 0);
    expect(r.cycleOil_bbl).toBeCloseTo(oil, 9);
    expect(r.oilPerCycleDay_bbl).toBeCloseTo(oil / r.cycleLength_d, 9);
    expect(r.kWhPerBbl).toBeCloseTo(r.energy_kWh / oil, 9);
    expect(r.failureChance).toBeCloseTo(1 - Math.exp(-r.expectedFailures), 12);
  });

  it("makes more oil from more steam, at a higher steam-oil ratio past the large-slug limit", () => {
    const small = run({ steam_t: 1800 });
    const large = run({ steam_t: 3600 });
    expect(large.cycleOil_bbl).toBeGreaterThan(small.cycleOil_bbl);
    expect(large.injection_d).toBeGreaterThan(small.injection_d);
    expect(large.sor).toBeGreaterThan(small.sor);
  });

  it("never injects for less than a day", () => {
    expect(run({ steam_t: 10 }).injection_d).toBe(1);
  });

  it("produces longer before re-steaming when steam costs more", () => {
    expect(run({ steamCost_bbl_per_t: steamCost_bbl_per_t * 3 }).productionLeg_d).toBeGreaterThan(run().productionLeg_d);
  });

  it("floats the rods at constant speed but not with the twin's stroke", () => {
    const twin = run({ pump: "twin" });
    const practice = run({ pump: "practice" });
    expect(twin.floatDays).toBe(0);
    expect(practice.floatDays).toBeGreaterThan(CREW_REACTION_D);
    expect(practice.expectedFailures).toBeGreaterThan(twin.expectedFailures);
    expect(practice.cycleOil_bbl).toBeCloseTo(twin.cycleOil_bbl, 9);
  });

  it("flags a cycle whose re-steam day falls off the search", () => {
    const r = run({ steamCost_bbl_per_t: 50 });
    expect(r.noResteam).toBe(true);
    expect(r.productionLeg_d).toBe(MAX_RESTEAM_SEARCH_D);
  });
});
