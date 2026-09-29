import {
  operatingPlan,
  slotSteam_t,
  type CycleInstance,
  type FieldModel,
  type OperatingPlan,
  type PumpSetting,
  type ResteamPoint,
  type SteamSlot,
} from "@bgw/optimise";
import { steamTonnesToCweBbl } from "@bgw/physics";

// Everything the cycle plan and pump twin show for one well, on calendar days:
// the cycle now running from the end of its soak, through today, down to the
// next steam slot in the proposal, then that steam, its soak and the first
// days of the next cycle.

export type CyclePart = "tail" | "steam" | "soak" | "next";

export interface CycleDay {
  d: number;
  part: CyclePart;
  temperature_C: number | null;
  wellhead_C: number | null;
  viscosity_cP: number | null;
  tubingViscosity_cP: number | null;
  oil_bbl_per_d: number;
  liquid_bbl_per_d: number;
  twin: PumpSetting | null;
  practice: PumpSetting | null;
}

export interface CycleView {
  wellId: string;
  anchor: CycleInstance;
  next: CycleInstance | null;
  /** First day shown: the current cycle's first production day, or today if it is still soaking. */
  start_d: number;
  anchorSoakEnd_d: number;
  nextSoakEnd_d: number | null;
  /** The current cycle's pump schedule from its first production day. */
  tailPlan: OperatingPlan;
  /** Where the plan in force had the next slot, if the proposal moved it. */
  plannedStart_d: number | null;
  currentResteam: ResteamPoint;
  nextResteam: ResteamPoint | null;
  days: CycleDay[];
  end_d: number;
  nextPlan: OperatingPlan | null;
  nextCycleOil_bbl: number;
  nextCycleSteam_t: number;
  nextCycleSor: number | null;
  /** First day at or after today where current practice would float the rods. */
  practiceFloatFrom_d: number | null;
}

function spec(c: CycleInstance) {
  return {
    cycleNumber: c.cycleNumber,
    steam_t: slotSteam_t(c),
    injectionTemperature_C: c.injectionTemperature_C,
    soak_d: c.soak_d,
  };
}

export function buildCycleView(
  field: FieldModel,
  wellId: string,
  proposal: readonly SteamSlot[],
  issued: readonly SteamSlot[],
): CycleView {
  const model = field.model(wellId);
  const css = model.well.css!;
  const [anchor, next] = field.cyclesFor(wellId, proposal);
  const planned = issued.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d)[0];
  const anchorSoakEnd = anchor!.start_d + anchor!.injection_d + anchor!.soak_d;
  const currentResteam = field.resteamOf(wellId, anchor!);
  const nextResteam = next ? field.resteamOf(wellId, next) : null;

  const tailEnd = next ? next.start_d : Math.max(field.horizon_d, currentResteam.day_d + 10);
  const tailPlan = operatingPlan(model.fluid, css, spec(anchor!), Math.max(1, tailEnd - anchorSoakEnd));
  const nextPlan = next && nextResteam ? operatingPlan(model.fluid, css, spec(next), nextResteam.productionLeg_d) : null;
  const nextSoakEnd = next ? next.start_d + next.injection_d + next.soak_d : Infinity;
  const end_d = next ? nextSoakEnd + 12 : tailEnd;
  const start_d = Math.min(0, anchorSoakEnd);

  const days: CycleDay[] = [];
  let floatFrom: number | null = null;
  for (let d = start_d; d <= end_d; d++) {
    if (!next || d < next.start_d) {
      const op = tailPlan.days[d - anchorSoakEnd];
      if (!op) {
        days.push({ d, part: "soak", temperature_C: null, wellhead_C: null, viscosity_cP: null, tubingViscosity_cP: null, oil_bbl_per_d: 0, liquid_bbl_per_d: 0, twin: null, practice: null });
        continue;
      }
      if (floatFrom === null && d >= 0 && op.practice.floatRatio >= 1) floatFrom = d;
      days.push({
        d,
        part: "tail",
        temperature_C: op.temperature_C,
        wellhead_C: op.wellheadTemperature_C,
        viscosity_cP: op.viscosity_cP,
        tubingViscosity_cP: op.tubingViscosity_cP,
        oil_bbl_per_d: op.oil_bbl_per_d,
        liquid_bbl_per_d: op.liquid_bbl_per_d,
        twin: op.twin,
        practice: op.practice,
      });
    } else if (d < next.start_d + next.injection_d) {
      days.push({ d, part: "steam", temperature_C: null, wellhead_C: null, viscosity_cP: null, tubingViscosity_cP: null, oil_bbl_per_d: 0, liquid_bbl_per_d: 0, twin: null, practice: null });
    } else if (d < nextSoakEnd) {
      days.push({ d, part: "soak", temperature_C: null, wellhead_C: null, viscosity_cP: null, tubingViscosity_cP: null, oil_bbl_per_d: 0, liquid_bbl_per_d: 0, twin: null, practice: null });
    } else {
      const op = nextPlan!.days[d - nextSoakEnd];
      if (!op) break;
      days.push({
        d,
        part: "next",
        temperature_C: op.temperature_C,
        wellhead_C: op.wellheadTemperature_C,
        viscosity_cP: op.viscosity_cP,
        tubingViscosity_cP: op.tubingViscosity_cP,
        oil_bbl_per_d: op.oil_bbl_per_d,
        liquid_bbl_per_d: op.liquid_bbl_per_d,
        twin: op.twin,
        practice: op.practice,
      });
    }
  }

  const nextOil = nextPlan ? nextPlan.days.reduce((s, x) => s + x.oil_bbl_per_d, 0) : 0;
  const nextSteam = next ? slotSteam_t(next) : 0;
  return {
    wellId,
    anchor: anchor!,
    next: next ?? null,
    start_d,
    anchorSoakEnd_d: anchorSoakEnd,
    nextSoakEnd_d: next ? nextSoakEnd : null,
    tailPlan,
    plannedStart_d: planned && next && planned.start_d !== next.start_d ? planned.start_d : null,
    currentResteam,
    nextResteam,
    days,
    end_d,
    nextPlan,
    nextCycleOil_bbl: nextOil,
    nextCycleSteam_t: nextSteam,
    nextCycleSor: nextOil > 0 ? steamTonnesToCweBbl(nextSteam) / nextOil : null,
    practiceFloatFrom_d: floatFrom,
  };
}
