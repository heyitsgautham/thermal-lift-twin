import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { contentSecurityPolicy, securityHeaders } from "../security-headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split("; ").map((d) => [d.split(" ")[0]!, d.split(" ").slice(1)]));
}

describe("content security policy", () => {
  const prod = directives(contentSecurityPolicy(false));

  it("loads everything from this origin only", () => {
    expect(prod.get("default-src")).toEqual(["'self'"]);
    expect(prod.get("font-src")).toEqual(["'self'"]);
    expect(prod.get("connect-src")).toEqual(["'self'"]);
    for (const sources of prod.values()) {
      expect(sources.some((s) => s.startsWith("http") || s === "*")).toBe(false);
    }
  });

  it("forbids framing, plugins and eval in production", () => {
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows the data and blob images the scenes draw", () => {
    expect(prod.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("lets fast refresh evaluate and connect in development only", () => {
    const dev = directives(contentSecurityPolicy(true));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
  });
});

describe("next.config", () => {
  it("sends the security headers on every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders(false) }]);
    const keys = rules[0]!.headers.map((h) => h.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]);
  });

  it("hides the X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
