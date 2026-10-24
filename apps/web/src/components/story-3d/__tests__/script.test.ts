import { describe, expect, it } from "vitest";
import {
  dayAt,
  DURATION,
  FIELD,
  FIELD_FROM,
  fieldStageAt,
  modeAt,
  SCENES,
  sceneAt,
  smooth,
  stageAt,
  TWIN_CLICK,
  windowAlpha,
} from "../script";

describe("3D story script", () => {
  it("lays the scenes end to end with no gaps", () => {
    for (let i = 1; i < SCENES.length; i++) expect(SCENES[i]!.start).toBe(SCENES[i - 1]!.end);
    expect(SCENES[0]!.start).toBe(0);
    expect(DURATION).toBe(SCENES.at(-1)!.end);
  });

  it("finds the scene playing at a time, and holds the last one past the end", () => {
    for (const s of SCENES) expect(sceneAt((s.start + s.end) / 2)).toBe(s);
    expect(sceneAt(DURATION + 10)).toBe(SCENES.at(-1));
  });

  it("hands over from the well to the field at the card scene's end", () => {
    expect(stageAt(FIELD_FROM - 0.01)).toBe("well");
    expect(stageAt(FIELD_FROM)).toBe("field");
  });

  it("opens the day before cycle 5's steam and plays the twin's steam day", () => {
    expect(dayAt(0)).toBe(-75);
    expect(dayAt(106)).toBe(30);
  });

  it("rewinds the playhead smoothly in the twin scene", () => {
    const samples = [76.9, 77.3, 77.7, 78.1, 78.5].map(dayAt);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeLessThan(samples[i - 1]!);
    expect(dayAt(78.6)).toBe(-57);
  });

  it("switches to the twin at the click and back to constant speed for the card comparison", () => {
    expect(modeAt(TWIN_CLICK - 0.01)).toBe("today");
    expect(modeAt(TWIN_CLICK)).toBe("twin");
    expect(modeAt(125)).toBe("today");
    expect(modeAt(130)).toBe("twin");
  });

  it("runs the field beats in order", () => {
    expect(fieldStageAt(FIELD.dragStart - 0.1)).toBe("issued");
    expect(fieldStageAt(FIELD.dragStart)).toBe("dragging");
    expect(fieldStageAt(FIELD.dragEnd)).toBe("overload");
    expect(fieldStageAt(FIELD.overloadHold)).toBe("resolving");
    expect(fieldStageAt(FIELD.resolved)).toBe("resolved");
  });

  it("eases between 0 and 1 and clamps outside", () => {
    expect(smooth(-1)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(2)).toBe(1);
  });

  it("fades a window in, holds it, and fades it out", () => {
    expect(windowAlpha(9, 10, 20)).toBe(0);
    expect(windowAlpha(15, 10, 20)).toBe(1);
    expect(windowAlpha(10.2, 10, 20)).toBeGreaterThan(0);
    expect(windowAlpha(10.2, 10, 20)).toBeLessThan(1);
    expect(windowAlpha(21, 10, 20)).toBe(0);
  });
});
