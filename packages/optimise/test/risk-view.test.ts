import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FieldModel, fieldRisk, type FieldDataset } from "../src";

// The committed dataset carries the health records the history derives.
const dataset: FieldDataset = JSON.parse(readFileSync(fileURLToPath(new URL("../../../data/demo/field.json", import.meta.url)), "utf8"));
const field = new FieldModel(dataset);
const a = dataset.assumptions.reliability;
const risks = fieldRisk(field, dataset.issuedPlan, dataset.health, a);
const byWell = new Map(risks.map((r) => [r.wellId, r]));

describe("field reliability view", () => {
  it("covers every producing well that has a health record", () => {
    const producing = new Set(dataset.wells.filter((w) => w.status === "css" || w.status === "cold").map((w) => w.id));
    const expected = dataset.health.filter((h) => producing.has(h.wellId)).map((h) => h.wellId);
    expect(risks.map((r) => r.wellId).sort()).toEqual([...expected].sort());
  });

  it("ranks wells from the highest central risk down", () => {
    for (let i = 1; i < risks.length; i++) expect(risks[i - 1]!.risk.central).toBeGreaterThanOrEqual(risks[i]!.risk.central);
  });

  it("adds no rod-float loading on cold wells, which run gently", () => {
    for (const r of risks.filter((x) => x.status === "cold")) {
      expect(r.impactAhead).toBe(0);
      expect(r.floatDaysAhead).toBe(0);
    }
  });

  it("monitors every well whose rods keep up this week, unless drift calls for an inspection", () => {
    for (const r of risks.filter((x) => x.action !== "inspect")) {
      expect(r.floatDaysAhead).toBe(0);
      expect(r.action).toBe("monitor");
    }
  });

  it("asks to slow the downstroke once the window reaches the days the rods float", () => {
    // BGW-14 floats at constant speed in the weeks before its next steam.
    const month = fieldRisk(field, dataset.issuedPlan, dataset.health, a, 45);
    const hero = month.find((r) => r.wellId === "BGW-14")!;
    expect(hero.floatDaysAhead).toBeGreaterThan(0);
    expect(hero.impactAhead).toBeGreaterThan(0);
    expect(hero.action).toBe("slow-downstroke");
    expect(hero.risk.central).toBeGreaterThan(byWell.get("BGW-14")!.risk.central);
  });

  it("inspects only when card drift drives a high estimate", () => {
    for (const r of risks.filter((x) => x.action === "inspect")) {
      expect(r.risk.driver).toBe("drift");
      expect(r.risk.high).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("prices the slowdown from oil the gentlest stroke cannot lift", () => {
    for (const r of risks) {
      expect(r.slowingLoss_bbl).toBeGreaterThanOrEqual(0);
      expect(r.cost.slowing_inr_lakh).toBeCloseTo((r.slowingLoss_bbl * a.oilPrice_inr_per_bbl) / 1e5, 9);
      expect(r.cost.lostOilIfFails_bbl).toBeCloseTo(r.oilRate_bbl_per_d * a.failureDowntime_d, 9);
    }
  });

  it("looks only as far ahead as it is asked", () => {
    const one = fieldRisk(field, dataset.issuedPlan, dataset.health, a, 1);
    const hero = one.find((r) => r.wellId === "BGW-14")!;
    expect(hero.risk.horizon_d).toBe(1);
    expect(hero.floatDaysAhead).toBeLessThanOrEqual(1);
    expect(hero.impactAhead).toBeLessThanOrEqual(byWell.get("BGW-14")!.impactAhead);
  });
});
