import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FieldModel } from "@bgw/optimise";
import { analyseHero, generateField, generateFieldWithHistory } from "../src";

const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../../data/demo/field.json", import.meta.url)), "utf8"));
const generated = generateFieldWithHistory();

describe("seeded field", () => {
  it("is the same every run", () => {
    expect(JSON.stringify(generateField())).toBe(JSON.stringify(generateField()));
  });

  it("matches the committed data/demo/field.json, so `pnpm gen` is up to date", () => {
    expect(JSON.parse(JSON.stringify(generated.dataset))).toEqual(committed);
  });

  it("has the published well counts", () => {
    const d = generated.dataset;
    expect(d.wells).toHaveLength(52);
    expect(d.wells.filter((w) => w.status === "css" || w.status === "cold")).toHaveLength(33);
    expect(d.wells.filter((w) => w.status === "css")).toHaveLength(19);
  });

  it("keeps every well inside the published fluid ranges", () => {
    for (const w of generated.dataset.wells) {
      expect(w.fluid.viscosityAt50C_cP).toBeGreaterThanOrEqual(10_000);
      expect(w.fluid.viscosityAt50C_cP).toBeLessThanOrEqual(13_000);
      expect(w.fluid.api_deg).toBeGreaterThanOrEqual(17);
      expect(w.fluid.api_deg).toBeLessThanOrEqual(19);
      expect(w.fluid.reservoirTemperature_C).toBeGreaterThanOrEqual(46);
      expect(w.fluid.reservoirTemperature_C).toBeLessThanOrEqual(48);
    }
  });

  it("puts field oil today within 15% of the published 1,202 bopd", () => {
    const field = new FieldModel(generated.dataset);
    const ev = field.evaluate(generated.dataset.issuedPlan, { units: 2, unitCapacity_t_per_h: 12 });
    const today = ev.timelines.reduce((s, t) => s + t.days[0]!.oil_bbl_per_d, 0);
    expect(Math.abs(today - 1202) / 1202).toBeLessThan(0.15);
  });

  it("has 60 to 80 failures over the history since 2017", () => {
    expect(generated.dataset.failures.length).toBeGreaterThanOrEqual(60);
    expect(generated.dataset.failures.length).toBeLessThanOrEqual(80);
    expect(generated.dataset.failures.every((f) => f.day_d < 0)).toBe(true);
  });

  it("gives each CSS well three to six cycles, the pilot the most", () => {
    const counts = new Map<string, number>();
    for (const c of generated.dataset.cycles) counts.set(c.wellId, Math.max(counts.get(c.wellId) ?? 0, c.cycleNumber));
    for (const n of counts.values()) {
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
    expect(counts.get("BGW-8")).toBe(6);
  });
});

describe("demo story on its own physics", () => {
  const { summary } = analyseHero(generated.dataset);

  it("has BGW-14 due about two weeks before its planned slot", () => {
    expect(summary.delta_d).toBe(-14);
  });

  it("overloads the generators for three days when BGW-14 moves", () => {
    expect(summary.overloadDays).toHaveLength(3);
  });

  it("clears it by moving BGW-22 later, and raises 90-day oil", () => {
    expect(summary.moves).toHaveLength(1);
    expect(summary.moves[0]!.wellId).toBe("BGW-22");
    expect(summary.moves[0]!.delta_d).toBeGreaterThan(0);
    expect(summary.feasible).toBe(true);
    expect(summary.proposalOil90_bbl).toBeGreaterThan(summary.issuedOil90_bbl);
  });
});
