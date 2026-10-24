import type { DayCell } from "@bgw/optimise";
import { describe, expect, it } from "vitest";
import { differenceRuns, phaseRuns, runsOf } from "../runs";

const cell = (phase: DayCell["phase"], cycleNumber: number | null = 5, slotId: string | null = null) =>
  ({ phase, cycleNumber, slotId }) as DayCell;

describe("day runs", () => {
  it("groups consecutive days into inclusive runs", () => {
    expect(runsOf([2, 3, 4, 7, 9, 10])).toEqual([
      { from: 2, to: 4 },
      { from: 7, to: 7 },
      { from: 9, to: 10 },
    ]);
  });

  it("returns no runs for no days", () => {
    expect(runsOf([])).toEqual([]);
  });
});

describe("phase runs", () => {
  it("splits a timeline where the phase changes", () => {
    const days = [cell("produce"), cell("produce"), cell("steam", 6, "S"), cell("steam", 6, "S"), cell("soak", 6, "S"), cell("produce", 6, "S")];
    expect(phaseRuns(days).map((r) => [r.phase, r.from, r.to])).toEqual([
      ["produce", 0, 1],
      ["steam", 2, 3],
      ["soak", 4, 4],
      ["produce", 5, 5],
    ]);
  });

  it("starts a new run when the cycle changes inside one phase", () => {
    const days = [cell("produce", 5), cell("produce", 5), cell("produce", 6, "S")];
    const runs = phaseRuns(days);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ from: 2, to: 2, cycleNumber: 6, slotId: "S" });
  });
});

describe("difference runs", () => {
  it("marks the days two timelines of a well disagree on the phase", () => {
    const issued = [cell("produce"), cell("produce"), cell("steam"), cell("steam"), cell("produce")];
    const proposal = [cell("produce"), cell("steam"), cell("steam"), cell("produce"), cell("produce")];
    expect(differenceRuns(issued, proposal)).toEqual([
      { from: 1, to: 1 },
      { from: 3, to: 3 },
    ]);
  });

  it("finds nothing when the timelines agree", () => {
    const days = [cell("produce"), cell("steam")];
    expect(differenceRuns(days, days)).toEqual([]);
  });
});
