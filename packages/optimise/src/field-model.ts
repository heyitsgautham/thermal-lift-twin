import { steamTonnesToCweBbl, type WellDayState } from "@bgw/physics";
import { resteamPoint, type ResteamPoint } from "./resteam";
import {
  slotSteam_t,
  totalCapacity_t_per_h,
  type Capacity,
  type CycleRecord,
  type FieldDataset,
  type SteamSlot,
  type WellRecord,
} from "./types";
import { buildWellModels, type WellModel } from "./well-model";

export type Plan = readonly SteamSlot[];
export type Phase = "steam" | "soak" | "produce" | "down";

export interface DayCell {
  phase: Phase;
  oil_bbl_per_d: number;
  cycleNumber: number | null;
  /** The planned slot this day belongs to, null for the cycle already under way. */
  slotId: string | null;
}

export interface WellTimeline {
  wellId: string;
  kind: "css" | "cold";
  days: DayCell[];
  oil90_bbl: number;
  steam90_t: number;
  oilToday_bbl_per_d: number;
  cycleToday: number | null;
  /** Re-steam point of the cycle running on day 0, if it falls in the window. */
  resteam: ResteamPoint | null;
  /** First planned steam slot for this well, if any. */
  nextSlotId: string | null;
  /** What the well's last cycle carries past the window, net of time. See `FieldModel.carriedValue`. */
  carried_bbl: number;
}

export interface LoadSegment {
  wellId: string;
  slotId: string | null;
  rate_t_per_h: number;
}

export interface DayLoad {
  total_t_per_h: number;
  segments: LoadSegment[];
}

export interface PlanTotals {
  fieldOil90_bbl: number;
  cssOil90_bbl: number;
  steam90_t: number;
  /** Steam-oil ratio for CSS wells over the window, CWE bbl per bbl. Null if no CSS oil. */
  sor90: number | null;
  peakLoad_t_per_h: number;
  peakDay_d: number;
  /** Sum of what the CSS wells' last cycles carry past the window. */
  carried_bbl: number;
  /**
   * What the scheduler maximises: 90-day oil, less the committed steam priced in
   * oil, plus what each cycle carries past day 90. The carried term stops the
   * optimiser from pulling cycles earlier just to get their oil inside the window.
   */
  value_bbl: number;
}

export interface PlanEvaluation {
  timelines: WellTimeline[];
  load: DayLoad[];
  capacity_t_per_h: number;
  overloadDays: number[];
  totals: PlanTotals;
}

export interface CycleInstance {
  slotId: string | null;
  cycleNumber: number;
  start_d: number;
  injection_d: number;
  soak_d: number;
  rate_t_per_h: number;
  injectionTemperature_C: number;
}

const EPS = 1e-9;

export class FieldModel {
  readonly horizon_d: number;
  readonly wells: WellRecord[];
  readonly producing: WellRecord[];
  readonly cssWells: WellRecord[];
  private readonly models: Map<string, WellModel>;
  /** Latest recorded cycle that started on or before day 0, per CSS well. */
  private readonly anchors = new Map<string, CycleRecord>();
  private readonly downtimeDays = new Map<string, Map<number, string>>();
  private readonly resteamCache = new Map<string, ResteamPoint>();
  private coldCache: WellTimeline[] | null = null;

  constructor(readonly dataset: FieldDataset) {
    this.horizon_d = dataset.meta.horizon_d;
    this.wells = dataset.wells;
    this.producing = dataset.wells.filter((w) => w.status === "css" || w.status === "cold");
    this.cssWells = this.producing.filter((w) => w.status === "css");
    this.models = buildWellModels(dataset.wells, dataset.assumptions);
    for (const cycle of dataset.cycles) {
      if (cycle.steamStart_d > 0) continue;
      const prev = this.anchors.get(cycle.wellId);
      if (!prev || cycle.steamStart_d > prev.steamStart_d) this.anchors.set(cycle.wellId, cycle);
    }
    for (const event of dataset.downtime) {
      let days = this.downtimeDays.get(event.wellId);
      if (!days) {
        days = new Map();
        this.downtimeDays.set(event.wellId, days);
      }
      for (let d = event.start_d; d < event.start_d + event.duration_d; d++) days.set(d, event.reason);
    }
  }

