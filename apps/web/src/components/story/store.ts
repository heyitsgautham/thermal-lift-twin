"use client";

import type { StoryMode } from "@bgw/optimise";
import { useSyncExternalStore } from "react";
import { dayView, FIRST_DAY, runOf, smoothstep, stopDay, storyData } from "./data";

// One clock drives the whole story. In the browser it follows the display's
// frames; for a recording it only moves when the recorder steps it, so every
// frame of a take is the same on every run. Nothing on the story's screens
// animates on its own time.

export type View = "well" | "field" | "method" | "end";
export type Panel = "none" | "compare" | "card";
export type FieldStage = "idle" | "dragging" | "overload" | "resolving" | "resolved";

export interface StoryState {
  /** Story clock, ms. */
  t: number;
  view: View;
  viewAt: number;
  mode: StoryMode;
  modeAt: number;
  /** Calendar day in view, fractional while playing. Day 0 is the as-of date. */
  day: number;
  playing: boolean;
  scrubbing: boolean;
  /** Pump strokes run so far, whole numbers at the bottom of the stroke. */
  stroke: number;
  slamAt: number;
  /** Distance oil has moved up the tubing, px, so flow speed can change without jumps. */
  flow: number;
  /** Distance steam has moved down the line, px. */
  steamFlow: number;
  todayDone: boolean;
  todayDoneAt: number;
  panel: Panel;
  panelAt: number;
  lowerThird: boolean;
  lowerThirdAt: number;
  field: { stage: FieldStage; delta: number; stageAt: number; year: boolean; yearAt: number };
  cursor: { x: number; y: number; tapAt: number; seen: boolean };
}

/** A pump stroke on screen takes this share of its real time, so the unit's rhythm is readable in a time-lapse. */
export const STROKE_SCALE = 0.13;
const NEVER = -1e9;

export const FIELD_TIMING = { overload_ms: 2600, resolve_ms: 3000, settle_ms: 1100 } as const;

/** Time-lapse speed in days per second: quick through quiet stretches, slow where something happens. */
export function playbackSpeed(mode: StoryMode, day: number): number {
  const { well } = storyData();
  const run = runOf(mode);
  const soakEnd = well.soakEnd_d;
  if (day < soakEnd) return 1.2;
  if (day >= run.nextSteam_d) return 1.9;
  const fast = 4.6;
  const slow = 1.3;
  const eventDay = mode === "today" ? (run.floatDays[0] ?? run.nextSteam_d) - 2 : run.nextSteam_d - 5;
  const start = fast - (fast - 1.2) * (1 - smoothstep(soakEnd, soakEnd + 6, day));
  return start - (start - slow) * smoothstep(eventDay - 5, eventDay, day);
}

function initial(): StoryState {
  return {
    t: 0,
    view: "well",
    viewAt: 0,
    mode: "today",
    modeAt: NEVER,
    day: FIRST_DAY,
    playing: false,
    scrubbing: false,
    stroke: 0,
    slamAt: NEVER,
    flow: 0,
    steamFlow: 0,
    todayDone: false,
    todayDoneAt: NEVER,
    panel: "none",
    panelAt: NEVER,
    lowerThird: false,
    lowerThirdAt: NEVER,
    field: { stage: "idle", delta: 0, stageAt: NEVER, year: false, yearAt: NEVER },
    cursor: { x: 1380, y: 640, tapAt: NEVER, seen: false },
  };
}

function copy(s: StoryState): StoryState {
  return { ...s, field: { ...s.field }, cursor: { ...s.cursor } };
}

export interface StoryEvent {
  t: number;
  name: string;
}

class StoryStore {
  private s = initial();
  private snap = copy(this.s);
  private listeners = new Set<() => void>();
  readonly events: StoryEvent[] = [];

  get = (): StoryState => this.snap;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private emit() {
    this.snap = copy(this.s);
    for (const fn of this.listeners) fn();
  }

  private log(name: string) {
    this.events.push({ t: Math.round(this.s.t), name });
  }

  reset() {
    this.s = initial();
    this.events.length = 0;
    this.emit();
  }

