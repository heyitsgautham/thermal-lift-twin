import {
  FieldModel,
  fieldStory,
  fieldYear,
  wellStory,
  type FieldStory,
  type PumpSetting,
  type StoryMode,
  type StoryPhase,
  type StoryRun,
  type WellStory,
  type YearSide,
} from "@bgw/optimise";
import { dataset } from "@/lib/dataset";

// Everything the story shows, computed once from the engine. Nothing on the
// story's screens is typed in; it all comes from here.

export interface StoryData {
  asOf: string;
  field: FieldModel;
  well: WellStory;
  fieldStory: FieldStory;
  year: { wells: number; before: YearSide; after: YearSide };
}

let cache: StoryData | null = null;

export function storyData(): StoryData {
  if (!cache) {
    const field = new FieldModel(dataset);
    cache = {
      asOf: dataset.meta.asOf,
      field,
      well: wellStory(field),
      fieldStory: fieldStory(field),
      year: fieldYear(field),
    };
  }
  return cache;
}

export function runOf(mode: StoryMode): StoryRun {
  const { well } = storyData();
  return mode === "twin" ? well.twin : well.today;
}

/** The day the story's playback stops in each mode: steam under way today, the next cycle pumping again with the twin. */
export function stopDay(mode: StoryMode): number {
  const run = runOf(mode);
  return mode === "today" ? run.nextSteam_d + 3 : run.nextSoakEnd_d + 4;
}

export const FIRST_DAY = -75;

export interface DayView {
  d: number;
  phase: StoryPhase | "rest";
  cycleNumber: number;
  temperature_C: number;
  viscosity_cP: number;
  tubingViscosity_cP: number;
  oil_bbl_per_d: number;
  steamed_t: number;
  setting: PumpSetting | null;
  floats: boolean;
}

/** The well on a fractional day of a run, with smooth values between whole days. */
export function dayView(run: StoryRun, day: number): DayView {
  const { well } = storyData();
  const rest: DayView = {
    d: run.days[0]!.d - 1,
    phase: "rest",
    cycleNumber: well.cycleNumber,
    temperature_C: well.rest.temperature_C,
    viscosity_cP: well.rest.viscosity_cP,
    tubingViscosity_cP: well.rest.tubingViscosity_cP,
    oil_bbl_per_d: 0,
    steamed_t: 0,
    setting: null,
    floats: false,
  };
  const at = (d: number): DayView => {
    const i = d - run.days[0]!.d;
    if (i < 0) return rest;
    return run.days[Math.min(i, run.days.length - 1)]!;
  };
  const base = Math.floor(day);
  const a = at(base);
  const b = at(base + 1);
  const f = day - base;
  const mix = (x: number, y: number) => x + (y - x) * f;
  return {
    ...a,
    temperature_C: mix(a.temperature_C, b.temperature_C),
    viscosity_cP: mix(a.viscosity_cP, b.viscosity_cP),
    tubingViscosity_cP: a.phase === b.phase ? mix(a.tubingViscosity_cP, b.tubingViscosity_cP) : a.tubingViscosity_cP,
    oil_bbl_per_d: a.phase === "produce" && b.phase === "produce" ? mix(a.oil_bbl_per_d, b.oil_bbl_per_d) : a.oil_bbl_per_d,
    steamed_t: a.phase === "steam" && b.phase === "steam" ? mix(a.steamed_t, b.steamed_t) : a.steamed_t,
  };
}

/** Rod-float days a run has passed by `day`. */
export function floatDaysBy(run: StoryRun, day: number): number {
  let n = 0;
  for (const d of run.floatDays) if (d <= day) n++;
  return n;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const k = clamp((x - e0) / (e1 - e0), 0, 1);
  return k * k * (3 - 2 * k);
};
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
export const easeInOut = (x: number) => {
  const k = clamp(x, 0, 1);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
/** Progress 0 to 1 of something that started at `at` and lasts `ms`, on the story clock. */
export const since = (t: number, at: number, ms: number) => clamp((t - at) / ms, 0, 1);
