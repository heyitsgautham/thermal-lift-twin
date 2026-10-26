// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";
import { clock } from "../clock";
import { momentAt, storyData } from "../data";
import { Hud } from "../hud/hud";
import { DURATION, dayAt, HUD, modeAt, SCENES, TWIN_CLICK } from "../script";
import { FIELD_SOURCES, MODEL_SOURCES } from "../sources";

const data = storyData();

/** Renders the HUD at story time t, the way a recorder steps the clock. */
function at(t: number) {
  act(() => clock.set(t));
}

/** The rod-float count the HUD shows, or null when its panel is down. */
function floatCount(): number | null {
  const label = screen.queryByText("Rod-float days");
  return label ? Number(label.nextElementSibling!.textContent) : null;
}

beforeAll(() => {
  render(<Hud data={data} />);
});
afterEach(() => at(0));
afterAll(cleanup);

describe("story HUD over the 3D scene", () => {
  it("renders every scene of the script without throwing", () => {
    for (const scene of SCENES) {
      for (const t of [scene.start, (scene.start + scene.end) / 2, scene.end - 0.01]) expect(() => at(t)).not.toThrow();
    }
  });

  it("opens with the product's name and no counters", () => {
    at(5);
    expect(document.body.textContent).toContain(BRAND.product);
    expect(floatCount()).toBeNull();
  });

  it("counts today's rod-float days as the day advances", () => {
    const t = HUD.floatCounter[0] + 10;
    at(t);
    expect(modeAt(t)).toBe("today");
    expect(floatCount()).toBe(momentAt(data.well, "today", dayAt(t)).floatDaysSoFar);
    const late = HUD.apart[0] - 1;
    at(late);
    expect(floatCount()).toBe(momentAt(data.well, "today", dayAt(late)).floatDaysSoFar);
    expect(floatCount()).toBeGreaterThan(0);
  });

  it("shows no float days once the twin runs the pump", () => {
    const t = TWIN_CLICK + 20;
    at(t);
    expect(modeAt(t)).toBe("twin");
    expect(floatCount()).toBe(0);
  });

  it("puts up the two decisions, the card and the field scheduler in turn", () => {
    at((HUD.apart[0] + HUD.apart[1]) / 2);
    expect(screen.queryByText("Today, two decisions")).not.toBeNull();
    at((HUD.card[0] + HUD.card[1]) / 2);
    expect(screen.queryByText("Twin, slow downstroke")).not.toBeNull();
    expect(screen.queryByText("Today, two decisions")).toBeNull();
    at((HUD.fieldHud[0] + HUD.fieldHud[1]) / 2);
    expect(screen.queryByText("Steam schedule, next 90 days")).not.toBeNull();
  });

  it("lists every source in the closing scene", () => {
    at((HUD.sources[0] + HUD.sources[1]) / 2);
    expect(screen.queryByText("How we built it")).not.toBeNull();
    for (const s of [...FIELD_SOURCES, ...MODEL_SOURCES]) expect(document.body.textContent).toContain(s.label);
  });

  it("ends on the end card", () => {
    at(DURATION - 1);
    expect(screen.queryByText("Steam on the right day, and run the pump to the cooling curve.")).not.toBeNull();
  });
});