  advance(dt_ms: number) {
    const s = this.s;
    const { well } = storyData();
    s.t += dt_ms;
    const run = runOf(s.mode);

    if (s.playing && !s.scrubbing) {
      const stop = stopDay(s.mode);
      const before = s.day;
      s.day = Math.min(stop, s.day + (playbackSpeed(s.mode, s.day) * dt_ms) / 1000);
      const crossed = (d: number) => before < d && s.day >= d;
      if (crossed(well.anchorStart_d)) this.log("steam in");
      if (crossed(well.soakEnd_d)) this.log("pump starts");
      if (crossed(0)) this.log("as-of date");
      if (s.mode === "today" && run.floatDays[0] !== undefined && crossed(run.floatDays[0])) this.log("rods start to float");
      if (crossed(run.nextSteam_d)) this.log(`${s.mode} steam starts`);
      if (crossed(run.nextSoakEnd_d)) this.log(`${s.mode} pump restarts`);
      if (s.day >= stop) {
        s.playing = false;
        this.log(`${s.mode} run ends`);
        if (s.mode === "today" && !s.todayDone) {
          s.todayDone = true;
          s.todayDoneAt = s.t;
        }
      }
    }

    const v = dayView(run, s.day);
    if (v.setting) {
      const period_s = (60 / v.setting.spm) * STROKE_SCALE;
      const before = s.stroke;
      s.stroke += dt_ms / 1000 / period_s;
      if (Math.floor(s.stroke) > Math.floor(before) && v.floats) s.slamAt = s.t;
      s.flow += (dt_ms / 1000) * (10 + v.oil_bbl_per_d * 1.4);
    }
    if (v.phase === "steam") s.steamFlow += (dt_ms / 1000) * 90;

    const f = s.field;
    if (f.stage === "overload" && s.t - f.stageAt >= FIELD_TIMING.overload_ms) {
      f.stage = "resolving";
      f.stageAt = s.t;
      this.log("twin re-sequencing");
    } else if (f.stage === "resolving" && s.t - f.stageAt >= FIELD_TIMING.resolve_ms) {
      f.stage = "resolved";
      f.stageAt = s.t;
      this.log("proposal fits");
    }
    this.emit();
  }

  togglePlay() {
    const s = this.s;
    if (s.playing) {
      s.playing = false;
      this.log("pause");
    } else {
      if (s.day >= stopDay(s.mode) - 1e-6) s.day = FIRST_DAY;
      s.playing = true;
      this.log("play");
    }
    this.emit();
  }

  setMode(mode: StoryMode) {
    const s = this.s;
    if (s.mode === mode) return;
    s.mode = mode;
    s.modeAt = s.t;
    s.day = Math.min(s.day, stopDay(mode));
    if (s.panel === "compare") s.panel = "none";
    this.log(`mode ${mode}`);
    this.emit();
  }

  scrub(day: number, active: boolean) {
    const s = this.s;
    if (active && !s.scrubbing) this.log("scrub");
    s.scrubbing = active;
    if (active) s.playing = false;
    s.day = Math.max(FIRST_DAY, Math.min(stopDay(s.mode), day));
    this.emit();
  }

  setView(view: View) {
    const s = this.s;
    if (s.view === view) return;
    s.view = view;
    s.viewAt = s.t;
    s.playing = false;
    this.log(`view ${view}`);
    this.emit();
  }

  setPanel(panel: Panel) {
    const s = this.s;
    if (s.panel === panel) return;
    s.panel = panel;
    s.panelAt = s.t;
    if (panel === "card") {
      // The card is the last day before the twin's steam date; the panel beside it shows that day.
      s.playing = false;
      s.day = storyData().well.card.day_d + 0.5;
    }
    this.log(`panel ${panel}`);
    this.emit();
  }

  setLowerThird(on: boolean) {
    this.s.lowerThird = on;
    this.s.lowerThirdAt = this.s.t;
    this.emit();
  }

  fieldDrag(delta: number) {
    const f = this.s.field;
    if (f.stage !== "idle" && f.stage !== "dragging") return;
    if (f.stage === "idle") this.log("drag");
    f.stage = "dragging";
    f.delta = delta;
    this.emit();
  }

  fieldDrop(overloads: boolean) {
    const f = this.s.field;
    if (f.stage !== "dragging") return;
    if (f.delta === 0) {
      f.stage = "idle";
    } else {
      f.stage = overloads ? "overload" : "resolved";
      f.stageAt = this.s.t;
      this.log(overloads ? "drop, generators over capacity" : "drop");
    }
    this.emit();
  }

  fieldReset() {
    this.s.field = { stage: "idle", delta: 0, stageAt: NEVER, year: false, yearAt: NEVER };
    this.emit();
  }

  showYear(on: boolean) {
    this.s.field.year = on;
    this.s.field.yearAt = this.s.t;
    if (on) this.log("one year");
    this.emit();
  }

  cursorTo(x: number, y: number) {
    this.s.cursor.x = x;
    this.s.cursor.y = y;
    this.s.cursor.seen = true;
    this.emit();
  }

  tap() {
    this.s.cursor.tapAt = this.s.t;
    this.emit();
  }
}

export const story = new StoryStore();

export function useStory(): StoryState {
  return useSyncExternalStore(story.subscribe, story.get, story.get);
}
