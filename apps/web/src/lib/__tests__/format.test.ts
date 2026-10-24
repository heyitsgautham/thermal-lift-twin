import { describe, expect, it } from "vitest";
import { fmtFixed, fmtInt, fmtPercent, fmtShift, fmtSigned } from "../format";

describe("number formatting", () => {
  it("rounds integers and groups thousands", () => {
    expect(fmtInt(1269.6)).toBe("1,270");
    expect(fmtInt(-52.4)).toBe("-52");
    expect(fmtFixed(2.345, 1)).toBe("2.3");
  });

  it("signs a delta with a true minus sign", () => {
    expect(fmtSigned(1270)).toBe("+1,270");
    expect(fmtSigned(-52)).toBe("−52");
    expect(fmtSigned(-0.25, 1)).toBe("−0.3");
  });

  it("prints a delta that rounds to zero as ±0", () => {
    expect(fmtSigned(0)).toBe("±0");
    expect(fmtSigned(0.4)).toBe("±0");
    expect(fmtSigned(-0.04, 1)).toBe("±0");
  });

  it("formats a fraction as a signed percentage", () => {
    expect(fmtPercent(0.123)).toBe("+12.3%");
    expect(fmtPercent(-0.05, 0)).toBe("−5%");
  });

  it("formats a day shift in either direction", () => {
    expect(fmtShift(3)).toBe("+3 d");
    expect(fmtShift(-14)).toBe("−14 d");
  });
});
