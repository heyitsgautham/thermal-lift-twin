// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCycleView } from "@/lib/cycle-view";
import { dataset } from "@/lib/dataset";
import { shortDate } from "@/lib/dates";
import { fmtInt } from "@/lib/format";
import { CyclePlanScreen } from "../cycle-plan";
import { field, renderInTwin, stubLayout } from "./render-screen";

const asOf = dataset.meta.asOf;
const viewOf = (wellId: string) => buildCycleView(field, wellId, dataset.issuedPlan, dataset.issuedPlan);

beforeAll(stubLayout);
afterEach(cleanup);

function renderScreen() {
  return renderInTwin(<CyclePlanScreen />);
}

function readout(label: string) {
  return screen.getByText(label).parentElement!;
}

describe("cycle plan screen", () => {
  it("opens on BGW-14 and books the steam on the issued slot's day", () => {
    renderScreen();
    const view = viewOf("BGW-14");
    expect(screen.getByTestId<HTMLSelectElement>("well-picker").value).toBe("BGW-14");
    const steam = screen.getByTestId("readout-next-steam");
    expect(within(steam).getByText(shortDate(asOf, view.next!.start_d))).toBeTruthy();
    expect(within(steam).getByText("as planned")).toBeTruthy();
  });

  it("reads the crude's tubing viscosity on the last day before steam", () => {
    renderScreen();
    const view = viewOf("BGW-14");
    const last = view.days.find((d) => d.d === view.next!.start_d - 1)!;
    const today = view.days.find((d) => d.d === 0)!;
    const box = readout("Crude in the tubing");
    expect(within(box).getByText(fmtInt(last.tubingViscosity_cP!))).toBeTruthy();
    expect(box.textContent).toContain(`${fmtInt(today.tubingViscosity_cP!)} cP today`);
  });

  it("sums the oil left in the cycle until steam", () => {
    renderScreen();
    const view = viewOf("BGW-14");
    const upcoming = view.days.filter((d) => d.d >= 0 && d.part === "tail");
    const box = readout("Oil until steam");
    expect(within(box).getByText(fmtInt(upcoming.reduce((s, d) => s + d.oil_bbl_per_d, 0)))).toBeTruthy();
    expect(box.textContent).toContain(`${upcoming.length} days of cycle ${view.anchor.cycleNumber} left`);
  });

  it("follows the well picker to another steam well", () => {
    renderScreen();
    const other = viewOf("BGW-22");
    fireEvent.change(screen.getByTestId("well-picker"), { target: { value: "BGW-22" } });
    expect(within(screen.getByTestId("readout-next-steam")).getByText(shortDate(asOf, other.next!.start_d))).toBeTruthy();
  });
});
