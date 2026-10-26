// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ClientErrorReport } from "../client-error";
import { beacon, createReporter, installErrorReporting, MAX_REPORTS } from "../report-error";

// jsdom prints every error event nobody cancels; these are raised on purpose.
const quiet = (e: ErrorEvent) => e.preventDefault();
beforeAll(() => window.addEventListener("error", quiet));
afterAll(() => window.removeEventListener("error", quiet));
afterEach(() => vi.unstubAllGlobals());

function capture() {
  const sent: ClientErrorReport[] = [];
  return { sent, report: createReporter((r) => sent.push(r)) };
}

describe("createReporter", () => {
  it("sends a report for the current page", () => {
    window.history.replaceState(null, "", "/what-if");
    const { sent, report } = capture();
    expect(report(new Error("solver diverged"), "render")).toBe(true);
    expect(sent).toEqual([expect.objectContaining({ kind: "render", message: "Error: solver diverged", path: "/what-if" })]);
  });

  it("sends each distinct error once, like one thrown on every frame", () => {
    const { sent, report } = capture();
    for (let i = 0; i < 60; i++) report(new Error("bad uniform"), "uncaught", "/story-3d");
    report(new Error("bad uniform"), "uncaught", "/story");
    expect(sent.map((r) => r.path)).toEqual(["/story-3d", "/story"]);
  });

  it(`stops after ${MAX_REPORTS} reports a page`, () => {
    const { sent, report } = capture();
    for (let i = 0; i < 25; i++) report(new Error(`e${i}`), "uncaught", "/map");
    expect(sent).toHaveLength(MAX_REPORTS);
  });
});

describe("installErrorReporting", () => {
  it("reports uncaught errors and unhandled rejections until removed", () => {
    const report = vi.fn(() => true);
    const stop = installErrorReporting(window, report);
    const err = new RangeError("depth out of range");
    window.dispatchEvent(new ErrorEvent("error", { error: err, message: err.message }));
    const rejection = Object.assign(new Event("unhandledrejection"), { reason: "timeout" });
    window.dispatchEvent(rejection);
    expect(report).toHaveBeenNthCalledWith(1, err, "uncaught");
    expect(report).toHaveBeenNthCalledWith(2, "timeout", "rejection");

    stop();
    window.dispatchEvent(new ErrorEvent("error", { error: err }));
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("falls back to the event message when a cross-origin script hides the error", () => {
    const report = vi.fn(() => true);
    const stop = installErrorReporting(window, report);
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    stop();
    expect(report).toHaveBeenCalledWith("Script error.", "uncaught");
  });
});

describe("beacon", () => {
  const report: ClientErrorReport = { kind: "render", message: "Error: x", path: "/" };

  it("posts the report with sendBeacon", () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    beacon(report);
    expect(sendBeacon).toHaveBeenCalledWith("/api/client-errors", expect.any(Blob));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to fetch with keepalive when sendBeacon is missing or refuses", () => {
    vi.stubGlobal("navigator", { sendBeacon: () => false });
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetch);
    beacon(report);
    expect(fetch).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({ method: "POST", keepalive: true, body: JSON.stringify(report) }),
    );
  });

  it("never throws, even when sending fails", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("blocked");
      },
    });
    expect(() => beacon(report)).not.toThrow();
  });
});
