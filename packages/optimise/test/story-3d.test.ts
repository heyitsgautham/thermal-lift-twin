import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FieldModel, type FieldDataset } from "../src";
import { fieldStory, fieldYear, wellStory } from "../../../apps/web/src/components/story-3d/engine";

// Holds the 3D view-model to the same story numbers as src/story.ts, on the
// dataset the app ships, so the 3D scenes in the video cannot drift from the 2D ones.
const dataset = JSON.parse(readFileSync(new URL("../../../data/demo/field.json", import.meta.url), "utf8")) as FieldDataset;
const field = new FieldModel(dataset);
const capacity = { units: dataset.assumptions.generatorUnits, unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h };

describe("BGW-14 before and after", () => {
  const s = wellStory(field, "BGW-14", dataset.issuedPlan);

  it("is cycle 5, cut short by a generator trip", () => {
    expect(s.cycle.cycleNumber).toBe(5);
    expect(s.cycle.injection_d).toBe(12);
    expect(s.cycle.designInjection_d).toBe(14);
    expect(s.cycle.steam_t).toBeCloseTo(1728, 6);
    expect(s.cycle.productionStart_d).toBe(-57);
  });

  it("floats the rods for 17 days on the booked slot at constant speed", () => {
    expect(s.before.steamStart_d).toBe(44);
    expect(s.before.floatDays).toBe(17);
    expect(s.before.firstFloat_d).toBe(27);
    expect(s.before.peakFloatRatio).toBeCloseTo(1.32, 2);
  });

  it("never floats them with the twin's steam day and pump", () => {
    expect(s.after.steamStart_d).toBe(30);
    expect(s.after.floatDays).toBe(0);
    expect(s.after.peakFloatRatio).toBeCloseTo(0.53, 2);
  });

  it("lifts the same oil on a quarter less electricity", () => {
    expect(Math.round(s.window.oil_bbl)).toBe(474);
    expect(Math.round(s.window.practice_kWh)).toBe(1756);
    expect(Math.round(s.window.twin_kWh)).toBe(1300);
    expect(Math.round(s.window.change_frac * 100)).toBe(-26);
  });

  it("shows slack rods on the constant-speed card only", () => {
    expect(s.card.d).toBe(29);
    expect(s.card.practice.minLoad_kN).toBeLessThan(0);
    expect(s.card.twin.minLoad_kN).toBeGreaterThan(0);
  });
});

describe("the field", () => {
  const f = fieldStory(field, "BGW-14", dataset.issuedPlan, capacity);

  it("overloads the generators for three days and moves BGW-22 to clear it", () => {
    expect(f.overloadDays).toEqual([40, 41, 42]);
    expect(f.peakEdited_t_per_h).toBeCloseTo(26.9, 1);
    expect(f.moves.map((m) => [m.wellId, m.delta_d])).toEqual([["BGW-22", 3]]);
    expect(f.options.filter((o) => o.status === "clears").length).toBe(4);
    expect(f.feasible).toBe(true);
    expect(Math.round(f.changeBefore.oil_bbl)).toBe(3878);
    expect(Math.round(f.changeAfter.oil_bbl)).toBe(4040);
    expect(f.changeBefore.sor!).toBeCloseTo(6.59, 2);
    expect(f.changeAfter.sor!).toBeCloseTo(6.33, 2);
  });

  it("over a year, removes rod float without changing oil or steam", () => {
    const y = fieldYear(field);
    expect(y.wells).toBe(19);
    expect(Math.round(y.before.floatDays)).toBe(250);
    expect(Math.round(y.after.floatDays)).toBe(0);
    expect(y.before.expectedFailures).toBeCloseTo(4.41, 2);
    expect(y.after.expectedFailures).toBeCloseTo(2.85, 2);
    expect(y.before.kWhPerBbl).toBeCloseTo(1.88, 2);
    expect(y.after.kWhPerBbl).toBeCloseTo(1.75, 2);
    expect(y.after.oil_bbl).toBeCloseTo(y.before.oil_bbl, 6);
    expect(y.after.sor).toBeCloseTo(y.before.sor, 6);
  });
});
