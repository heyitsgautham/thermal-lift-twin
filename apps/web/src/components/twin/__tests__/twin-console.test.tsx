// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataset } from "@/lib/dataset";
import { TwinConsole } from "../twin-console";
import { TIMING, useTwin, type Twin } from "../use-twin";

const asOf = dataset.meta.asOf;
const hero = dataset.issuedPlan.find((s) => s.wellId === "BGW-14")!;

/** Mounts the console on a live twin and hands the twin back, so a test can drag a slot the way the calendar does. */
function mount(holdOverload: boolean) {
  const ref: { twin: Twin | null } = { twin: null };
  function Harness() {
    const twin = useTwin(dataset, { holdOverload });
    ref.twin = twin;
    return <TwinConsole twin={twin} asOf={asOf} holdOverload={holdOverload} />;
  }
  render(<Harness />);
  return () => ref.twin!;
}

function dragHero(twin: () => Twin, days: number) {
  act(() => twin().beginDrag(hero.id));
  act(() => twin().moveDrag(days));
  act(() => twin().endDrag());
}

const stage = () => screen.getByTestId("twin-console").dataset.stage;
const text = () => screen.getByTestId("twin-console").textContent!;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("twin console", () => {
  it("opens on the issued plan, which fits the generators", () => {
    mount(false);
    expect(stage()).toBe("idle");
    expect(text()).toContain("Current plan fits the generators");
  });

  it("reports the overload a drag causes, then the twin's fix once asked to resolve", () => {
    const twin = mount(true);
    dragHero(twin, -14);
    expect(stage()).toBe("overload");
    const days = twin().evalView.overloadDays.length;
    expect(days).toBeGreaterThan(0);
    expect(text()).toContain(`Generators over capacity on ${days} days`);

    fireEvent.click(screen.getByRole("button", { name: "Let the twin resolve" }));
    expect(stage()).toBe("resolving");
    expect(text()).toContain("Twin is re-sequencing");
    act(() => vi.advanceTimersByTime(TIMING.resolve_ms));

    expect(stage()).toBe("resolved");
    const move = twin().repair!.moves[0]!;
    expect(text()).toContain("Proposal fits the generators");
    expect(text()).toContain(`${move.wellId} steam moved`);
    expect(text()).toContain("which clears every overloaded day.");
    expect(screen.getByTestId("option-chosen").textContent).toContain(move.wellId);
  });

  it("resolves on its own beat when not held for a recording", () => {
    const twin = mount(false);
    dragHero(twin, -14);
    act(() => vi.advanceTimersByTime(TIMING.overloadHold_ms + TIMING.resolve_ms));
    expect(stage()).toBe("resolved");
    expect(screen.queryByRole("button", { name: "Let the twin resolve" })).toBeNull();
  });

  it("adopts the proposal as the plan in force, and resets to the issued plan", () => {
    const twin = mount(false);
    dragHero(twin, -14);
    act(() => vi.advanceTimersByTime(TIMING.overloadHold_ms + TIMING.resolve_ms));
    fireEvent.click(screen.getByTestId("adopt"));
    expect(stage()).toBe("idle");
    expect(twin().current.find((s) => s.id === hero.id)!.start_d).toBe(hero.start_d - 14);
    fireEvent.click(screen.getByTestId("reset"));
    expect(twin().current).toBe(dataset.issuedPlan);
  });

  it("re-checks the plan when the engineer takes a generator away", () => {
    const twin = mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Lower generator units" }));
    expect(twin().capacity.units).toBe(dataset.assumptions.generatorUnits - 1);
    expect(stage()).toBe("overload");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Lower generator units" }).disabled).toBe(
      dataset.assumptions.generatorUnits - 1 <= 1,
    );
  });

  it("says when no single move can clear the overload", () => {
    const twin = mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Lower generator units" }));
    fireEvent.click(screen.getByRole("button", { name: "Let the twin resolve" }));
    act(() => vi.advanceTimersByTime(TIMING.resolve_ms));
    expect(twin().repair!.feasible).toBe(false);
    expect(twin().repair!.moves.length).toBeGreaterThan(0);
    expect(text()).toContain("No supported proposal");
    expect(text()).not.toContain("Proposal fits the generators");
    expect(text()).not.toContain("clears every overloaded day");
    expect(text()).toContain(`The moves it found still leave ${twin().evalView.overloadDays.length} days over capacity`);
  });
});
