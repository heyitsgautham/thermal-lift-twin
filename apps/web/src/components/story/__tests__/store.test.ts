import { beforeEach, describe, expect, it } from "vitest";
import { FIRST_DAY, runOf, stopDay, storyData } from "../data";
import { FIELD_TIMING, playbackSpeed, story } from "../store";

const names = () => story.events.map((e) => e.name);

/** Advances the story clock in 50 ms frames, like the recorder does. */
function play(ms: number) {
  for (let t = 0; t < ms; t += 50) story.advance(50);
}

beforeEach(() => story.reset());

describe("story playback", () => {
  it("starts paused on the first day", () => {
    const s = story.get();
    expect(s.playing).toBe(false);
    expect(s.day).toBe(FIRST_DAY);
    expect(s.mode).toBe("today");
  });

  it("does not move the day while paused", () => {
    play(1000);
    expect(story.get().day).toBe(FIRST_DAY);
    expect(story.get().t).toBe(1000);
  });

  it("plays to the stop day, logs the beats on the way and pauses there", () => {
    story.togglePlay();
    play(120_000);
    const s = story.get();
    expect(s.day).toBe(stopDay("today"));
    expect(s.playing).toBe(false);
    expect(s.todayDone).toBe(true);
    expect(names()).toEqual(["play", "steam in", "pump starts", "as-of date", "rods start to float", "today steam starts", "today run ends"]);
  });

  it("restarts from the first day when play is pressed at the end", () => {
    story.togglePlay();
    play(120_000);
    story.togglePlay();
    expect(story.get().day).toBe(FIRST_DAY);
    expect(story.get().playing).toBe(true);
  });

  it("moves slower near the days that matter than through quiet stretches", () => {
    const { well } = storyData();
    const run = runOf("today");
    const quiet = playbackSpeed("today", well.soakEnd_d + 10);
    const event = playbackSpeed("today", run.floatDays[0]! - 2);
    expect(event).toBeLessThan(quiet);
  });
});

describe("mode, scrub and panels", () => {
  it("pulls the day back inside the new mode's run when switching", () => {
    story.scrub(1e6, true);
    story.scrub(1e6, false);
    story.setMode("twin");
    expect(story.get().day).toBeLessThanOrEqual(stopDay("twin"));
    story.setMode("today");
    expect(story.get().day).toBeLessThanOrEqual(stopDay("today"));
  });

  it("closes the comparison panel on a mode switch", () => {
    story.setPanel("compare");
    story.setMode("twin");
    expect(story.get().panel).toBe("none");
  });

  it("pauses and clamps while scrubbing", () => {
    story.togglePlay();
    story.scrub(-1e6, true);
    expect(story.get().playing).toBe(false);
    expect(story.get().day).toBe(FIRST_DAY);
    expect(names()).toEqual(["play", "scrub"]);
  });

  it("jumps to the card day when the card opens", () => {
    story.setPanel("card");
    expect(story.get().day).toBe(storyData().well.card.day_d + 0.5);
  });

  it("ignores a view or mode it is already on", () => {
    story.setView("well");
    story.setMode("today");
    expect(story.events).toEqual([]);
  });
});

describe("field drag", () => {
  it("goes from overload to re-sequencing to resolved on the story clock", () => {
    story.fieldDrag(-14);
    story.fieldDrop(true);
    expect(story.get().field.stage).toBe("overload");
    play(FIELD_TIMING.overload_ms);
    expect(story.get().field.stage).toBe("resolving");
    play(FIELD_TIMING.resolve_ms);
    expect(story.get().field.stage).toBe("resolved");
    expect(names()).toEqual(["drag", "drop, generators over capacity", "twin re-sequencing", "proposal fits"]);
  });

  it("resolves at once when the drop fits the generators", () => {
    story.fieldDrag(3);
    story.fieldDrop(false);
    expect(story.get().field.stage).toBe("resolved");
  });

  it("returns to idle when the slot is dropped where it started", () => {
    story.fieldDrag(0);
    story.fieldDrop(true);
    expect(story.get().field.stage).toBe("idle");
  });

  it("ignores drags once the field has resolved, until it is reset", () => {
    story.fieldDrag(5);
    story.fieldDrop(false);
    story.fieldDrag(9);
    expect(story.get().field.delta).toBe(5);
    story.fieldReset();
    expect(story.get().field).toMatchObject({ stage: "idle", delta: 0 });
  });
});

describe("subscriptions", () => {
  it("notifies listeners with a fresh snapshot and stops after unsubscribe", () => {
    const seen: number[] = [];
    const off = story.subscribe(() => seen.push(story.get().t));
    const before = story.get();
    story.advance(100);
    expect(story.get()).not.toBe(before);
    off();
    story.advance(100);
    expect(seen).toEqual([100]);
  });
});