  get assumptions() {
    return this.dataset.assumptions;
  }

  model(wellId: string): WellModel {
    const m = this.models.get(wellId);
    if (!m) throw new Error(`No model for ${wellId}`);
    return m;
  }

  anchorCycle(wellId: string): CycleRecord {
    const a = this.anchors.get(wellId);
    if (!a) throw new Error(`No current cycle for ${wellId}`);
    return a;
  }

  private anchorInstance(wellId: string): CycleInstance {
    const anchor = this.anchorCycle(wellId);
    return {
      slotId: null,
      cycleNumber: anchor.cycleNumber,
      start_d: anchor.steamStart_d,
      injection_d: anchor.injection_d,
      soak_d: anchor.soak_d,
      rate_t_per_h: anchor.rate_t_per_h,
      injectionTemperature_C: anchor.injectionTemperature_C,
    };
  }

  /** The anchor cycle followed by the well's planned slots, in time order. */
  cyclesFor(wellId: string, plan: Plan): CycleInstance[] {
    const slots = plan.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d);
    return [this.anchorInstance(wellId), ...slots.map((s) => ({ ...s, slotId: s.id }))];
  }

  curveFor(wellId: string, c: CycleInstance) {
    return this.model(wellId).cycleCurve({
      cycleNumber: c.cycleNumber,
      steam_t: slotSteam_t(c),
      injectionTemperature_C: c.injectionTemperature_C,
      soak_d: c.soak_d,
    });
  }

  /** Re-steam point for any cycle of a CSS well, recorded or planned. */
  resteamOf(wellId: string, cycle: CycleInstance): ResteamPoint {
    const key = [
      wellId,
      cycle.cycleNumber,
      cycle.start_d,
      cycle.injection_d,
      cycle.soak_d,
      cycle.rate_t_per_h,
      cycle.injectionTemperature_C,
    ].join("|");
    const hit = this.resteamCache.get(key);
    if (hit) return hit;
    const design = this.model(wellId).well.css!.design;
    const next: CycleInstance = {
      slotId: null,
      cycleNumber: cycle.cycleNumber + 1,
      start_d: 0,
      injection_d: design.injection_d,
      soak_d: design.soak_d,
      rate_t_per_h: design.injectionRate_t_per_h,
      injectionTemperature_C: design.injectionTemperature_C,
    };
    const point = resteamPoint(
      this.curveFor(wellId, cycle),
      { start_d: cycle.start_d, injection_d: cycle.injection_d, soak_d: cycle.soak_d },
      {
        curve: this.curveFor(wellId, next),
        injection_d: next.injection_d,
        soak_d: next.soak_d,
        steam_t: slotSteam_t(next),
      },
      this.assumptions.steamCost_bbl_per_t,
      this.assumptions.minProductionLeg_d,
    );
    this.resteamCache.set(key, point);
    return point;
  }

  /** Re-steam point for the cycle that is running on day 0. */
  currentResteam(wellId: string): ResteamPoint {
    return this.resteamOf(wellId, this.anchorInstance(wellId));
  }

  /**
   * Opportunity rate of a well's time: the net average a fresh cycle would make.
   * Held fixed per well, so every plan is charged for time at the same rate.
   */
  opportunityRate(wellId: string): number {
    return this.currentResteam(wellId).freshCycleNetAverage_bbl_per_d;
  }

  /**
   * What the well's last cycle carries past the window. The cycle is run on to
   * its re-steam day, its oil after day 90 is counted, and the days it takes are
   * charged at the well's opportunity rate. A cycle already past its re-steam
   * day carries nothing forward, and the tail days it spent inside the window
   * already cost it. This makes the value neutral to a cycle starting on its
   * re-steam day and penalises starting it early or late.
   */
  carriedValue(wellId: string, cycle: CycleInstance): number {
    const point = this.resteamOf(wellId, cycle);
    const shutIn = cycle.injection_d + cycle.soak_d;
    const end_d = Math.max(this.horizon_d, cycle.start_d + shutIn + point.productionLeg_d);
    const curve = this.curveFor(wellId, cycle);
    let oil = 0;
    for (let d = this.horizon_d; d < end_d; d++) {
      const t = d - cycle.start_d - shutIn;
      if (t >= 0) oil += curve.oil(t);
    }
    return oil - this.opportunityRate(wellId) * (end_d - this.horizon_d);
  }

  /** Tonnes committed by the plan: every slot that starts inside the window, in full. */
  committedSteam_t(plan: Plan): number {
    return plan.filter((s) => s.start_d < this.horizon_d).reduce((sum, s) => sum + slotSteam_t(s), 0);
  }

  /**
   * The coupled well state on day `d` under a plan, or null when the pump is
   * off (injection, soak or downtime). Cold wells use their decline curve.
   */
  dayState(wellId: string, plan: Plan, d: number): { state: WellDayState; cycle: CycleInstance | null; t: number } | null {
    const well = this.model(wellId).well;
    if (this.downtimeDays.get(wellId)?.has(d)) return null;
    if (well.status === "cold") return { state: this.model(wellId).coldState(d), cycle: null, t: d };
    const cycles = this.cyclesFor(wellId, plan);
    let c = cycles[0]!;
    for (const candidate of cycles) if (candidate.start_d <= d) c = candidate;
    const t = d - c.start_d - c.injection_d - c.soak_d;
    if (t < 0) return null;
    return { state: this.curveFor(wellId, c).state(t), cycle: c, t };
  }

  private cssTimeline(well: WellRecord, plan: Plan): WellTimeline {
    const cycles = this.cyclesFor(well.id, plan);
    const down = this.downtimeDays.get(well.id);
    const days: DayCell[] = [];
    let steam90_t = 0;
    for (let d = 0; d < this.horizon_d; d++) {
      let c = cycles[0]!;
      for (const candidate of cycles) if (candidate.start_d <= d) c = candidate;
      const rel = d - c.start_d;
      if (rel < c.injection_d) {
        days.push({ phase: "steam", oil_bbl_per_d: 0, cycleNumber: c.cycleNumber, slotId: c.slotId });
        steam90_t += c.rate_t_per_h * 24;
      } else if (rel < c.injection_d + c.soak_d) {
        days.push({ phase: "soak", oil_bbl_per_d: 0, cycleNumber: c.cycleNumber, slotId: c.slotId });
      } else if (down?.has(d)) {
        days.push({ phase: "down", oil_bbl_per_d: 0, cycleNumber: c.cycleNumber, slotId: c.slotId });
      } else {
        const t = rel - c.injection_d - c.soak_d;
        days.push({
          phase: "produce",
          oil_bbl_per_d: this.curveFor(well.id, c).oil(t),
          cycleNumber: c.cycleNumber,
          slotId: c.slotId,
        });
      }
    }
    const last = cycles.filter((c) => c.start_d < this.horizon_d).at(-1)!;
    const resteam = this.currentResteam(well.id);
    return {
      wellId: well.id,
      kind: "css",
      days,
      oil90_bbl: days.reduce((sum, c) => sum + c.oil_bbl_per_d, 0),
      steam90_t,
      oilToday_bbl_per_d: days[0]!.oil_bbl_per_d,
      cycleToday: days[0]!.cycleNumber,
      resteam: resteam.day_d >= 0 && resteam.day_d < this.horizon_d ? resteam : null,
      nextSlotId: cycles[1]?.slotId ?? null,
      carried_bbl: this.carriedValue(well.id, last),
    };
  }

  private coldTimeline(well: WellRecord): WellTimeline {
    const down = this.downtimeDays.get(well.id);
    const model = this.model(well.id);
    const days: DayCell[] = [];
    for (let d = 0; d < this.horizon_d; d++) {
      if (down?.has(d)) days.push({ phase: "down", oil_bbl_per_d: 0, cycleNumber: null, slotId: null });
      else
        days.push({
          phase: "produce",
          oil_bbl_per_d: model.coldState(d).oil_bbl_per_d,
          cycleNumber: null,
          slotId: null,
        });
    }
    return {
      wellId: well.id,
      kind: "cold",
      days,
      oil90_bbl: days.reduce((sum, c) => sum + c.oil_bbl_per_d, 0),
      steam90_t: 0,
      oilToday_bbl_per_d: days[0]!.oil_bbl_per_d,
      cycleToday: null,
      resteam: null,
      nextSlotId: null,
      carried_bbl: 0,
    };
  }

  evaluate(plan: Plan, capacity: Capacity): PlanEvaluation {
    if (!this.coldCache) {
      this.coldCache = this.producing.filter((w) => w.status === "cold").map((w) => this.coldTimeline(w));
    }
    const cssTimelines = this.cssWells.map((w) => this.cssTimeline(w, plan));
    const timelines = [...cssTimelines, ...this.coldCache];

    const load: DayLoad[] = Array.from({ length: this.horizon_d }, () => ({ total_t_per_h: 0, segments: [] }));
    const instances = this.cssWells
      .flatMap((w) => this.cyclesFor(w.id, plan).map((c) => ({ wellId: w.id, c })))
      .sort((a, b) => a.c.start_d - b.c.start_d || a.wellId.localeCompare(b.wellId));
    for (const { wellId, c } of instances) {
      const from = Math.max(0, c.start_d);
      const to = Math.min(this.horizon_d, c.start_d + c.injection_d);
      for (let d = from; d < to; d++) {
        const day = load[d]!;
        day.total_t_per_h += c.rate_t_per_h;
        day.segments.push({ wellId, slotId: c.slotId, rate_t_per_h: c.rate_t_per_h });
      }
    }

    const capacity_t_per_h = totalCapacity_t_per_h(capacity);
    const overloadDays: number[] = [];
    let peakLoad = 0;
    let peakDay = 0;
    load.forEach((day, d) => {
      if (day.total_t_per_h > capacity_t_per_h + EPS) overloadDays.push(d);
      if (day.total_t_per_h > peakLoad + EPS) {
        peakLoad = day.total_t_per_h;
        peakDay = d;
      }
    });

    const cssOil90 = cssTimelines.reduce((s, t) => s + t.oil90_bbl, 0);
    const steam90 = cssTimelines.reduce((s, t) => s + t.steam90_t, 0);
    const fieldOil90 = timelines.reduce((s, t) => s + t.oil90_bbl, 0);
    const carried = cssTimelines.reduce((s, t) => s + t.carried_bbl, 0);
    return {
      timelines,
      load,
      capacity_t_per_h,
      overloadDays,
      totals: {
        fieldOil90_bbl: fieldOil90,
        cssOil90_bbl: cssOil90,
        steam90_t: steam90,
        sor90: cssOil90 > 0 ? steamTonnesToCweBbl(steam90) / cssOil90 : null,
        peakLoad_t_per_h: peakLoad,
        peakDay_d: peakDay,
        carried_bbl: carried,
        value_bbl: fieldOil90 - this.assumptions.steamCost_bbl_per_t * this.committedSteam_t(plan) + carried,
      },
    };
  }

  /** Earliest and latest start day a slot may take, holding every other slot still. */
  slotBounds(plan: Plan, slotId: string): { min_d: number; max_d: number } {
    const slot = plan.find((s) => s.id === slotId);
    if (!slot) throw new Error(`Unknown slot ${slotId}`);
    const cycles = this.cyclesFor(slot.wellId, plan);
    const i = cycles.findIndex((c) => c.slotId === slotId);
    const prev = cycles[i - 1]!;
    const next = cycles[i + 1];
    const minLeg = this.assumptions.minProductionLeg_d;
    const min_d = Math.max(1, prev.start_d + prev.injection_d + prev.soak_d + minLeg);
    const max_d = Math.min(
      this.horizon_d - 1,
      next ? next.start_d - (slot.injection_d + slot.soak_d + minLeg) : this.horizon_d - 1,
    );
    return { min_d, max_d };
  }
}

export function shiftSlot(plan: Plan, slotId: string, delta_d: number): SteamSlot[] {
  return plan.map((s) => (s.id === slotId ? { ...s, start_d: s.start_d + delta_d } : s));
}
