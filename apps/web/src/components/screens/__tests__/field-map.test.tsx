// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dataset } from "@/lib/dataset";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { FieldMapScreen } from "../field-map";
import { openingView, renderInTwin, stubLayout } from "./render-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const asOf = dataset.meta.asOf;
const producing = dataset.wells.filter((w) => w.status === "css" || w.status === "cold");
const css = dataset.wells.filter((w) => w.status === "css");
const shutIn = dataset.wells.filter((w) => w.status !== "css" && w.status !== "cold");
const timeline = (id: string) => openingView.timelines.find((t) => t.wellId === id)!;

/** Phase counts and field oil on one day of the issued plan, worked out apart from the screen. */
function dayTotals(day: number) {
  const counts = { steam: 0, soak: 0, produce: 0, down: 0 };
  let oil = 0;
  for (const w of producing) {
    const cell = timeline(w.id).days[day]!;
    counts[cell.phase]++;
    oil += cell.oil_bbl_per_d;
  }
  return { counts, oil };
}

function phaseCount(label: string) {
  return screen.getByText(label).parentElement!.lastElementChild!.textContent;
}

beforeAll(stubLayout);
afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("field map screen", () => {
  it("draws a glyph for every producing well and a plain marker for the rest", () => {
    renderInTwin(<FieldMapScreen />);
    for (const w of producing) expect(screen.getByTestId(`map-well-${w.id}`)).toBeTruthy();
    for (const w of shutIn) expect(screen.queryByTestId(`map-well-${w.id}`)).toBeNull();
    expect(screen.getByTestId("map-inset").querySelectorAll("circle")).toHaveLength(dataset.wells.length);
  });

  it("totals field oil and counts wells by phase on the as-of date", () => {
    renderInTwin(<FieldMapScreen />);
    const { counts, oil } = dayTotals(0);
    expect(within(screen.getByTestId("readout-field-oil")).getByText(fmtInt(oil))).toBeTruthy();
    expect(phaseCount("Steam")).toBe(String(counts.steam));
    expect(phaseCount("Soak")).toBe(String(counts.soak));
    expect(phaseCount("Producing")).toBe(String(counts.produce));
    expect(phaseCount("Down")).toBe(String(counts.down));
    expect(counts.steam + counts.soak + counts.produce + counts.down).toBe(producing.length);
    expect(phaseCount("Shut in or observation")).toBe(String(dataset.field.wellsDrilled - dataset.field.wellsProducing));
  });

  it("moves every total to the day the slider picks", () => {
    renderInTwin(<FieldMapScreen />);
    const [slider] = screen.getAllByRole("slider");
    fireEvent.keyDown(slider!, { key: "End" });
    const last = dataset.meta.horizon_d - 1;
    const { counts, oil } = dayTotals(last);
    expect(screen.getByTestId("readout-field-oil").textContent).toContain(shortDate(asOf, last));
    expect(within(screen.getByTestId("readout-field-oil")).getByText(fmtInt(oil))).toBeTruthy();
    expect(phaseCount("Steam")).toBe(String(counts.steam));
  });

  it("opens on BGW-14's card and switches to the well clicked", () => {
    renderInTwin(<FieldMapScreen />);
    const card = () => screen.getByTestId("map-well-card");
    expect(card().textContent).toContain("BGW-14");
    const other = css.find((w) => w.id !== "BGW-14")!;
    fireEvent.click(screen.getByTestId(`map-well-${other.id}`));
    expect(card().textContent).toContain(other.id);
    expect(card().textContent).toContain(`${fmtInt(timeline(other.id).oil90_bbl)} bbl`);
    expect(card().textContent).toContain(`${fmtFixed(timeline(other.id).days[0]!.oil_bbl_per_d, 1)} bbl/d`);
  });

  it("sends a steam well to its cycle plan and pump twin", () => {
    renderInTwin(<FieldMapScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Cycle plan" }));
    expect(push).toHaveBeenCalledWith("/cycle-plan");
    fireEvent.click(screen.getByRole("button", { name: "Pump twin" }));
    expect(push).toHaveBeenCalledWith("/pump");
  });

  it("offers no screen links for a cold well", () => {
    renderInTwin(<FieldMapScreen />);
    const cold = producing.find((w) => w.status === "cold")!;
    fireEvent.click(screen.getByTestId(`map-well-${cold.id}`));
    expect(screen.getByTestId("map-well-card").textContent).toContain(cold.id);
    expect(screen.queryByRole("button", { name: "Cycle plan" })).toBeNull();
  });

  it("takes its well counts from the dataset", () => {
    renderInTwin(<FieldMapScreen />);
    expect(within(screen.getByTestId("highlight")).getByText(`${dataset.field.wellsOnCss} CSS wells`)).toBeTruthy();
    expect(screen.getByText("From CSS wells").parentElement!.textContent).toContain(`from ${dataset.field.wellsOnCss} wells`);
  });

  it("dims the cold wells until the highlight takes in all wells", () => {
    renderInTwin(<FieldMapScreen />);
    const cold = producing.find((w) => w.status === "cold")!;
    const glyph = () => screen.getByTestId(`map-well-${cold.id}`);
    expect(glyph().getAttribute("opacity")).toBe("0.3");
    fireEvent.click(within(screen.getByTestId("highlight")).getByText("All wells"));
    expect(glyph().getAttribute("opacity")).toBe("1");
  });
});
