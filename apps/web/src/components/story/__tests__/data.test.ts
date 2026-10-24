import { describe, expect, it } from "vitest";
import { clamp, dayView, easeInOut, easeOut, floatDaysBy, runOf, since, smoothstep, stopDay, storyData } from "../data";

describe("2D story data", () => {
  it("computes the story once and reuses it", () => {
    expect(storyData()).toBe(storyData());
  });

  it("floats the rods only at constant speed", () => {
    expect(runOf("today").floatDays.length).toBeGreaterThan(0);
    expect(runOf("twin").floatDays).toEqual([]);
  });

  it("stops playback a few days into steam today, and with the next cycle pumping on the twin", () => {
    expect(stopDay("today")).toBe(runOf("today").nextSteam_d + 3);
    expect(stopDay("twin")).toBe(runOf("twin").nextSoakEnd_d + 4);
  });

  it("counts float days up to a day", () => {
    const run = runOf("today");
    const first = run.floatDays[0]!;
    expect(floatDaysBy(run, first - 1)).toBe(0);
    expect(floatDaysBy(run, first)).toBe(1);
    expect(floatDaysBy(run, 1e6)).toBe(run.floatDays.length);
  });

  it("shows whole days exactly and blends values between them", () => {
    const run = runOf("today");
    const d = run.days.find((x) => x.phase === "produce")!.d + 5;
    const a = dayView(run, d);
    const b = dayView(run, d + 1);
    const mid = dayView(run, d + 0.5);
    expect(mid.temperature_C).toBeCloseTo((a.temperature_C + b.temperature_C) / 2, 9);
    expect(mid.oil_bbl_per_d).toBeCloseTo((a.oil_bbl_per_d + b.oil_bbl_per_d) / 2, 9);
  });

  it("rests the well before the run's first day", () => {
    const run = runOf("today");
    const v = dayView(run, run.days[0]!.d - 10);
    expect(v.phase).toBe("rest");
    expect(v.oil_bbl_per_d).toBe(0);
  });
});

describe("easing helpers", () => {
  it("clamp, smoothstep and the eases stay inside 0 to 1", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(2)).toBe(1);
  });

  it("measures progress since an event on the story clock", () => {
    expect(since(1500, 1000, 1000)).toBe(0.5);
    expect(since(500, 1000, 1000)).toBe(0);
    expect(since(9000, 1000, 1000)).toBe(1);
  });
});
