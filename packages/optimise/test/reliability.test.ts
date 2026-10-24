import { describe, expect, it } from "vitest";
import {
  costComparison,
  cumulativeHazard,
  dailyImpact,
  DEFAULT_RELIABILITY as A,
  driftMultiplier,
  failureProbability,
  recentSlope,
  riskWindow,
} from "../src";

describe("impact loading", () => {
  it("adds nothing while the rods keep up with the polished rod", () => {
    expect(dailyImpact(0.5)).toBe(0);
    expect(dailyImpact(A.impactFromRatio)).toBe(0);
  });

  it("grows linearly with the float ratio above the threshold", () => {
    expect(dailyImpact(A.impactFromRatio + 0.5)).toBeCloseTo(1, 12);
    expect(dailyImpact(A.impactFromRatio + 1)).toBeCloseTo(2, 12);
  });

  it("reaches one expected failure at the Weibull scale", () => {
    expect(cumulativeHazard(A.weibullScale_impact, A)).toBeCloseTo(1, 12);
    expect(cumulativeHazard(-3, A)).toBe(0);
  });
});

describe("drift", () => {
  it("leaves the hazard alone inside normal scatter", () => {
    expect(driftMultiplier(A.driftThreshold, 0, A)).toBe(1);
    expect(driftMultiplier(0, -0.01, A)).toBe(1);
  });

  it("scales the hazard up exponentially above the threshold", () => {
    expect(driftMultiplier(A.driftThreshold + 0.1, 0, A)).toBeCloseTo(Math.exp(A.driftGain * 0.1), 9);
  });

  it("fits a least-squares slope over the last values", () => {
    expect(recentSlope([0, 0, 0, 1, 2, 3, 4, 5, 6, 7], 7)).toBeCloseTo(1, 12);
    expect(recentSlope([4])).toBe(0);
  });
});

describe("failure probability", () => {
  it("is the base rate alone with no loading and no drift", () => {
    const p = failureProbability(0, 0, 365, 0, 0, A);
    expect(p).toBeCloseTo(1 - Math.exp(-A.baseFailuresPerYear), 12);
  });

  it("rises with the loading added over the window", () => {
    const calm = failureProbability(2, 0, 7, 0, 0, A);
    const pounding = failureProbability(2, 4, 7, 0, 0, A);
    expect(pounding).toBeGreaterThan(calm);
    expect(pounding).toBeLessThan(1);
  });
});

describe("risk window", () => {
  it("brackets the central estimate", () => {
    const r = riskWindow([0.1, 0.12, 0.2, 0.25, 0.3], 3, 2, A, 7);
    expect(r.low).toBeLessThanOrEqual(r.central);
    expect(r.high).toBeGreaterThanOrEqual(r.central);
    expect(r.horizon_d).toBe(7);
  });

  it("names drift as the driver when the card has moved far from baseline", () => {
    expect(riskWindow([0.3, 0.32, 0.35], 0, 0, A).driver).toBe("drift");
  });

  it("names loading when the rods will float and the card is steady", () => {
    expect(riskWindow([0.05, 0.05, 0.05], 2, 3, A).driver).toBe("loading");
  });

  it("falls back to the base rate when nothing else is going on", () => {
    expect(riskWindow([0.05, 0.05, 0.05], 0, 0, A).driver).toBe("base");
  });
});

describe("cost comparison", () => {
  it("prices a failure as the workover plus the oil lost while the well is down", () => {
    const risk = riskWindow([0.05], 0, 0, A);
    const c = costComparison({ ...risk, central: 0.5 }, 10, 3, A);
    expect(c.lostOilIfFails_bbl).toBe(10 * A.failureDowntime_d);
    const failure = A.workover_inr_lakh + (10 * A.failureDowntime_d * A.oilPrice_inr_per_bbl) / 1e5;
    expect(c.expectedFailure_inr_lakh).toBeCloseTo(0.5 * failure, 12);
    expect(c.slowing_inr_lakh).toBeCloseTo((3 * A.oilPrice_inr_per_bbl) / 1e5, 12);
  });
});
