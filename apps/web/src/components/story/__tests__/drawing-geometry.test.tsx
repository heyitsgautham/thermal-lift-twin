// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AMAX,
  CARRIER_BOTTOM,
  CRANK_R,
  depthY,
  GEAR,
  GROUND,
  PIVOT,
  pumpjackPose,
  REAR,
  STRATA,
  TRAVEL,
  W,
  wavyTop,
} from "../drawing-geometry";
import { Pill, Tag } from "../drawing-labels";

const deg = (rad: number) => (rad * 180) / Math.PI;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

afterEach(cleanup);

describe("pumpjackPose", () => {
  it("drops the horsehead and the carrier at the bottom of the stroke", () => {
    const pose = pumpjackPose(0, true);
    expect(pose.deg).toBeCloseTo(-deg(AMAX), 9);
    expect(pose.carrierY).toBe(CARRIER_BOTTOM);
  });

  it("lifts them by the full travel at the top", () => {
    const pose = pumpjackPose(1, false);
    expect(pose.deg).toBeCloseTo(deg(AMAX), 9);
    expect(pose.carrierY).toBeCloseTo(CARRIER_BOTTOM - TRAVEL, 9);
  });

  it("levels the beam at mid-stroke", () => {
    const pose = pumpjackPose(0.5, true);
    expect(pose.deg).toBeCloseTo(0, 9);
    expect(pose.rear).toEqual({ x: PIVOT.x + REAR, y: PIVOT.y });
  });

  it("keeps the crank pin on its circle and the beam's rear end on its arc", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      for (const up of [true, false]) {
        const pose = pumpjackPose(p, up);
        expect(dist(pose.pin, GEAR)).toBeCloseTo(CRANK_R, 9);
        expect(dist(pose.rear, PIVOT)).toBeCloseTo(REAR, 9);
      }
    }
  });

  it("puts the pin on opposite sides of the gear going up and coming down", () => {
    const up = pumpjackPose(0.3, true);
    const down = pumpjackPose(0.3, false);
    expect(up.pin.x - GEAR.x).toBeCloseTo(-(down.pin.x - GEAR.x), 9);
    expect(up.pin.y).toBeCloseTo(down.pin.y, 9);
    expect(up.carrierY).toBe(down.carrierY);
  });

  it("stays finite when the rod position overshoots the stroke a little", () => {
    for (const p of [-0.05, 1.05]) {
      const pose = pumpjackPose(p, p > 0.5);
      expect([pose.deg, pose.crankDeg, pose.pin.x, pose.pin.y, pose.carrierY].every(Number.isFinite)).toBe(true);
    }
  });
});

describe("cross-section scale", () => {
  it("puts the surface just under the ground line and the pump at 1,100 m below it", () => {
    expect(depthY(0)).toBe(GROUND + 10);
    expect(depthY(1100)).toBe(GROUND + 10 + 268);
  });

  it("stacks the rock layers top down", () => {
    const tops = STRATA.map((s) => s.top);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(tops[0]).toBe(GROUND);
  });

  it("draws a flat layer top when it has no undulation, across the whole width", () => {
    const d = wavyTop(300, 0, 1.3);
    expect(d.startsWith("M0 300.0 L20 300.0")).toBe(true);
    expect(d.endsWith(`L${W} 300.0`)).toBe(true);
  });

  it("keeps an undulating top within its amplitude", () => {
    const ys = wavyTop(300, 4, 0.7)
      .slice(1)
      .split(" L")
      .map((pt) => Number(pt.split(" ")[1]));
    expect(Math.max(...ys.map((y) => Math.abs(y - 300)))).toBeLessThanOrEqual(4 * 1.45 + 0.05); // printed to 0.1
  });
});

describe("labels", () => {
  function draw(node: React.ReactNode) {
    return render(<svg>{node}</svg>).container;
  }

  it("sizes a pill to its text and right-aligns it on request", () => {
    const short = draw(<Pill x={100} y={50} text="VFD" />).querySelector("rect")!;
    cleanup();
    const long = draw(<Pill x={100} y={50} text="Thermal wellhead" anchor="end" />).querySelector("rect")!;
    expect(Number(long.getAttribute("width"))).toBeGreaterThan(Number(short.getAttribute("width")));
    expect(Number(short.getAttribute("x"))).toBe(100);
    expect(Number(long.getAttribute("x")) + Number(long.getAttribute("width"))).toBeCloseTo(100, 9);
  });

  it("prints a tag's title in capitals beside its value and note", () => {
    const svg = draw(<Tag x={0} y={0} w={240} title="Rod-float days" value="17" sub="before steam" tone="alert" opacity={1} />);
    const texts = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(["ROD-FLOAT DAYS", "17", "before steam"]);
  });
});
