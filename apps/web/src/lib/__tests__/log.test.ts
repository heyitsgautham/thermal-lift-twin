import { afterEach, describe, expect, it, vi } from "vitest";
import { errorFields, log, logLine, parseLevel } from "../log";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseLevel", () => {
  it("reads the API's LOG_LEVEL spellings", () => {
    expect(parseLevel("DEBUG")).toBe("debug");
    expect(parseLevel(" Warning ")).toBe("warn");
    expect(parseLevel("ERROR")).toBe("error");
  });

  it("defaults to info for an unset or unknown level", () => {
    expect(parseLevel(undefined)).toBe("info");
    expect(parseLevel("")).toBe("info");
    expect(parseLevel("verbose")).toBe("info");
  });
});

describe("logLine", () => {
  const now = new Date("2026-10-26T12:00:00.000Z");

  it("writes the standard keys, then the fields", () => {
    expect(JSON.parse(logLine("info", "started", { port: 3000 }, now))).toEqual({
      port: 3000,
      ts: "2026-10-26T12:00:00.000Z",
      level: "info",
      logger: "twin_web",
      msg: "started",
    });
  });

  it("keeps the standard keys when a field reuses their names", () => {
    const line = JSON.parse(logLine("warn", "real", { msg: "fake", level: "debug" }, now));
    expect(line.msg).toBe("real");
    expect(line.level).toBe("warn");
  });

  it("stays one line when a field holds a newline", () => {
    expect(logLine("error", "boom", { stack: "a\nb" }, now)).not.toContain("\n");
  });

  it("prints a bigint instead of throwing", () => {
    expect(JSON.parse(logLine("info", "n", { n: 10n }, now)).n).toBe("10");
  });
});

describe("errorFields", () => {
  it("keeps an Error's name, message, digest and stack", () => {
    const err = Object.assign(new TypeError("bad well"), { digest: "123" });
    const f = errorFields(err);
    expect(f).toMatchObject({ error: "TypeError", error_message: "bad well", digest: "123" });
    expect(f.stack).toContain("bad well");
  });

  it("describes a thrown value that is not an Error", () => {
    expect(errorFields("nope")).toEqual({ error: "string", error_message: "nope" });
  });
});

describe("log", () => {
  it("sends info to stdout and errors to stderr", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log("info", "hello");
    log("error", "boom");
    expect(JSON.parse(out.mock.calls[0]![0]).msg).toBe("hello");
    expect(JSON.parse(err.mock.calls[0]![0]).msg).toBe("boom");
  });

  it("drops lines below LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "WARNING");
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log("debug", "quiet");
    log("info", "quiet");
    log("warn", "loud");
    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledOnce();
  });
});
