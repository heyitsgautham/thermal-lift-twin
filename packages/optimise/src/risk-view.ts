import { fluidDensity_kg_per_m3, pumpDisplacement_bbl_per_d } from "@bgw/physics";
import type { FieldModel, Plan } from "./field-model";
import { OPERATING, practiceSetting, twinSetting } from "./operating";
import {
  costComparison,
  dailyImpact,
  riskWindow,
  type CostComparison,
  type ReliabilityAssumptions,
  type RiskWindow,
} from "./reliability";
import type { WellHealth } from "./types";

// Reliability view for the field: per well, the estimated risk window over the
// next week, what drives it, and the cost of a failure next to the cost of
// slowing the well to its gentlest setting for that week.

export type RiskAction = "inspect" | "slow-downstroke" | "monitor";

export interface WellRisk {
  wellId: string;
  status: "css" | "cold";
  risk: RiskWindow;
  impactNow: number;
  impactAhead: number;
  /** Days in the next week the rods would float at constant speed. */
  floatDaysAhead: number;
  oilRate_bbl_per_d: number;
  cost: CostComparison;
  slowingLoss_bbl: number;
  action: RiskAction;
  health: WellHealth;
}

export function fieldRisk(
  field: FieldModel,
  plan: Plan,
  health: readonly WellHealth[],
  a: ReliabilityAssumptions,
  horizon_d = 7,
): WellRisk[] {
  const out: WellRisk[] = [];
  for (const h of health) {
    const model = field.model(h.wellId);
    const well = model.well;
    if (well.status !== "css" && well.status !== "cold") continue;
    const pump = well.css?.pump ?? well.cold!.pump;
    const density = fluidDensity_kg_per_m3(model.fluid);
    const perSpm = pumpDisplacement_bbl_per_d({ ...pump, fillage_frac: OPERATING.fillageTarget_frac }, 1);
    let impactAhead = 0;
    let floatDays = 0;
    let slowingLoss = 0;
    let oilToday = 0;
    for (let d = 0; d < horizon_d; d++) {
      const day = field.dayState(h.wellId, plan, d);
      if (!day) continue;
      const inputs = { liquid: day.state.liquid_bbl_per_d, viscosity: day.state.tubingViscosity_cP, density, perSpm, stroke: pump.stroke_in };
      if (d === 0) oilToday = day.state.oil_bbl_per_d;
      if (well.status === "css") {
        const practice = practiceSetting(inputs);
        impactAhead += dailyImpact(practice.floatRatio, a);
        if (practice.floatRatio > 1) floatDays++;
      }
      // Gentlest setting: slowest stretched stroke, all day. Oil above what it can lift is lost.
      const gentle = twinSetting({ ...inputs, liquid: 0.001 }, null);
      const capacity_bbl = perSpm * gentle.spm / OPERATING.fillageTarget_frac;
      const liftable = Math.min(day.state.liquid_bbl_per_d, capacity_bbl);
      slowingLoss += day.state.oil_bbl_per_d * (1 - liftable / day.state.liquid_bbl_per_d);
    }
    const risk = riskWindow(h.drift60, h.impact, impactAhead, a, horizon_d);
    const action: RiskAction =
      risk.driver === "drift" && risk.high >= 0.15 ? "inspect" : floatDays > 0 ? "slow-downstroke" : "monitor";
    out.push({
      wellId: h.wellId,
      status: well.status,
      risk,
      impactNow: h.impact,
      impactAhead,
      floatDaysAhead: floatDays,
      oilRate_bbl_per_d: oilToday,
      cost: costComparison(risk, oilToday, slowingLoss, a),
      slowingLoss_bbl: slowingLoss,
      action,
      health: h,
    });
  }
  return out.sort((x, y) => y.risk.central - x.risk.central);
}
