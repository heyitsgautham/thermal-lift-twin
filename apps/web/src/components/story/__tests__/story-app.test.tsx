// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { longDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { dayView, FIRST_DAY, runOf, stopDay, storyData } from "../data";
import { FIELD_TIMING, story } from "../store";
import { StoryApp } from "../story-app";

const { asOf } = storyData();

/** Plays the story clock in 50 ms frames, as the page's frame loop would. */
function play(ms: number) {
  act(() => {
    for (let t = 0; t < ms; t += 50) story.advance(50);
  });
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => story.reset());
afterEach(cleanup);

describe("2D story", () => {
  it("opens on BGW-14 at rest on the first day, paused", () => {
    render(<StoryApp />);
    const v = dayView(runOf("today"), FIRST_DAY);
    expect(screen.getByTestId("panel-date").textContent).toBe(longDate(asOf, FIRST_DAY));
    expect(screen.getByTestId("readout-temp").textContent).toContain(fmtInt(v.temperature_C));
    expect(screen.getByTestId("readout-cp").textContent).toContain(fmtInt(v.tubingViscosity_cP));
    expect(screen.getByTestId("rods-state").textContent).toContain("Pump off");
    expect(screen.getByTestId("float-days").textContent).toBe("0");
    expect(screen.getByTestId("well-drawing")).toBeTruthy();
  });

  it("plays today's run to its stop day and counts the rod-float days on the way", () => {
    render(<StoryApp />);
    fireEvent.click(screen.getByTestId("play"));
    play(120_000);
    const run = runOf("today");
    expect(story.get().day).toBe(stopDay("today"));
    expect(screen.getByTestId("float-days").textContent).toBe(String(run.floatDays.length));
    expect(run.floatDays.length).toBeGreaterThan(0);
  });

  it("runs the twin's schedule without a single rod-float day", () => {
    render(<StoryApp />);
    fireEvent.click(screen.getByTestId("mode-twin"));
    fireEvent.click(screen.getByTestId("play"));
    play(120_000);
    expect(story.get().mode).toBe("twin");
    expect(screen.getByTestId("float-days").textContent).toBe("0");
  });

  it("shows the oil rate the engine computed for the day in view", () => {
    render(<StoryApp />);
    act(() => story.scrub(20, true));
    const v = dayView(runOf("today"), 20);
    expect(screen.getByTestId("readout-oil").textContent).toContain(fmtFixed(v.oil_bbl_per_d, 1));
    expect(screen.getByTestId("panel-date").textContent).toBe(longDate(asOf, 20));
  });

  it("opens the comparison and the pump card, each in place of the other", () => {
    render(<StoryApp />);
    fireEvent.click(screen.getByTestId("open-compare"));
    expect(screen.getByTestId("compare-panel")).toBeTruthy();
    expect(screen.queryByTestId("rods-block")).toBeNull();
    fireEvent.click(screen.getByTestId("open-card"));
    expect(screen.getByTestId("pump-card")).toBeTruthy();
    expect(screen.queryByTestId("compare-panel")).toBeNull();
    expect(Math.floor(story.get().day)).toBe(storyData().well.card.day_d);
    fireEvent.click(screen.getByTestId("close-card"));
    expect(screen.queryByTestId("pump-card")).toBeNull();
  });

  it("moves between the well, field and method views", () => {
    render(<StoryApp />);
    fireEvent.click(screen.getByTestId("nav-field"));
    expect(screen.getByTestId("field-view")).toBeTruthy();
    expect(screen.queryByTestId("well-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("nav-method"));
    expect(screen.getByTestId("method-view")).toBeTruthy();
    fireEvent.click(screen.getByTestId("nav-well"));
    expect(screen.getByTestId("well-panel")).toBeTruthy();
  });

  it("opens the field year only once the twin has cleared the overload", () => {
    render(<StoryApp />);
    fireEvent.click(screen.getByTestId("nav-field"));
    const year = () => screen.getByTestId<HTMLButtonElement>("open-year");
    expect(year().disabled).toBe(true);
    act(() => {
      story.fieldDrag(-14);
      story.fieldDrop(true);
    });
    expect(story.get().field.stage).toBe("overload");
    play(FIELD_TIMING.overload_ms + FIELD_TIMING.resolve_ms + FIELD_TIMING.settle_ms + 500);
    expect(story.get().field.stage).toBe("resolved");
    expect(year().disabled).toBe(false);
    fireEvent.click(year());
    expect(screen.getByTestId("year-overlay")).toBeTruthy();
  });
});
