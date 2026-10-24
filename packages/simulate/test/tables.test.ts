import { describe, expect, it } from "vitest";
import { FieldModel } from "@bgw/optimise";
import { generateField } from "../src";
import { scheduleTables } from "../src/tables";

const dataset = generateField();
const tables = scheduleTables(dataset);

describe("schedule tables for the Python API", () => {
  it("carries the planning settings from the dataset", () => {
    expect(tables.horizon_d).toBe(dataset.meta.horizon_d);
    expect(tables.steamCost_bbl_per_t).toBe(dataset.assumptions.steamCost_bbl_per_t);
    expect(tables.capacity).toEqual({
      units: dataset.assumptions.generatorUnits,
      unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
    });
  });

  it("exports one anchor cycle per steam well and every issued slot once", () => {
    const wells = dataset.wells.filter((w) => w.status === "css").map((w) => w.id);
    expect(tables.css.map((w) => w.wellId).sort()).toEqual([...wells].sort());
    const slots = tables.css.flatMap((w) => w.slots.map((s) => s.slotId));
    expect([...slots].sort()).toEqual(dataset.issuedPlan.map((s) => s.id).sort());
    for (const w of tables.css) expect(w.anchor.slotId).toBeNull();
  });

  it("exports oil curves that match the twin day for day", () => {
    const field = new FieldModel(dataset);
    const well = tables.css.find((w) => w.wellId === "BGW-14")!;
    const [anchor] = field.cyclesFor("BGW-14", dataset.issuedPlan);
    const curve = field.curveFor("BGW-14", anchor!);
    for (const t of [0, 1, 30, 120]) expect(well.anchor.oil[t]).toBe(curve.oil(t));
  });

  it("gives every cold well a full horizon of oil", () => {
    expect(tables.cold.length).toBeGreaterThan(0);
    for (const w of tables.cold) expect(w.oil).toHaveLength(tables.horizon_d);
  });

  it("expands each downtime event into its days", () => {
    const e = dataset.downtime[0]!;
    const days = tables.downtime[e.wellId]!;
    for (let d = e.start_d; d < e.start_d + e.duration_d; d++) expect(days).toContain(d);
  });

  it("records a golden edit that the repair has to clear", () => {
    expect(tables.golden.editedOverloadDays.length).toBeGreaterThan(0);
    expect(tables.golden.moves.length).toBeGreaterThan(0);
    expect(tables.golden.moves.every((m) => m.slotId !== tables.golden.editedSlotId)).toBe(true);
  });
});
