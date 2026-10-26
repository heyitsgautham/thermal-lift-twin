import { describe, expect, it } from "vitest";
import { momentAt, scenarioOf, storyData } from "../data";
import type { ScenarioStory } from "../engine";
import { updateFrame } from "../frame";
import { flowTable, strokeTable } from "../stroke";

const { well, fieldBeat, year } = storyData();

describe("wellStory timelines", () => {
  const check = (sc: ScenarioStory) => {
    const ds = sc.days.map((d) => d.d);
    // One entry per calendar day, no gaps and no repeats.
    expect(ds.slice(1).every((d, i) => d === ds[i]! + 1)).toBe(true);
    // Steam, soak, produce, then the next cycle's steam, soak, produce.
    const legs = sc.days.map((d) => d.phase).filter((p, i, all) => p !== all[i - 1]);
    expect(legs).toEqual(["steam", "soak", "produce", "steam", "soak", "produce"]);
  };

  it("runs today's scenario day by day through two cycles", () => check(well.before));
  it("runs the twin's scenario day by day through two cycles", () => check(well.after));

  it("starts the next steam on the scenario's steam day", () => {
    for (const sc of [well.before, well.after]) {
      const firstNextSteam = sc.days.find((d) => d.phase === "steam" && d.cycleNumber === well.cycle.cycleNumber + 1)!;
      expect(firstNextSteam.d).toBe(sc.steamStart_d);
    }
  });

  it("stops the pump for steam and soak and runs it while producing", () => {
    for (const d of well.before.days) expect(d.pump === null).toBe(d.phase !== "produce");
  });

  it("heats the zone while the steam goes in, reaching the production start temperature", () => {
    const steam = well.before.days.filter((d) => d.phase === "steam" && d.cycleNumber === well.cycle.cycleNumber);
    const temps = steam.map((d) => d.temperature_C);
    expect([...temps].sort((a, b) => a - b)).toEqual(temps);
    expect(temps.at(-1)).toBeCloseTo(well.cycle.peakTemperature_C, 6);
    expect(temps[0]).toBeGreaterThan(well.reservoirTemperature_C);
  });

  it("counts the float days it reports", () => {
    for (const sc of [well.before, well.after]) {
      const floats = sc.days.filter((d) => d.phase === "produce" && d.cycleNumber === well.cycle.cycleNumber && d.pump!.floatRatio >= 1);
      expect(floats).toHaveLength(sc.floatDays);
      expect(floats[0]?.d ?? null).toBe(sc.firstFloat_d);
    }
  });
});

describe("field beat and year", () => {
  it("moves the story well to its re-steam day and clears the overload it causes", () => {
    expect(fieldBeat.toStart_d).toBeLessThan(fieldBeat.fromStart_d);
    expect(fieldBeat.overloadDays.length).toBeGreaterThan(0);
    expect(fieldBeat.feasible).toBe(true);
    expect(Math.max(...fieldBeat.load.proposal)).toBeLessThanOrEqual(fieldBeat.capacity_t_per_h + 1e-9);
    expect(fieldBeat.changedWells).toContain(well.wellId);
  });

  it("annualises one cycle for each cyclic-steam well", () => {
    expect(year.wells).toBe(19);
    expect(year.after.floatDays).toBeLessThan(year.before.floatDays);
    expect(year.after.expectedFailures).toBeLessThan(year.before.expectedFailures);
  });
});

describe("momentAt", () => {
  const sc = scenarioOf(well, "today");
  const first = sc.days[0]!;

  it("shows the cold well before the story's first day", () => {
    const m = momentAt(well, "today", first.d - 5);
    expect(m).toMatchObject({ phase: "cold", pumping: false, oil_bbl_per_d: 0, cycleNumber: first.cycleNumber - 1 });
    expect(m.temperature_C).toBe(well.cold.temperature_C);
  });

  it("reads a whole day's values as the engine computed them", () => {
    const d = sc.days.find((x) => x.phase === "produce")!;
    const m = momentAt(well, "today", d.d);
    expect(m.temperature_C).toBe(d.temperature_C);
    expect(m.oil_bbl_per_d).toBe(d.oil_bbl_per_d);
    expect(m.spm).toBe(d.pump!.spm);
    expect(m.pumping).toBe(true);
  });

  it("blends temperature linearly and viscosity on a log scale within a leg", () => {
    const i = sc.days.findIndex((x, j) => x.phase === "produce" && sc.days[j + 1]?.phase === "produce");
    const a = sc.days[i]!;
    const b = sc.days[i + 1]!;
    const m = momentAt(well, "today", a.d + 0.5);
    expect(m.temperature_C).toBeCloseTo((a.temperature_C + b.temperature_C) / 2, 9);
    expect(m.viscosity_cP).toBeCloseTo(Math.sqrt(a.viscosity_cP * b.viscosity_cP), 6);
  });

  it("holds the last day's values up to a change of phase instead of blending across it", () => {
    const i = sc.days.findIndex((x, j) => x.phase === "produce" && sc.days[j + 1]?.phase === "steam");
    const a = sc.days[i]!;
    const m = momentAt(well, "today", a.d + 0.9);
    expect(m.phase).toBe("produce");
    expect(m.temperature_C).toBe(a.temperature_C);
    expect(m.oil_bbl_per_d).toBe(a.oil_bbl_per_d);
  });

  it("tallies float days so far in the current cycle", () => {
    const last = sc.days.at(-1)!.d;
    expect(momentAt(well, "today", last).floatDaysSoFar).toBe(well.before.floatDays);
    expect(momentAt(well, "twin", last).floatDaysSoFar).toBe(well.after.floatDays);
    expect(momentAt(well, "today", first.d).floatDaysSoFar).toBe(0);
  });
});

describe("updateFrame", () => {
  const strokes = strokeTable(well);
  const { oil, steam } = flowTable(well);
  const tables = { strokes, oil, steam };

  it("keeps the glow between cold and the hottest the story shows", () => {
    for (let t = 0; t < 240; t += 3) {
      const f = updateFrame(t, well, tables);
      expect(f.heat).toBeGreaterThanOrEqual(0);
      expect(f.heat).toBeLessThanOrEqual(1);
    }
  });

  it("depends only on story time", () => {
    const a = { ...updateFrame(42.5, well, tables) };
    updateFrame(120, well, tables);
    const b = updateFrame(42.5, well, tables);
    expect(b.day).toBe(a.day);
    expect(b.strokes).toBe(a.strokes);
    expect(b.rod).toEqual(a.rod);
  });
});
