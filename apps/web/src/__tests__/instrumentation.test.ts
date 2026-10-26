import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

afterEach(() => vi.restoreAllMocks());

describe("onRequestError", () => {
  it("logs a server error as one JSON line with its request and route", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(
      Object.assign(new Error("dataset missing"), { digest: "4021" }),
      { path: "/calendar?hold=overload", method: "GET", headers: { cookie: "secret" } },
      {
        routerKind: "App Router",
        routePath: "/(twin)/calendar",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );
    expect(err).toHaveBeenCalledOnce();
    const line = JSON.parse(err.mock.calls[0]![0]);
    expect(line).toMatchObject({
      level: "error",
      logger: "twin_web",
      msg: "request failed",
      error: "Error",
      error_message: "dataset missing",
      digest: "4021",
      method: "GET",
      path: "/calendar?hold=overload",
      route: "/(twin)/calendar",
      route_type: "render",
    });
    // Request headers can carry cookies, so they stay out of the log.
    expect(JSON.stringify(line)).not.toContain("secret");
  });
});
