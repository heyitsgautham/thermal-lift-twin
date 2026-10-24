import { describe, expect, it } from "vitest";
import { computeGeometry } from "../geometry";

describe("calendar geometry", () => {
  const g = computeGeometry(1920, 900, 90, 19, 14);

  it("gives every day the same whole number of pixels", () => {
    expect(Number.isInteger(g.dayPx)).toBe(true);
    expect(g.gridW).toBe(g.dayPx * 90);
    expect(Number.isInteger(g.x0)).toBe(true);
  });

  it("centres the grid between the well labels and the oil column", () => {
    const left = g.x0 - (g.padX + g.labelW);
    const right = g.width - g.padX - g.oilW - (g.x0 + g.gridW);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it("stacks the lane, the axis and the rows without overlap and fits the height", () => {
    expect(g.axisTop).toBeGreaterThan(g.laneTop + g.laneH);
    expect(g.rowsTop).toBe(g.axisTop + g.axisH);
    expect(g.coldTop).toBe(g.rowsTop + g.cssRowH * 19 + g.dividerH);
    expect(g.bottom).toBeLessThanOrEqual(g.height);
  });

  it("draws steam rows taller than cold rows", () => {
    expect(g.cssRowH).toBeGreaterThan(g.coldRowH);
  });

  it("switches to the compact layout below 1300 px", () => {
    const small = computeGeometry(1280, 720, 90, 19, 14);
    expect(small.compact).toBe(true);
    expect(small.labelW).toBeLessThan(g.labelW);
    expect(g.compact).toBe(false);
  });

  it("keeps rows readable when the screen is too short for them", () => {
    const short = computeGeometry(1920, 300, 90, 19, 14);
    expect(short.cssRowH).toBeGreaterThanOrEqual(16);
    expect(short.coldRowH).toBeGreaterThanOrEqual(7);
  });

  it("never squeezes a day under 6 px", () => {
    expect(computeGeometry(400, 900, 90, 19, 14).dayPx).toBe(6);
  });
});
