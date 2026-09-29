import type { CycleInstance, FieldModel } from "./field-model";
import { designLeg_d } from "./resteam";
import { totalCapacity_t_per_h, type Capacity, type SteamSlot } from "./types";

// The current practice the twin is compared against. Each well gets a fixed
// production leg worked out from its design cycle, and slots are booked first
// come, first served: a slot that would overload the generators waits a day at
// a time until it fits. The rule never looks at the steam a cycle actually got.

function designCycle(field: FieldModel, wellId: string, cycleNumber: number, start_d: number): CycleInstance {
  const design = field.model(wellId).well.css!.design;
  return {
    slotId: null,
    cycleNumber,
    start_d,
    injection_d: design.injection_d,
    soak_d: design.soak_d,
    rate_t_per_h: design.injectionRate_t_per_h,
    injectionTemperature_C: design.injectionTemperature_C,
  };
}

/** Production leg the current practice gives a well's cycle, from its design steam. */
export function practiceLeg_d(field: FieldModel, wellId: string, cycleNumber: number): number {
  return designLeg_d(
    field.model(wellId),
    cycleNumber,
    field.assumptions.steamCost_bbl_per_t,
    field.assumptions.minProductionLeg_d,
  );
}

export function issuePlanByPractice(field: FieldModel, capacity: Capacity): SteamSlot[] {
  const H = field.horizon_d;
  const cap = totalCapacity_t_per_h(capacity);
  const load = new Float64Array(H);
  const cssWells = field.producing.filter((w) => w.status === "css");

  interface Pending {
    wellId: string;
    cycleNumber: number;
    desired_d: number;
    earliest_d: number;
  }
  const queue: Pending[] = [];

  for (const well of cssWells) {
    const anchor = field.anchorCycle(well.id);
    for (let d = Math.max(0, anchor.steamStart_d); d < Math.min(H, anchor.steamStart_d + anchor.injection_d); d++) {
      load[d]! += anchor.rate_t_per_h;
    }
    const soakEnd = anchor.steamStart_d + anchor.injection_d + anchor.soak_d;
    queue.push({
      wellId: well.id,
      cycleNumber: anchor.cycleNumber + 1,
      desired_d: soakEnd + practiceLeg_d(field, well.id, anchor.cycleNumber),
      earliest_d: soakEnd + field.assumptions.minProductionLeg_d,
    });
  }

  const slots: SteamSlot[] = [];
  while (queue.length > 0) {
    queue.sort((a, b) => a.desired_d - b.desired_d || a.wellId.localeCompare(b.wellId));
    const next = queue.shift()!;
    const cycle = designCycle(field, next.wellId, next.cycleNumber, 0);
    let start = Math.max(1, next.desired_d, next.earliest_d);
    const fits = (s: number) => {
      for (let d = s; d < Math.min(H, s + cycle.injection_d); d++) {
        if (load[d]! + cycle.rate_t_per_h > cap + 1e-9) return false;
      }
      return true;
    };
    while (start < H && !fits(start)) start++;
    if (start >= H) continue;
    for (let d = start; d < Math.min(H, start + cycle.injection_d); d++) load[d]! += cycle.rate_t_per_h;
    slots.push({
      id: `${next.wellId}#${next.cycleNumber}`,
      wellId: next.wellId,
      cycleNumber: next.cycleNumber,
      start_d: start,
      injection_d: cycle.injection_d,
      soak_d: cycle.soak_d,
      rate_t_per_h: cycle.rate_t_per_h,
      injectionTemperature_C: cycle.injectionTemperature_C,
    });
    const soakEnd = start + cycle.injection_d + cycle.soak_d;
    queue.push({
      wellId: next.wellId,
      cycleNumber: next.cycleNumber + 1,
      desired_d: soakEnd + practiceLeg_d(field, next.wellId, next.cycleNumber),
      earliest_d: soakEnd + field.assumptions.minProductionLeg_d,
    });
  }
  return slots.sort((a, b) => a.start_d - b.start_d || a.wellId.localeCompare(b.wellId));
}
