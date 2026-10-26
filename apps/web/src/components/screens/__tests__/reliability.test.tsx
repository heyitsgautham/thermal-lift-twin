// @vitest-environment jsdom
import { fieldRisk } from "@bgw/optimise";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { dataset } from "@/lib/dataset";
import { ReliabilityScreen } from "../reliability";
import { field, renderInTwin, stubLayout } from "./render-screen";

const risks = fieldRisk(field, dataset.issuedPlan, dataset.health, dataset.assumptions.reliability);
const actionable = risks.filter((r) => r.action !== "monitor");

/** The header readout with this label; panel titles can repeat it further down. */
function readout(label: string) {
  return screen.getAllByText(label)[0]!.parentElement!;
}

beforeAll(stubLayout);
afterEach(cleanup);

describe("reliability screen", () => {
  it("lists every producing well, riskiest first", () => {
    renderInTwin(<ReliabilityScreen />);
    const rows = within(screen.getByTestId("risk-table")).getAllByTestId(/^risk-row-/);
    expect(rows.map((r) => r.dataset.testid)).toEqual(risks.map((r) => `risk-row-${r.wellId}`));
    expect(rows).toHaveLength(dataset.field.wellsProducing);
  });

  it("counts the wells whose risk window reaches 10%", () => {
    renderInTwin(<ReliabilityScreen />);
    const flagged = risks.filter((r) => r.risk.high >= 0.1).length;
    expect(within(readout("Wells above 10%")).getByText(String(flagged))).toBeTruthy();
    expect(within(readout("Failures in history")).getByText(String(dataset.history.failures))).toBeTruthy();
  });

  it("opens on the riskiest well and follows a click to another", () => {
    renderInTwin(<ReliabilityScreen />);
    const detail = () => screen.getByTestId("risk-detail").textContent;
    expect(detail()).toContain(`${risks[0]!.wellId}: downhole card against its baseline`);
    const other = risks.at(-1)!.wellId;
    fireEvent.click(screen.getByTestId(`risk-row-${other}`));
    expect(detail()).toContain(`${other}: downhole card against its baseline`);
  });

  it("proposes a work order for each well that needs action, and raises one on approval", () => {
    renderInTwin(<ReliabilityScreen />);
    const orders = screen.getByTestId("work-orders");
    expect(within(readout("Work orders")).getByText(String(actionable.length))).toBeTruthy();
    expect(readout("Work orders").textContent).toContain("0 raised");
    expect(actionable.length).toBeGreaterThan(0);
    const first = actionable[0]!.wellId;
    fireEvent.click(screen.getByTestId(`raise-${first}`));
    expect(screen.queryByTestId(`raise-${first}`)).toBeNull();
    expect(within(orders).getByText("raised")).toBeTruthy();
    expect(readout("Work orders").textContent).toContain("1 raised");
  });

  it("states that the risk is an estimate on synthetic data", () => {
    renderInTwin(<ReliabilityScreen />);
    expect(screen.getByTestId("honesty-note").textContent?.length).toBeGreaterThan(20);
  });
});
