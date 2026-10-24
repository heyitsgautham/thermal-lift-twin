// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataset } from "@/lib/dataset";
import { TIMING, useTwin } from "../use-twin";

const hero = dataset.issuedPlan.find((s) => s.wellId === "BGW-14")!;

function setup(holdOverload = false) {
  return renderHook(() => useTwin(dataset, { holdOverload }));
}

/** Drags BGW-14's slot two weeks earlier, the story's edit, which overloads the generators. */
function dragHeroEarlier(twin: ReturnType<typeof setup>["result"], days = -14) {
  act(() => twin.current.beginDrag(hero.id));
  act(() => twin.current.moveDrag(days));
  act(() => twin.current.endDrag());
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTwin", () => {
  it("starts on the issued plan, inside capacity", () => {
    const { result } = setup();
    expect(result.current.stage).toBe("idle");
    expect(result.current.dirty).toBe(false);
    expect(result.current.evalCurrent.overloadDays).toEqual([]);
    expect(result.current.capacity).toEqual(result.current.defaultCapacity);
  });

  it("previews the dragged slot without committing it", () => {
    const { result } = setup();
    act(() => result.current.beginDrag(hero.id));
    act(() => result.current.moveDrag(-3));
    expect(result.current.stage).toBe("dragging");
    expect(result.current.proposal.find((s) => s.id === hero.id)!.start_d).toBe(hero.start_d - 3);
    expect(result.current.dirty).toBe(true);
    act(() => result.current.cancelDrag());
    expect(result.current.stage).toBe("idle");
    expect(result.current.dirty).toBe(false);
  });

  it("clamps a drag to the slot's bounds", () => {
    const { result } = setup();
    act(() => result.current.beginDrag(hero.id));
    act(() => result.current.moveDrag(-10_000));
    const d = result.current.drag!;
    expect(d.start_d + d.delta_d).toBe(d.min_d);
  });

  it("shows the overload, re-sequences on the fixed beat, and holds the engineer's edit", () => {
    const { result } = setup();
    dragHeroEarlier(result);
    expect(result.current.stage).toBe("overload");
    expect(result.current.evalView.overloadDays.length).toBeGreaterThan(0);
    expect(result.current.pinned.has(hero.id)).toBe(true);
    expect(result.current.edit).toMatchObject({ slotId: hero.id, delta_d: -14, toStart_d: hero.start_d - 14 });

    act(() => vi.advanceTimersByTime(TIMING.overloadHold_ms));
    expect(result.current.stage).toBe("resolving");
    act(() => vi.advanceTimersByTime(TIMING.resolve_ms));
    expect(result.current.stage).toBe("resolved");
    expect(result.current.repair!.feasible).toBe(true);
    expect(result.current.evalView.overloadDays).toEqual([]);
    expect(result.current.proposal.find((s) => s.id === hero.id)!.start_d).toBe(hero.start_d - 14);
  });

  it("waits on the overload for the recorder when asked to hold it", () => {
    const { result } = setup(true);
    dragHeroEarlier(result);
    act(() => vi.advanceTimersByTime(TIMING.overloadHold_ms * 5));
    expect(result.current.stage).toBe("overload");
    act(() => result.current.resolveNow());
    expect(result.current.stage).toBe("resolving");
    act(() => vi.advanceTimersByTime(TIMING.resolve_ms));
    expect(result.current.stage).toBe("resolved");
  });

  it("refuses a new drag while the twin is working", () => {
    const { result } = setup(true);
    dragHeroEarlier(result);
    const other = dataset.issuedPlan.find((s) => s.wellId !== "BGW-14")!;
    act(() => result.current.beginDrag(other.id));
    expect(result.current.drag).toBeNull();
    expect(result.current.stage).toBe("overload");
  });

  it("makes the proposal the plan in force on adopt, and goes back to the issued plan on reset", () => {
    const { result } = setup();
    dragHeroEarlier(result);
    act(() => vi.advanceTimersByTime(TIMING.overloadHold_ms + TIMING.resolve_ms));
    act(() => result.current.adopt());
    expect(result.current.stage).toBe("idle");
    expect(result.current.dirty).toBe(false);
    expect(result.current.current.find((s) => s.id === hero.id)!.start_d).toBe(hero.start_d - 14);

    act(() => result.current.reset());
    expect(result.current.current).toBe(dataset.issuedPlan);
    expect(result.current.pinned.size).toBe(0);
  });

  it("re-checks the plan when generator capacity changes", () => {
    const { result } = setup();
    act(() => result.current.setCapacity({ units: 1, unitCapacity_t_per_h: 12 }));
    expect(result.current.stage).toBe("overload");
    act(() => result.current.setCapacity(result.current.defaultCapacity));
    expect(result.current.stage).toBe("resolved");
    expect(result.current.repair).toBeNull();
  });
});
