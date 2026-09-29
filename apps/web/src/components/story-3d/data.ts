"use client";

import { FieldModel } from "@bgw/optimise";
import { fieldStory, fieldYear, wellStory, type FieldStory, type FieldYear, type ScenarioStory, type StoryDay, type WellStory } from "./engine";
import { dataset } from "@/lib/dataset";
import type { Mode } from "./script";

// Everything the story shows, computed once from the twin on page load.

export const STORY_WELL = "BGW-14";

export interface StoryData {
  asOf: string;
  field: FieldModel;
  well: WellStory;
  fieldBeat: FieldStory;
  year: FieldYear;
}

let cache: StoryData | null = null;

export function storyData(): StoryData {
  if (cache) return cache;
  const field = new FieldModel(dataset);
  const capacity = {
    units: dataset.assumptions.generatorUnits,
    unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
  };
  cache = {
    asOf: dataset.meta.asOf,
    field,
    well: wellStory(field, STORY_WELL, dataset.issuedPlan),
    fieldBeat: fieldStory(field, STORY_WELL, dataset.issuedPlan, capacity),
    year: fieldYear(field),
  };
  return cache;
}

export const scenarioOf = (well: WellStory, mode: Mode): ScenarioStory => (mode === "twin" ? well.after : well.before);

/** The well's state at a fractional day, interpolated between the engine's daily values. */
export interface WellMoment {
  day: number;
  phase: StoryDay["phase"] | "cold";
  cycleNumber: number;
  temperature_C: number;
  viscosity_cP: number;
  tubingViscosity_cP: number;
  oil_bbl_per_d: number;
  spm: number;
  upstrokeFraction: number;
  floatRatio: number;
  pumping: boolean;
  /** Rod-float days so far in this scenario's current cycle. */
  floatDaysSoFar: number;
}

const logLerp = (a: number, b: number, k: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k);

export function momentAt(well: WellStory, mode: Mode, day: number): WellMoment {
  const sc = scenarioOf(well, mode);
  const first = sc.days[0]!;
  if (day < first.d) {
    return {
      day,
      phase: "cold",
      cycleNumber: first.cycleNumber - 1,
      temperature_C: well.cold.temperature_C,
      viscosity_cP: well.cold.viscosity_cP,
      tubingViscosity_cP: well.cold.tubingViscosity_cP,
      oil_bbl_per_d: 0,
      spm: 0,
      upstrokeFraction: 0.5,
      floatRatio: 0,
      pumping: false,
      floatDaysSoFar: 0,
    };
  }
  const i = Math.min(sc.days.length - 1, Math.max(0, Math.floor(day - first.d)));
  const a = sc.days[i]!;
  const b = sc.days[Math.min(sc.days.length - 1, i + 1)]!;
  const k = Math.min(1, Math.max(0, day - a.d));
  const sameLeg = a.phase === b.phase;
  const kk = sameLeg ? k : 0;
  const pa = a.pump;
  const pb = sameLeg ? b.pump ?? pa : pa;
  let floatDays = 0;
  for (const d of sc.days) {
    if (d.d > day) break;
    if (d.cycleNumber === well.cycle.cycleNumber && d.pump && d.pump.floatRatio >= 1) floatDays++;
  }
  return {
    day,
    phase: a.phase,
    cycleNumber: a.cycleNumber,
    temperature_C: a.temperature_C + ((sameLeg ? b.temperature_C : a.temperature_C) - a.temperature_C) * kk,
    viscosity_cP: logLerp(a.viscosity_cP, sameLeg ? b.viscosity_cP : a.viscosity_cP, kk),
    tubingViscosity_cP: logLerp(a.tubingViscosity_cP, sameLeg ? b.tubingViscosity_cP : a.tubingViscosity_cP, kk),
    oil_bbl_per_d: a.oil_bbl_per_d + ((sameLeg ? b.oil_bbl_per_d : a.oil_bbl_per_d) - a.oil_bbl_per_d) * kk,
    spm: pa ? pa.spm + ((pb?.spm ?? pa.spm) - pa.spm) * kk : 0,
    upstrokeFraction: pa ? pa.upstrokeFraction + ((pb?.upstrokeFraction ?? pa.upstrokeFraction) - pa.upstrokeFraction) * kk : 0.5,
    floatRatio: pa ? pa.floatRatio + ((pb?.floatRatio ?? pa.floatRatio) - pa.floatRatio) * kk : 0,
    pumping: a.phase === "produce",
    floatDaysSoFar: floatDays,
  };
}
