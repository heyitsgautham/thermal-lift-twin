import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/lib/client-error";
import { POST } from "../route";

afterEach(() => vi.restoreAllMocks());

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/client-errors", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

describe("POST /api/client-errors", () => {
  it("logs a valid report as one JSON error line and answers 204", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(JSON.stringify({ kind: "render", message: "Error: boom", path: "/calendar", digest: "77" }), {
      "user-agent": "HeadlessChrome",
    });
    expect(res.status).toBe(204);
    expect(err).toHaveBeenCalledOnce();
    expect(JSON.parse(err.mock.calls[0]![0])).toMatchObject({
      level: "error",
      logger: "twin_web",
      msg: "client error",
      kind: "render",
      message: "Error: boom",
      path: "/calendar",
      digest: "77",
      user_agent: "HeadlessChrome",
    });
  });

  it("answers 400 to a body that is not JSON", async () => {
    const res = await post("{kind:");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body is not JSON" });
  });

  it("answers 400 to JSON that is not a report, and logs nothing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(JSON.stringify({ kind: "render", message: "x", path: "https://evil.example" }));
    expect(res.status).toBe(400);
    expect(err).not.toHaveBeenCalled();
  });

  it("answers 413 to a body over the limit", async () => {
    const res = await post("x".repeat(LIMITS.body + 1));
    expect(res.status).toBe(413);
  });

  it("answers 413 from the declared length before reading the body", async () => {
    const res = await post("{}", { "content-length": String(LIMITS.body * 10) });
    expect(res.status).toBe(413);
  });
});
