// @vitest-environment jsdom
import type { DayCell } from "@bgw/optimise";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RateArea } from "../rate-area";
import { cycleBlocks } from "../slot-block";
import type { Geometry } from "../geometry";

const cell = (phase: DayCell["phase"], cycleNumber: number | null, slotId: string | null = null, oil = 0) =>
  ({ phase, cycleNumber, slotId, oil_bbl_per_d: oil }) as DayCell;

afterEach(cleanup);

describe("cycleBlocks", () => {
  it("joins a cycle's steam and soak into one block keyed by its slot", () => {
    const days = [cell("produce", 5), cell("steam", 6, "S6"), cell("steam", 6, "S6"), cell("soak", 6, "S6"), cell("produce", 6, "S6")];
    expect(cycleBlocks(days)).toEqual([
      {
        key: "S6",
        slotId: "S6",
        cycleNumber: 6,
        steam: { from: 1, to: 2, phase: "steam", cycleNumber: 6, slotId: "S6" },
        soak: { from: 3, to: 3, phase: "soak", cycleNumber: 6, slotId: "S6" },
      },
    ]);
  });

  it("keys a cycle already under way, which has no slot, by its number", () => {
    const days = [cell("soak", 5), cell("soak", 5), cell("produce", 5)];
    const [block] = cycleBlocks(days);
    expect(block).toMatchObject({ key: "anchor-5", slotId: null, cycleNumber: 5, steam: null });
    expect(block!.soak).toMatchObject({ from: 0, to: 1 });
  });

  it("keeps two cycles in one window apart", () => {
    const days = [cell("steam", 6, "A"), cell("soak", 6, "A"), cell("produce", 6, "A"), cell("steam", 7, "B"), cell("soak", 7, "B")];
    expect(cycleBlocks(days).map((b) => b.key)).toEqual(["A", "B"]);
  });

  it("finds no blocks in a row that only produces or is down", () => {
    expect(cycleBlocks([cell("produce", null), cell("down", null), cell("produce", null)])).toEqual([]);
  });
});

describe("RateArea", () => {
  const geo = { dayPx: 10 } as Geometry;

  function draw(days: DayCell[]) {
    const { container } = render(
      <svg>
        <RateArea days={days} geo={geo} height={20} rateMax={40} />
      </svg>,
    );
    return container;
  }

  it("draws one filled area per production run, scaled to the row's height", () => {
    const svg = draw([cell("produce", 5, null, 40), cell("produce", 5, null, 20), cell("steam", 6, "S"), cell("produce", 6, "S", 10)]);
    const polygons = svg.querySelectorAll("polygon");
    expect(polygons).toHaveLength(2);
    // Rate 40 reaches the top edge, y = 1, and rate 20 sits halfway down the 19 px of travel.
    expect(polygons[0]!.getAttribute("points")).toBe("0,20 0,1 5,1 15,10.5 20,10.5 20,20");
  });

  it("caps a rate above the row's maximum at the top edge", () => {
    const svg = draw([cell("produce", 5, null, 400)]);
    expect(svg.querySelector("polyline")!.getAttribute("points")).toBe("0,1 5,1 10,1");
  });

  it("hatches down days instead of drawing a rate", () => {
    const svg = draw([cell("down", null), cell("down", null)]);
    expect(svg.querySelectorAll("polygon")).toHaveLength(0);
    expect(svg.querySelector("rect")!.getAttribute("fill")).toBe("url(#hatch-down)");
    expect(svg.querySelector("rect")!.getAttribute("width")).toBe("20");
  });
});
