import type { WellStory } from "./engine";
import { momentAt, type WellMoment } from "./data";
import { dayAt, modeAt, stageAt, type Mode } from "./script";
import { rodStateAt, strokesAt, type RodState } from "./stroke";

// The story's state for one frame, worked out once per frame and read by every
// mesh. Nothing here keeps history: frame N depends only on story time.

export interface FrameState {
  t: number;
  stage: "well" | "field";
  day: number;
  mode: Mode;
  moment: WellMoment;
  /** Strokes since the story started; the fraction is the phase within the current stroke. */
  strokes: number;
  rod: RodState;
  /** 0 when the reservoir is at its own temperature, 1 at the hottest the story shows. */
  heat: number;
  /** Cumulative crude and steam movement, for scrolling flows. */
  oilFlow: number;
  steamFlow: number;
}

export interface StoryTables {
  strokes: Float64Array;
  oil: Float64Array;
  steam: Float64Array;
}

export const frame: FrameState = {
  t: 0,
  stage: "well",
  day: -75,
  mode: "today",
  moment: {} as WellMoment,
  strokes: 0,
  rod: { carrier: 0, rods: 0, gap: 0, jolt: 0 },
  heat: 0,
  oilFlow: 0,
  steamFlow: 0,
};

/** Hottest heated-zone temperature the story reaches, the top of the glow scale. */
const HOT_C = 150;

export function updateFrame(t: number, well: WellStory, tables: StoryTables): FrameState {
  frame.t = t;
  frame.stage = stageAt(t);
  frame.day = dayAt(t);
  frame.mode = modeAt(t);
  frame.moment = momentAt(well, frame.mode, frame.day);
  frame.strokes = strokesAt(tables.strokes, t);
  frame.oilFlow = strokesAt(tables.oil, t);
  frame.steamFlow = strokesAt(tables.steam, t);
  const m = frame.moment;
  // A stopped pump holds wherever its last stroke left it.
  frame.rod = rodStateAt(frame.strokes, m.upstrokeFraction, m.pumping ? m.floatRatio : 0);
  const res = well.reservoirTemperature_C;
  frame.heat = Math.min(1, Math.max(0, (m.temperature_C - res) / (HOT_C - res)));
  return frame;
}
