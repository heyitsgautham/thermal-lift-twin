import { describe, expect, it } from "vitest";
import { dataset } from "@/lib/dataset";
import pkg from "../../../../../package.json";
import { GET } from "../route";

describe("GET /api/health", () => {
  it("answers ok with the app version and the dataset it serves", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      service: "web",
      version: pkg.version,
      data: "synthetic",
      dataset: { seed: dataset.meta.seed, asOf: dataset.meta.asOf, generatorVersion: dataset.meta.generatorVersion },
    });
  });

  it("is never cached, so a probe always reaches the server", () => {
    expect(GET().headers.get("cache-control")).toBe("no-store");
  });
});
