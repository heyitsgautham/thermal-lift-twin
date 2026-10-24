import { FieldModel, shiftSlot } from "@bgw/optimise";
import { describe, expect, it } from "vitest";
import { buildCycleView } from "../cycle-view";
import { dataset } from "../dataset";

const field = new FieldModel(dataset);
const issued = dataset.issuedPlan;
const view = buildCycleView(field, "BGW-14", issued, issued);

describe("cycle view for one well", () => {
  it("runs day by day from the current cycle's first production day to the end", () => {
    expect(view.days[0]!.d).toBe(view.start_d);
    for (let i = 1; i < view.days.length; i++) expect(view.days[i]!.d).toBe(view.days[i - 1]!.d + 1);
    expect(view.days.at(-1)!.d).toBeLessThanOrEqual(view.end_d);
  });

  it("walks through tail, steam, soak and the next cycle in that order", () => {
    const order = view.days.map((d) => d.part).filter((p, i, all) => p !== all[i - 1]);
    expect(order).toEqual(["tail", "steam", "soak", "next"]);
  });

  it("puts the next steam on the slot's start day for its injection days", () => {
    const steam = view.days.filter((d) => d.part === "steam");
    expect(steam[0]!.d).toBe(view.next!.start_d);
    expect(steam).toHaveLength(view.next!.injection_d);
    expect(steam.every((d) => d.oil_bbl_per_d === 0 && d.twin === null)).toBe(true);
  });

  it("finds the first day current practice floats the rods", () => {
    const first = view.days.find((d) => d.d >= 0 && d.practice && d.practice.floatRatio >= 1);
    expect(view.practiceFloatFrom_d).toBe(first?.d ?? null);
    expect(view.practiceFloatFrom_d).not.toBeNull();
  });

  it("never floats the rods on the twin's setting", () => {
    for (const d of view.days) if (d.twin) expect(d.twin.floatRatio).toBeLessThan(1);
  });

  it("sums the next cycle's oil and works out its steam-oil ratio", () => {
    const oil = view.nextPlan!.days.reduce((s, d) => s + d.oil_bbl_per_d, 0);
    expect(view.nextCycleOil_bbl).toBeCloseTo(oil, 9);
    expect(view.nextCycleSor).toBeCloseTo((view.nextCycleSteam_t * 6.289811) / oil, 9);
  });

  it("remembers where the plan in force had the slot once the proposal moves it", () => {
    expect(view.plannedStart_d).toBeNull();
    const slot = issued.find((s) => s.wellId === "BGW-14")!;
    const moved = buildCycleView(field, "BGW-14", shiftSlot(issued, slot.id, -7), issued);
    expect(moved.plannedStart_d).toBe(slot.start_d);
    expect(moved.next!.start_d).toBe(slot.start_d - 7);
  });
});
