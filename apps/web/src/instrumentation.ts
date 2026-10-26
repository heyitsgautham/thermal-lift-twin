import type { Instrumentation } from "next";
import { errorFields, log } from "@/lib/log";

// Next.js calls this for every error it catches on the server: a failed page
// render, a route handler that throws, or a proxy error. Each one becomes a
// JSON log line with the request and route it came from.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  log("error", "request failed", {
    ...errorFields(err),
    method: request.method,
    path: request.path,
    route: context.routePath,
    route_type: context.routeType,
    router: context.routerKind,
  });
};
