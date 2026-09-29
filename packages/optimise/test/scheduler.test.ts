import { describe, expect, it } from "vitest";
import { generateField } from "../../simulate/src/generate";
import { FieldModel, repairPlan, riskWindow, shiftSlot, DEFAULT_RELIABILITY, operatingPlan, slotSteam_t } from "../src";

const dataset = generateField();
const field = new FieldModel(dataset);
const capacity = { units: 2, unitCapacity_t_per_h: 12 };

describe("plan evaluation", () => {
  it("keeps the issued plan inside generator capacity", () => {
    const ev = field.evaluate(dataset.issuedPlan, capacity);
    expect(ev.overloadDays).toEqual([]);
    expect(ev.totals.peakLoad_t_per_h).toBeLessThanOrEqual(24 + 1e-9);
  });

  it("adds steam tonnes up from the generator load", () => {
    const ev = field.evaluate(dataset.issuedPlan, capacity);
    const fromLoad = ev.load.reduce((s, d) => s + d.total_t_per_h * 24, 0);
    expect(ev.totals.steam90_t).toBeCloseTo(fromLoad, 6);
  });

  it("shuts the pump during injection and soak", () => {
    const ev = field.evaluate(dataset.issuedPlan, capacity);
    for (const t of ev.timelines) for (const c of t.days) if (c.phase !== "produce") expect(c.oil_bbl_per_d).toBe(0);
  });
});

describe("generator repair", () => {
  const slot = dataset.issuedPlan.find((s) => s.wellId === "BGW-14")!;
  const edited = shiftSlot(dataset.issuedPlan, slot.id, -14);

  it("never moves the slot the engineer placed", () => {
    const r = repairPlan(field, edited, new Set([slot.id]), capacity);
    expect(r.moves.every((m) => m.slotId !== slot.id)).toBe(true);
    expect(r.proposal.find((s) => s.id === slot.id)!.start_d).toBe(slot.start_d - 14);
  });

  it("returns a feasible plan and lists the options it tested", () => {
    const r = repairPlan(field, edited, new Set([slot.id]), capacity);
    expect(r.feasible).toBe(true);
    expect(r.after.overloadDays).toEqual([]);
    expect(r.options.length).toBeGreaterThan(1);
    expect(r.tested.shifts).toBeGreaterThan(20);
  });

  it("reports no supported proposal when capacity cannot carry the plan", () => {
    const r = repairPlan(field, edited, new Set([slot.id]), { units: 1, unitCapacity_t_per_h: 12 });
    expect(r.feasible).toBe(false);
  });
});

describe("cycle schedule", () => {
  it("steps the average pump speed down as the well cools and keeps the twin under its float target", () => {
    const well = field.model("BGW-14");
    const s = dataset.issuedPlan.find((x) => x.wellId === "BGW-14")!;
    const plan = operatingPlan(well.fluid, well.well.css!, { cycleNumber: s.cycleNumber, steam_t: slotSteam_t(s), injectionTemperature_C: s.injectionTemperature_C, soak_d: s.soak_d }, 120);
    const avg = plan.days.map((d) => d.twin.spm * d.twin.runtime_frac);
    expect(avg[0]).toBeGreaterThan(avg.at(-1)!);
    expect(plan.twinRiskDays.length).toBe(0);
    expect(plan.days.every((d) => d.twin.spm >= 2 - 1e-9 && d.twin.spm <= 6)).toBe(true);
  });
});

describe("risk window", () => {
  it("widens around the central estimate and rises with drift", () => {
    const flat = riskWindow(Array(60).fill(0.06), 2, 0, DEFAULT_RELIABILITY);
    const rising = riskWindow([...Array(52).fill(0.06), 0.08, 0.1, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27], 2, 0, DEFAULT_RELIABILITY);
    expect(rising.central).toBeGreaterThan(flat.central * 5);
    expect(rising.low).toBeLessThanOrEqual(rising.central);
    expect(rising.high).toBeGreaterThanOrEqual(rising.central);
    expect(rising.driver).toBe("drift");
  });
});
