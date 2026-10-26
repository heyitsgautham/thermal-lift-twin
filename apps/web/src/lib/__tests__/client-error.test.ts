import { describe, expect, it } from "vitest";
import { LIMITS, parseClientErrorReport, toClientErrorReport } from "../client-error";

const valid = { kind: "render", message: "TypeError: x is undefined", path: "/pump" };

describe("toClientErrorReport", () => {
  it("names the error type in the message and keeps the stack", () => {
    const err = new TypeError("x is undefined");
    const r = toClientErrorReport(err, "uncaught", "/calendar");
    expect(r).toMatchObject({ kind: "uncaught", message: "TypeError: x is undefined", path: "/calendar" });
    expect(r.stack).toContain("x is undefined");
  });

  it("carries a server component's digest", () => {
    const err = Object.assign(new Error("hidden"), { digest: "2913" });
    expect(toClientErrorReport(err, "render", "/map").digest).toBe("2913");
  });

  it("describes thrown values that are not errors", () => {
    expect(toClientErrorReport("plain text", "rejection", "/").message).toBe("plain text");
    expect(toClientErrorReport(undefined, "rejection", "/").message).toBe("Non-error value thrown: undefined");
    expect(toClientErrorReport({ code: 1 }, "rejection", "/").message).toBe("Non-error value thrown: object");
  });

  it("trims every field to what the server accepts", () => {
    const err = new Error("m".repeat(5000));
    err.stack = "s".repeat(10_000);
    const r = toClientErrorReport(err, "render", "/" + "p".repeat(1000));
    expect(r.message.length).toBe(LIMITS.message);
    expect(r.stack!.length).toBe(LIMITS.stack);
    expect(r.path.length).toBe(LIMITS.path);
    expect(parseClientErrorReport(r)).toEqual(r);
  });
});

describe("parseClientErrorReport", () => {
  it("accepts a well-formed report", () => {
    expect(parseClientErrorReport(valid)).toEqual(valid);
    expect(parseClientErrorReport({ ...valid, digest: "1", stack: "at x" })).toEqual({ ...valid, digest: "1", stack: "at x" });
  });

  it("drops keys it does not know", () => {
    expect(parseClientErrorReport({ ...valid, level: "debug", msg: "spoof" })).toEqual(valid);
  });

  it.each([
    ["null", null],
    ["an array", [valid]],
    ["a string", "boom"],
    ["an unknown kind", { ...valid, kind: "fatal" }],
    ["an empty message", { ...valid, message: "" }],
    ["a long message", { ...valid, message: "m".repeat(LIMITS.message + 1) }],
    ["a path that is a URL", { ...valid, path: "https://evil.example/" }],
    ["a numeric digest", { ...valid, digest: 12 }],
    ["a long stack", { ...valid, stack: "s".repeat(LIMITS.stack + 1) }],
  ])("rejects %s", (_name, body) => {
    expect(parseClientErrorReport(body)).toBeNull();
  });
});
