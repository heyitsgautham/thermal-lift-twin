import { FieldModel } from "@bgw/optimise";
import { render } from "@testing-library/react";
import { TwinProvider } from "@/components/twin/twin-provider";
import { dataset } from "@/lib/dataset";

// Shared by the screen tests: jsdom has no layout, so charts measure a fixed
// box, and every screen renders inside the app's twin, as it does in a page.

export function stubLayout() {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 1400, bottom: 700, width: 1400, height: 700, toJSON() {} });
}

export function renderInTwin(ui: React.ReactNode) {
  return render(<TwinProvider fallback={<div>loading</div>}>{ui}</TwinProvider>);
}

export const field = new FieldModel(dataset);

/** The capacity the twin opens with, from the dataset's assumptions. */
export const defaultCapacity = {
  units: dataset.assumptions.generatorUnits,
  unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
};

/** The issued plan as the twin evaluates it when a screen opens. */
export const openingView = field.evaluate(dataset.issuedPlan, defaultCapacity);
