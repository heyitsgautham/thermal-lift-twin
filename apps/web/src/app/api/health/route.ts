import { dataset } from "@/lib/dataset";
import pkg from "../../../../package.json";

// Liveness for Docker's healthcheck and load balancers. It answers from the
// running server without rendering a page, and names the dataset build it serves.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const { seed, asOf, generatorVersion } = dataset.meta;
  return Response.json(
    { status: "ok", service: "web", version: pkg.version, data: "synthetic", dataset: { seed, asOf, generatorVersion } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
