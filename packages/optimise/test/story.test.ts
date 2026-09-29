import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FieldModel, fieldStory, fieldYear, wellStory, type FieldDataset } from "../src";

// Pins the demo story to the shipped dataset, the one the web app reads, so
// the numbers the video speaks cannot drift from the engine.
const dataset = JSON.parse(readFileSync(new URL("../../../data/demo/field.json", import.meta.url), "utf8")) as FieldDataset;
const field = new FieldModel(dataset);

describe("BGW-14 before and after", () => {
  const s = wellStory(field);

  it("steams on the plan's day today and on the re-steam day with the twin", () => {
    expect(s.cycleNumber).toBe(5);
    expect(s.steam_t).toBe(1728);
    expect(s.designSteam_t).toBe(2016);
    expect(s.today.nextSteam_t).toBe(2016);
    expect(s.soakEnd_d).toBe(-57);
    expect(s.plannedSteam_d).toBe(44);
    expect(s.resteam_d).toBe(30);
  });

  it("floats the rods for 17 days at constant speed and never with the twin", () => {
    expect(s.today.floatDays.length).toBe(17);
    expect(s.today.floatDays[0]).toBe(27);
    expect(s.today.peakFloatRatio).toBeCloseTo(1.32, 2);
    expect(s.twin.floatDays).toEqual([]);
    expect(s.twin.peakFloatRatio).toBeCloseTo(0.53, 2);
  });

  it("pumps the same oil to the twin's steam date on a quarter less electricity", () => {
    expect(Math.round(s.samePeriod.oil_bbl)).toBe(474);
    expect(Math.round(s.samePeriod.today_kWh)).toBe(1756);
    expect(Math.round(s.samePeriod.twin_kWh)).toBe(1300);
    expect(Math.round(s.samePeriod.change_frac * 100)).toBe(-26);
  });

  it("shows a slack string on the card at constant speed and a loaded one with the twin", () => {
    expect(s.card.day_d).toBe(29);
    expect(s.card.today.minLoad_kN).toBeLessThan(0);
    expect(s.card.twin.minLoad_kN).toBeGreaterThan(0);
  });
});

describe("the field", () => {
  it("overloads the generators for three days and moves BGW-22 by three days", () => {
    const f = fieldStory(field);
    expect(f.repair.edited.overloadDays).toEqual([40, 41, 42]);
    expect(f.repair.edited.totals.peakLoad_t_per_h).toBeCloseTo(26.9, 1);
    expect(f.repair.options.filter((o) => o.status === "clears").length).toBe(4);
    expect(f.repair.moves.map((m) => [m.wellId, m.delta_d])).toEqual([["BGW-22", 3]]);
    expect(Math.round(f.change.oilBefore_bbl)).toBe(3878);
    expect(Math.round(f.change.oilAfter_bbl)).toBe(4040);
    expect(f.change.sorBefore).toBeCloseTo(6.59, 2);
    expect(f.change.sorAfter).toBeCloseTo(6.33, 2);
  });

  it("removes rod-float days and a third of expected failures over a year, with oil and SOR unchanged", () => {
    const y = fieldYear(field);
    expect(y.wells).toBe(19);
    expect(Math.round(y.before.floatDays)).toBe(250);
    expect(Math.round(y.after.floatDays)).toBe(0);
    expect(y.before.failures).toBeCloseTo(4.41, 2);
    expect(y.after.failures).toBeCloseTo(2.85, 2);
    expect(y.before.kWhPerBbl).toBeCloseTo(1.88, 2);
    expect(y.after.kWhPerBbl).toBeCloseTo(1.75, 2);
    expect(y.after.oil_bbl).toBeCloseTo(y.before.oil_bbl, 6);
    expect(y.after.sor).toBeCloseTo(y.before.sor, 6);
  });
});
