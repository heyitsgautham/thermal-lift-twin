// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { dataset } from "@/lib/dataset";
import { fmtFixed, fmtInt } from "@/lib/format";
import { ModelScreen } from "../model";
import { field, defaultCapacity, renderInTwin, stubLayout } from "./render-screen";

function readout(label: string) {
  return screen.getAllByText(label)[0]!.parentElement!;
}

beforeAll(stubLayout);
afterEach(cleanup);

describe("model screen", () => {
  it("shows the chain the twin runs, in order", () => {
    renderInTwin(<ModelScreen />);
    const chain = screen.getByTestId("model-chain").textContent!;
    const steps = ["Heated zone", "Viscosity", "Inflow", "Pump and rods"].map((t) => chain.indexOf(t));
    expect(steps.every((i) => i >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it("reads the history's size, failures and seed from the dataset", () => {
    renderInTwin(<ModelScreen />);
    expect(within(readout("Daily history rows")).getByText(fmtInt(dataset.history.dailyRows))).toBeTruthy();
    expect(within(readout("Failures in history")).getByText(String(dataset.history.failures))).toBeTruthy();
    expect(within(readout("Seed")).getByText(String(dataset.meta.seed))).toBeTruthy();
    expect(readout("Daily history rows").textContent).toContain(`, ${dataset.field.wellsProducing} wells`);
    expect(readout("Missing days").textContent).toContain(`${fmtFixed(dataset.history.missingFraction * 100, 1)}%`);
  });

  it("scores BGW-14's logged rates against the model", () => {
    renderInTwin(<ModelScreen />);
    const cal = dataset.calibration.find((c) => c.wellId === "BGW-14")!;
    const pairs = cal.logged.flatMap((l, i) => (l === null ? [] : [[l, cal.model[i]!] as const]));
    const mean = pairs.reduce((s, [l]) => s + l, 0) / pairs.length;
    const ssRes = pairs.reduce((s, [l, m]) => s + (l - m) ** 2, 0);
    const ssTot = pairs.reduce((s, [l]) => s + (l - mean) ** 2, 0);
    const aside = screen.getByTestId("calibration").textContent!;
    expect(aside).toContain(`R² ${fmtFixed(1 - ssRes / ssTot, 3)}`);
    expect(aside).toContain(`${cal.logged.length - pairs.length} days missing`);
  });

  it("sets the model's field rate today beside the published one", () => {
    renderInTwin(<ModelScreen />);
    const today = field.evaluate(dataset.issuedPlan, defaultCapacity).timelines.reduce((s, t) => s + t.days[0]!.oil_bbl_per_d, 0);
    expect(screen.getByText(`model today: ${fmtInt(today)} bopd`)).toBeTruthy();
  });
});
