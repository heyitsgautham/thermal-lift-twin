// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCycleView } from "@/lib/cycle-view";
import { dataset } from "@/lib/dataset";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { PumpTwinScreen } from "../pump-twin";
import { field, renderInTwin, stubLayout } from "./render-screen";

const asOf = dataset.meta.asOf;

/** The day the pump twin opens a well on: its last pumping day before steam. */
function openingDay(wellId: string) {
  const view = buildCycleView(field, wellId, dataset.issuedPlan, dataset.issuedPlan);
  const pumpDays = view.days.filter((d) => d.twin && d.practice && d.d >= 0);
  const before = view.next ? pumpDays.filter((d) => d.d < view.next!.start_d).at(-1) : undefined;
  expect(before).toBeDefined();
  return before!;
}

function row(label: string): [string, string] {
  const tr = within(screen.getByTestId("setting-table")).getByText(label).closest("tr")!;
  const cells = tr.querySelectorAll("td");
  return [cells[1]!.textContent!, cells[2]!.textContent!];
}

beforeAll(stubLayout);
afterEach(cleanup);

describe("pump twin screen", () => {
  it("opens BGW-14 on its last pumping day before steam, at constant speed", () => {
    renderInTwin(<PumpTwinScreen />);
    const day = openingDay("BGW-14");
    expect(screen.getByTestId("pump-twin").dataset.mode).toBe("practice");
    expect(screen.getByText(`${shortDate(asOf, day.d)} · ${fmtInt(day.tubingViscosity_cP!)} cP`)).toBeTruthy();
    expect(row("Average SPM")).toEqual([fmtFixed(day.practice!.spm, 1), fmtFixed(day.twin!.spm, 1)]);
    expect(row("Float ratio")).toEqual([fmtFixed(day.practice!.floatRatio, 2), fmtFixed(day.twin!.floatRatio, 2)]);
    expect(row("Lift energy")).toEqual([`${fmtInt(day.practice!.energy_kWh)} kWh/d`, `${fmtInt(day.twin!.energy_kWh)} kWh/d`]);
  });

  it("slows the downstroke under the twin profile", () => {
    renderInTwin(<PumpTwinScreen />);
    const day = openingDay("BGW-14");
    expect(day.twin!.upstrokeFraction).toBeLessThan(0.5);
    const share = (f: number) => `${Math.round(f * 100)}/${Math.round((1 - f) * 100)}`;
    expect(row("Up / down share")).toEqual([share(day.practice!.upstrokeFraction), share(day.twin!.upstrokeFraction)]);
  });

  it("switches the live cards and readouts to the twin profile", () => {
    renderInTwin(<PumpTwinScreen />);
    expect(screen.getByTestId("readout-peak").textContent).toContain("constant speed");
    fireEvent.click(within(screen.getByTestId("mode")).getByText("Twin profile"));
    expect(screen.getByTestId("pump-twin").dataset.mode).toBe("twin");
    expect(screen.getByTestId("readout-peak").textContent).toContain("twin profile");
  });

  it("flags rod float at constant speed on BGW-14's thickest day, the story's problem", () => {
    renderInTwin(<PumpTwinScreen />);
    expect(openingDay("BGW-14").practice!.floatRatio).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("float-flag").textContent).toContain("Rod float");
  });

  it("follows the well picker to another steam well", () => {
    renderInTwin(<PumpTwinScreen />);
    fireEvent.change(screen.getByTestId("well-picker"), { target: { value: "BGW-22" } });
    const day = openingDay("BGW-22");
    expect(screen.getByText(`${shortDate(asOf, day.d)} · ${fmtInt(day.tubingViscosity_cP!)} cP`)).toBeTruthy();
    expect(row("Average SPM")).toEqual([fmtFixed(day.practice!.spm, 1), fmtFixed(day.twin!.spm, 1)]);
  });
});
