import { describe, expect, it } from "vitest";
import { freshCycleNetAverage, MAX_RESTEAM_SEARCH_D, resteamPoint, type CycleCurve, type NextCycle } from "../src";

/** A cycle whose oil rate falls linearly from `peak` by `drop` a day, floored at zero. */
function linearCurve(peak: number, drop: number): CycleCurve {
  const oil = (t: number) => Math.max(0, peak - drop * t);
  return {
    oil,
    state: () => {
      throw new Error("not used");
    },
    cumulativeOil: (t: number) => {
      let s = 0;
      for (let d = 0; d <= t; d++) s += oil(d);
      return s;
    },
  };
}

const flat = (rate: number): CycleCurve => linearCurve(rate, 0);

describe("fresh cycle net average", () => {
  it("is the cycle's average over its shut-in and production days when steam is free", () => {
    const next: NextCycle = { curve: flat(30), injection_d: 5, soak_d: 5, steam_t: 1000 };
    // A flat curve averages best on the longest leg, where the 10 shut-in days weigh least.
    const expected = (30 * MAX_RESTEAM_SEARCH_D) / (10 + MAX_RESTEAM_SEARCH_D);
    expect(freshCycleNetAverage(next, 0, 20)).toBeCloseTo(expected, 9);
  });

  it("drops as steam gets dearer", () => {
    const next: NextCycle = { curve: linearCurve(60, 0.3), injection_d: 6, soak_d: 6, steam_t: 2000 };
    const cheap = freshCycleNetAverage(next, 0.05, 20);
    const dear = freshCycleNetAverage(next, 0.2, 20);
    expect(dear).toBeLessThan(cheap);
  });
});

describe("re-steam point", () => {
  const timing = { start_d: 100, injection_d: 6, soak_d: 6 };
  const next: NextCycle = { curve: linearCurve(60, 0.3), injection_d: 6, soak_d: 6, steam_t: 2000 };

  it("steams on the first day the tail falls below the fresh cycle's bar", () => {
    const current = linearCurve(50, 0.4);
    const p = resteamPoint(current, timing, next, 0.1, 20);
    expect(current.oil(p.productionLeg_d)).toBeLessThan(p.freshCycleNetAverage_bbl_per_d);
    expect(current.oil(p.productionLeg_d - 1)).toBeGreaterThanOrEqual(p.freshCycleNetAverage_bbl_per_d);
    expect(p.day_d).toBe(timing.start_d + timing.injection_d + timing.soak_d + p.productionLeg_d);
    expect(p.oilRate_bbl_per_d).toBe(current.oil(p.productionLeg_d));
  });

  it("never steams before the minimum production leg", () => {
    const exhausted = flat(0);
    const p = resteamPoint(exhausted, timing, next, 0.1, 45);
    expect(p.productionLeg_d).toBe(45);
  });

  it("stops at the search limit when re-steaming never pays", () => {
    const strong = flat(500);
    const p = resteamPoint(strong, timing, next, 0.1, 20);
    expect(p.productionLeg_d).toBe(MAX_RESTEAM_SEARCH_D);
  });

  it("waits longer when steam costs more", () => {
    const current = linearCurve(50, 0.2);
    const cheap = resteamPoint(current, timing, next, 0.02, 20);
    const dear = resteamPoint(current, timing, next, 0.4, 20);
    expect(dear.productionLeg_d).toBeGreaterThan(cheap.productionLeg_d);
  });
});
