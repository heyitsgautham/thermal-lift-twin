// @vitest-environment jsdom
import { FieldModel } from "@bgw/optimise";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { TwinProvider } from "@/components/twin/twin-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { dataset } from "@/lib/dataset";
import { dateRange } from "@/lib/dates";
import { SteamCalendar } from "../steam-calendar";

const field = new FieldModel(dataset);
const cssWells = dataset.wells.filter((w) => w.status === "css");

beforeAll(() => {
  // jsdom has no layout, so the calendar sheet measures a 1920 x 900 box.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 1920, bottom: 900, width: 1920, height: 900, toJSON() {} });
});
afterEach(cleanup);

function renderCalendar() {
  // The root layout supplies the tooltip provider in the app.
  render(
    <TooltipProvider>
      <TwinProvider fallback={<div>loading</div>}>
        <SteamCalendar />
      </TwinProvider>
    </TooltipProvider>,
  );
}

describe("steam calendar well rows", () => {
  it("draws one row for every steam well", () => {
    renderCalendar();
    for (const w of cssWells) expect(screen.getByTestId(`row-${w.id}`)).toBeTruthy();
  });

  it("places each issued slot on its start day and names its steam dates", () => {
    renderCalendar();
    for (const slot of dataset.issuedPlan) {
      const block = screen.getAllByTestId(`slot-${slot.wellId}`).find((b) => b.dataset.slotId === slot.id)!;
      expect(Number(block.dataset.startDay)).toBe(slot.start_d);
      const label = `${slot.wellId} steam ${dateRange(dataset.meta.asOf, slot.start_d, slot.start_d + slot.injection_d - 1)}`;
      expect(block.getAttribute("aria-label")).toBe(label);
    }
  });

  it("marks each row with the day the re-steam rule picks", () => {
    renderCalendar();
    for (const w of cssWells) {
      expect(Number(screen.getByTestId(`row-${w.id}`).dataset.resteamDay)).toBe(field.currentResteam(w.id).day_d);
    }
  });

  it("lets the engineer drag planned slots but not a cycle already steaming", () => {
    renderCalendar();
    const blocks = [...document.querySelectorAll<HTMLElement>("[aria-roledescription]")];
    const planned = blocks.filter((b) => b.dataset.slotId);
    const running = blocks.filter((b) => !b.dataset.slotId);
    expect(planned).toHaveLength(dataset.issuedPlan.length);
    expect(running.length).toBeGreaterThan(0);
    for (const b of planned) expect(b.getAttribute("aria-roledescription")).toBe("steam slot, draggable");
    for (const b of running) expect(b.getAttribute("aria-roledescription")).toBe("steam cycle in progress");
  });
});
