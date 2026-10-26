import { FieldModel } from "@bgw/optimise";
import { describe, expect, it } from "vitest";
import { dataset } from "@/lib/dataset";
import { DEFAULT_FOCUS_WELL, resolveFocusWell } from "../focus-well";

const cssIds = new FieldModel(dataset).cssWells.map((w) => w.id);

describe("resolveFocusWell", () => {
  it("opens the default well when the link names none", () => {
    expect(resolveFocusWell(null, cssIds)).toBe(DEFAULT_FOCUS_WELL);
    expect(resolveFocusWell("", cssIds)).toBe(DEFAULT_FOCUS_WELL);
    expect(resolveFocusWell("   ", cssIds)).toBe(DEFAULT_FOCUS_WELL);
  });

  it("keeps a cyclic-steam well the link names", () => {
    expect(resolveFocusWell("BGW-7", cssIds)).toBe("BGW-7");
    expect(resolveFocusWell("BGW-50", cssIds)).toBe("BGW-50");
  });

  it("matches ids without regard to case or spaces", () => {
    expect(resolveFocusWell(" bgw-7 ", cssIds)).toBe("BGW-7");
  });

  it("falls back for a cold well, which the twin screens cannot draw", () => {
    expect(cssIds).not.toContain("BGW-1");
    expect(resolveFocusWell("BGW-1", cssIds)).toBe(DEFAULT_FOCUS_WELL);
  });

  it("falls back for an id outside the field", () => {
    expect(resolveFocusWell("BGW-99", cssIds)).toBe(DEFAULT_FOCUS_WELL);
    expect(resolveFocusWell("<script>", cssIds)).toBe(DEFAULT_FOCUS_WELL);
  });

  it("defaults to a well the twin screens can draw", () => {
    expect(cssIds).toContain(DEFAULT_FOCUS_WELL);
  });
});
