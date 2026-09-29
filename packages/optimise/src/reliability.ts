// Failure risk and failure cost.
//
// Rods and pumps wear with the impact loading they take: every day the rods
// float at the bottom of the downstroke they slam when the unit catches up.
// The hazard is Weibull in cumulative impact, with a small base rate for
// failures that have nothing to do with loading. Card-shape drift, how far
// today's downhole card has moved from the well's own baseline, scales that
// hazard up in the days before a failure.
//
// None of these coefficients is fitted to OIL failure records. The simulator
// uses them to create the synthetic history, and the estimator uses the same
// ones, so the screen shows an estimated risk window under stated assumptions,
// not a calibrated warning horizon.

export interface ReliabilityAssumptions {
  weibullShape: number;
  /** Cumulative impact at which the loading hazard reaches one expected failure. */
  weibullScale_impact: number;
  baseFailuresPerYear: number;
  /** Float ratio above which a day adds impact loading. */
  impactFromRatio: number;
  /** Drift below this is normal scatter. */
  driftThreshold: number;
  /** Hazard multiplier per unit of drift above the threshold, as an exponent. */
  driftGain: number;
  /** Hazard multiplier per unit of daily drift slope, as an exponent. */
  slopeGain: number;
  workover_inr_lakh: number;
  oilPrice_inr_per_bbl: number;
  failureDowntime_d: number;
}

export const DEFAULT_RELIABILITY: ReliabilityAssumptions = {
  weibullShape: 1.6,
  weibullScale_impact: 8,
  baseFailuresPerYear: 0.15,
  impactFromRatio: 0.95,
  driftThreshold: 0.12,
  driftGain: 18,
  slopeGain: 90,
  workover_inr_lakh: 14,
  oilPrice_inr_per_bbl: 6000,
  failureDowntime_d: 4,
};

/** Impact loading one day adds, from the day's rod-float ratio. */
export function dailyImpact(floatRatio: number, a: ReliabilityAssumptions = DEFAULT_RELIABILITY): number {
  return Math.max(0, floatRatio - a.impactFromRatio) * 2;
}

export function cumulativeHazard(impact: number, a: ReliabilityAssumptions, shape = a.weibullShape): number {
  return Math.pow(Math.max(0, impact) / a.weibullScale_impact, shape);
}

export function driftMultiplier(drift: number, slope_per_d: number, a: ReliabilityAssumptions, gainScale = 1): number {
  return Math.exp(gainScale * (a.driftGain * Math.max(0, drift - a.driftThreshold) + a.slopeGain * Math.max(0, slope_per_d)));
}

/** Probability of at least one failure over `days`, given the hazard added by loading over that span. */
export function failureProbability(
  impactNow: number,
  impactAdded: number,
  days: number,
  drift: number,
  slope_per_d: number,
  a: ReliabilityAssumptions,
  shape = a.weibullShape,
  gainScale = 1,
): number {
  const loading = cumulativeHazard(impactNow + impactAdded, a, shape) - cumulativeHazard(impactNow, a, shape);
  const base = (a.baseFailuresPerYear * days) / 365;
  return 1 - Math.exp(-(loading + base) * driftMultiplier(drift, slope_per_d, a, gainScale));
}

export interface RiskWindow {
  /** Central estimate of failure probability over the horizon. */
  central: number;
  low: number;
  high: number;
  horizon_d: number;
  drift: number;
  slope_per_d: number;
  /** What drives the estimate most: loading ahead, drift, or neither. */
  driver: "loading" | "drift" | "base";
}

/** Least-squares slope of the last `n` values, per day. */
export function recentSlope(values: readonly number[], n = 7): number {
  const ys = values.slice(-n);
  const m = ys.length;
  if (m < 2) return 0;
  const xMean = (m - 1) / 2;
  const yMean = ys.reduce((s, y) => s + y, 0) / m;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xMean) * (y - yMean);
    den += (i - xMean) ** 2;
  });
  return num / den;
}

/**
 * Estimated failure risk over the next `horizon_d` days, with a window from
 * varying the hazard shape and the drift gains, which are the least certain
 * assumptions. The width of the window is the honest part of the number.
 */
export function riskWindow(
  drift: readonly number[],
  impactNow: number,
  impactAhead: number,
  a: ReliabilityAssumptions = DEFAULT_RELIABILITY,
  horizon_d = 7,
): RiskWindow {
  const recent = drift.slice(-3);
  const d = recent.reduce((s, v) => s + v, 0) / Math.max(1, recent.length);
  const slope = recentSlope(drift);
  const central = failureProbability(impactNow, impactAhead, horizon_d, d, slope, a);
  const low = failureProbability(impactNow, impactAhead, horizon_d, d, slope, a, a.weibullShape + 0.3, 0.6);
  const high = failureProbability(impactNow, impactAhead, horizon_d, d, slope, a, a.weibullShape - 0.3, 1.4);
  const loading = cumulativeHazard(impactNow + impactAhead, a) - cumulativeHazard(impactNow, a);
  const base = (a.baseFailuresPerYear * horizon_d) / 365;
  const mult = driftMultiplier(d, slope, a);
  const driver = mult > 1.6 ? "drift" : loading > base ? "loading" : "base";
  return { central, low: Math.min(low, central), high: Math.max(high, central), horizon_d, drift: d, slope_per_d: slope, driver };
}

export interface CostComparison {
  /** Expected cost of a failure over the horizon: probability times workover and lost oil. */
  expectedFailure_inr_lakh: number;
  /** Oil given up over the horizon by running the twin's gentler setting, priced. */
  slowing_inr_lakh: number;
  lostOilIfFails_bbl: number;
}

export function costComparison(
  risk: RiskWindow,
  oilRate_bbl_per_d: number,
  slowingLoss_bbl: number,
  a: ReliabilityAssumptions = DEFAULT_RELIABILITY,
): CostComparison {
  const lostOil = oilRate_bbl_per_d * a.failureDowntime_d;
  const failureCost = a.workover_inr_lakh + (lostOil * a.oilPrice_inr_per_bbl) / 1e5;
  return {
    expectedFailure_inr_lakh: risk.central * failureCost,
    slowing_inr_lakh: (slowingLoss_bbl * a.oilPrice_inr_per_bbl) / 1e5,
    lostOilIfFails_bbl: lostOil,
  };
}
