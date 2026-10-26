// @vitest-environment jsdom
import { cycleScenario, type ScenarioInput, type ScenarioResult } from "@bgw/optimise";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCycleView } from "@/lib/cycle-view";
import { dataset } from "@/lib/dataset";
import { fmtFixed, fmtInt } from "@/lib/format";
import { WhatIfScreen } from "../what-if";
import { field, renderInTwin, stubLayout } from "./render-screen";

const { minProductionLeg_d, reliability, steamCost_bbl_per_t } = dataset.assumptions;

/** The design input and next cycle number the screen opens a well on. */
function opening(wellId: string) {
  const view = buildCycleView(field, wellId, dataset.issuedPlan, dataset.issuedPlan);
  const design = field.model(wellId).well.css!.design;
  const cycleNumber = view.next?.cycleNumber ?? view.anchor.cycleNumber + 1;
  const input: ScenarioInput = {
    steam_t: Math.round((design.injectionRate_t_per_h * 24 * design.injection_d) / 100) * 100,
    soak_d: design.soak_d,
    steamCost_bbl_per_t,
    pump: "twin",
  };
  return { cycleNumber, input };
}

function scenario(wellId: string, patch: Partial<ScenarioInput> = {}): ScenarioResult {
  const { cycleNumber, input } = opening(wellId);
  return cycleScenario(field.model(wellId), cycleNumber, { ...input, ...patch }, minProductionLeg_d, reliability);
}

/** The design and scenario cells of one table row. */
function row(label: string): [string, string] {
  const tr = within(screen.getByTestId("what-if-table")).getByText(label).closest("tr")!;
  const cells = tr.querySelectorAll("td");
  return [cells[1]!.textContent!, cells[2]!.textContent!];
}

beforeAll(stubLayout);
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("what-if lab", () => {
  it("compares the twin's pump against today's practice at the design steam", () => {
    renderInTwin(<WhatIfScreen />);
    const design = scenario("BGW-14", { pump: "practice" });
    const twin = scenario("BGW-14");
    expect(row("Injection")).toEqual([`${design.injection_d} d`, `${twin.injection_d} d`]);
    expect(row("Cycle oil")).toEqual([`${fmtInt(design.cycleOil_bbl)} bbl`, `${fmtInt(twin.cycleOil_bbl)} bbl`]);
    expect(row("Rod-float days")).toEqual([String(design.floatDays), String(twin.floatDays)]);
    expect(twin.floatDays).toBeLessThanOrEqual(design.floatDays);
  });

  it("reruns the scenario when the steam goes up a step", () => {
    renderInTwin(<WhatIfScreen />);
    const { input } = opening("BGW-14");
    fireEvent.click(screen.getByTestId("inc-steam_t"));
    const more = scenario("BGW-14", { steam_t: input.steam_t + 100 });
    expect(row("Injection")[1]).toBe(`${more.injection_d} d`);
    expect(row("Cycle oil")[1]).toBe(`${fmtInt(more.cycleOil_bbl)} bbl`);
    expect(row("Steam-oil ratio")[1]).toBe(fmtFixed(more.sor, 2));
  });

  it("keeps the soak inside its range at the lower end", () => {
    renderInTwin(<WhatIfScreen />);
    for (let i = 0; i < 30; i++) fireEvent.click(screen.getByTestId("dec-soak_d"));
    const shortest = scenario("BGW-14", { soak_d: 2 });
    expect(row("Whole cycle")[1]).toBe(`${shortest.cycleLength_d} d`);
  });

  it("matches the design column once the pump is set back to today's practice", () => {
    renderInTwin(<WhatIfScreen />);
    fireEvent.click(within(screen.getByTestId("pump-mode")).getByText("Constant speed"));
    for (const label of ["Cycle oil", "Lift energy", "Rod-float days", "Failure chance"]) {
      const [design, now] = row(label);
      expect(now).toBe(design);
    }
  });

  it("restores the design inputs on reset", () => {
    renderInTwin(<WhatIfScreen />);
    const before = row("Cycle oil")[1];
    fireEvent.click(screen.getByTestId("inc-steam_t"));
    expect(row("Cycle oil")[1]).not.toBe(before);
    fireEvent.click(screen.getByTestId("reset-inputs"));
    expect(row("Cycle oil")[1]).toBe(before);
  });

  it("opens another steam well on its own design", () => {
    renderInTwin(<WhatIfScreen />);
    fireEvent.change(screen.getByTestId("well-picker"), { target: { value: "BGW-22" } });
    const other = scenario("BGW-22");
    expect(row("Injection")[1]).toBe(`${other.injection_d} d`);
    expect(row("Cycle oil")[1]).toBe(`${fmtInt(other.cycleOil_bbl)} bbl`);
  });
});
