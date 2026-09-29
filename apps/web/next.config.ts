import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@bgw/physics", "@bgw/optimise", "@bgw/simulate"],
  agentRules: false,
  devIndicators: false,
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
