import { describe, expect, it } from "vitest";
import { Rng } from "../src";

const draws = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe("seeded random numbers", () => {
  it("repeats the same stream for the same seed", () => {
    expect(draws(new Rng(18), 20)).toEqual(draws(new Rng(18), 20));
  });

  it("gives a different stream for a different seed", () => {
    expect(draws(new Rng(18), 5)).not.toEqual(draws(new Rng(19), 5));
  });

  it("stays in [0, 1) and spreads over it", () => {
    const xs = draws(new Rng(7), 5000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it("draws integers inside an inclusive range and reaches both ends", () => {
    const rng = new Rng(3);
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("rounds stepped values to the step without float noise", () => {
    const rng = new Rng(11);
    for (let i = 0; i < 200; i++) {
      const v = rng.stepped(0.4, 0.46, 0.01);
      expect(v).toBeGreaterThanOrEqual(0.4);
      expect(v).toBeLessThanOrEqual(0.46);
      expect(Number(v.toFixed(2))).toBe(v);
    }
  });

  it("shuffles into a permutation and leaves the input alone", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = new Rng(5).shuffle(items);
    expect(out).not.toBe(items);
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("picks only items from the list", () => {
    const rng = new Rng(9);
    for (let i = 0; i < 50; i++) expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
  });

  it("forks child streams that do not move the parent", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const child = a.fork("failures");
    draws(child, 10);
    expect(a.next()).toBe(b.next());
  });

  it("forks different streams for different labels", () => {
    const rng = new Rng(42);
    expect(draws(rng.fork("wells"), 3)).not.toEqual(draws(rng.fork("cycles"), 3));
    expect(draws(new Rng(42).fork("wells"), 3)).toEqual(draws(new Rng(42).fork("wells"), 3));
  });
});
