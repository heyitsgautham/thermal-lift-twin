import { describe, expect, it } from "vitest";
import { baseUrl, viewports } from "./env";

describe("baseUrl", () => {
  it("uses BASE_URL when it is set", () => {
    expect(baseUrl("http://localhost:3000", { BASE_URL: "http://10.0.0.5:8080" })).toBe("http://10.0.0.5:8080");
  });

  it("keeps the script's default when BASE_URL is unset or blank", () => {
    expect(baseUrl("http://localhost:3101", {})).toBe("http://localhost:3101");
    expect(baseUrl("http://localhost:3101", { BASE_URL: "" })).toBe("http://localhost:3101");
    expect(baseUrl("http://localhost:3101", { BASE_URL: "  " })).toBe("http://localhost:3101");
  });

  it("drops a trailing slash so paths join cleanly", () => {
    expect(baseUrl("x", { BASE_URL: "http://localhost:3000/" })).toBe("http://localhost:3000");
  });

  it("rejects a value that is not an http URL", () => {
    expect(() => baseUrl("x", { BASE_URL: "localhost:3000/" })).toThrow(/http or https/);
    expect(() => baseUrl("x", { BASE_URL: "3000" })).toThrow(/absolute URL/);
  });
});

describe("viewports", () => {
  const fallback = "1920x1080,1440x900";

  it("parses each size", () => {
    expect(viewports(fallback, { VIEWPORTS: "1600x900, 1280x720" })).toEqual([
      { name: "1600x900", width: 1600, height: 900 },
      { name: "1280x720", width: 1280, height: 720 },
    ]);
  });

  it("keeps the default sizes when VIEWPORTS is unset or blank", () => {
    const sizes = [
      { name: "1920x1080", width: 1920, height: 1080 },
      { name: "1440x900", width: 1440, height: 900 },
    ];
    expect(viewports(fallback, {})).toEqual(sizes);
    expect(viewports(fallback, { VIEWPORTS: "" })).toEqual(sizes);
  });

  it("names the entry it cannot read", () => {
    expect(() => viewports(fallback, { VIEWPORTS: "1920x1080,1440" })).toThrow(/got "1440"/);
    expect(() => viewports(fallback, { VIEWPORTS: "1920x1080," })).toThrow(/got ""/);
    expect(() => viewports(fallback, { VIEWPORTS: "wide" })).toThrow(/1920x1080/);
  });
});
