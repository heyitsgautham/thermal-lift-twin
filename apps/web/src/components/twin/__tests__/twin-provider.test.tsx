// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TwinProvider, useTwinContext } from "../twin-provider";

function FocusWell() {
  const { focusWell } = useTwinContext();
  return <output data-testid="focus">{focusWell}</output>;
}

function openWith(search: string) {
  window.history.replaceState(null, "", `/pump${search}`);
  render(
    <TwinProvider fallback={<div>loading</div>}>
      <FocusWell />
    </TwinProvider>,
  );
  return screen.getByTestId("focus").textContent;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("TwinProvider focus well", () => {
  it("opens BGW-14 without a well in the link", () => {
    expect(openWith("")).toBe("BGW-14");
  });

  it("opens the cyclic-steam well a link names", () => {
    expect(openWith("?well=BGW-7")).toBe("BGW-7");
  });

  it("opens BGW-14 for a link to a cold well instead of crashing the screens", () => {
    expect(openWith("?well=BGW-1")).toBe("BGW-14");
  });

  it("opens BGW-14 for a link to a well that does not exist", () => {
    expect(openWith("?well=BGW-99")).toBe("BGW-14");
  });
});
