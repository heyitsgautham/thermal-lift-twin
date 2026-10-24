import { describe, expect, it } from "vitest";
import { carrierAt, rodStateAt, strokesAt } from "../stroke";

describe("polished rod motion", () => {
  it("rises over the upstroke and falls over the downstroke", () => {
    expect(carrierAt(0, 0.5)).toBeCloseTo(0, 12);
    expect(carrierAt(0.5, 0.5)).toBeCloseTo(1, 12);
    expect(carrierAt(0.25, 0.5)).toBeCloseTo(0.5, 12);
    expect(carrierAt(0.75, 0.5)).toBeCloseTo(0.5, 12);
  });

  it("repeats every stroke", () => {
    expect(carrierAt(2.3, 0.45)).toBeCloseTo(carrierAt(0.3, 0.45), 12);
  });

  it("reaches the top sooner with a fast upstroke", () => {
    expect(carrierAt(0.3, 0.3)).toBeCloseTo(1, 12);
    expect(carrierAt(0.3, 0.5)).toBeLessThan(1);
  });
});

describe("rod float", () => {
  it("keeps the rods on the carrier bar while they sink fast enough", () => {
    for (const p of [0.1, 0.6, 0.9]) {
      const s = rodStateAt(p, 0.5, 0.8);
      expect(s.rods).toBe(s.carrier);
      expect(s.gap).toBe(0);
      expect(s.jolt).toBe(0);
    }
  });

  it("leaves the rods above the bar on a downstroke the crude cannot follow", () => {
    const s = rodStateAt(0.85, 0.5, 2.5);
    expect(s.rods).toBeGreaterThan(s.carrier);
    expect(s.gap).toBeCloseTo(s.rods - s.carrier, 12);
  });

  it("floats the rods further the thicker the crude", () => {
    expect(rodStateAt(0.85, 0.5, 3).gap).toBeGreaterThan(rodStateAt(0.85, 0.5, 1.5).gap);
  });

  it("jolts when the bar catches the rods on the next upstroke, then settles", () => {
    const catches = Array.from({ length: 40 }, (_, i) => rodStateAt(i / 100, 0.5, 2.5));
    const peak = Math.max(...catches.map((s) => s.jolt));
    expect(peak).toBeGreaterThan(0.5);
    expect(rodStateAt(0.45, 0.5, 2.5).jolt).toBeLessThan(peak);
  });
});

describe("stroke table lookup", () => {
  const table = Float64Array.from([0, 1, 2, 3, 4]);

  it("interpolates between samples", () => {
    expect(strokesAt(table, 0.5 / 120)).toBeCloseTo(0.5, 12);
  });

  it("clamps before the start and past the end", () => {
    expect(strokesAt(table, -1)).toBe(0);
    expect(strokesAt(table, 10)).toBeGreaterThanOrEqual(3);
  });
});
