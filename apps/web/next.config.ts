import path from "node:path";
import type { NextConfig } from "next";

const root = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone to ship a self-contained server.
  // Local `pnpm build` and `pnpm start` keep the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  outputFileTracingRoot: root,
  transpilePackages: ["@bgw/physics", "@bgw/optimise", "@bgw/simulate"],
  agentRules: false,
  devIndicators: false,
  turbopack: {
    root,
  },
};

export default nextConfig;
