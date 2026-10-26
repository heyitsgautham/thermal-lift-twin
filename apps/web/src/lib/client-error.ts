// The report a browser sends to POST /api/client-errors when the app throws.
// Both sides share these limits: the browser trims to them before sending, and
// the server rejects anything over them, since the endpoint takes anonymous input.

export const CLIENT_ERROR_ENDPOINT = "/api/client-errors";

export const CLIENT_ERROR_KINDS = ["render", "uncaught", "rejection"] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export const LIMITS = { message: 500, path: 300, digest: 64, stack: 4000, body: 8192 } as const;

export interface ClientErrorReport {
  /** "render" from an error boundary, "uncaught" from window.onerror, "rejection" from an unhandled promise. */
  kind: ClientErrorKind;
  message: string;
  /** The page's path, such as /calendar. */
  path: string;
  /** Next's hash of an error from a server component, matching the server log. */
  digest?: string;
  stack?: string;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Builds a report from whatever was thrown, trimmed to the limits. */
export function toClientErrorReport(err: unknown, kind: ClientErrorKind, path: string): ClientErrorReport {
  const e = err instanceof Error ? err : null;
  const message = e ? `${e.name}: ${e.message}` : typeof err === "string" ? err : `Non-error value thrown: ${typeof err}`;
  const digest = e && "digest" in e && typeof e.digest === "string" ? clip(e.digest, LIMITS.digest) : undefined;
  return {
    kind,
    message: clip(message || "Unknown error", LIMITS.message),
    path: clip(path.startsWith("/") ? path : "/", LIMITS.path),
    ...(digest ? { digest } : {}),
    ...(e?.stack ? { stack: clip(e.stack, LIMITS.stack) } : {}),
  };
}

function optionalString(v: unknown, max: number): string | undefined | null {
  if (v === undefined) return undefined;
  return typeof v === "string" && v.length <= max ? v : null;
}

/**
 * Validates a report the server received. Returns null for anything that is
 * not a well-formed report within the limits, and drops keys it does not know.
 */
export function parseClientErrorReport(body: unknown): ClientErrorReport | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!CLIENT_ERROR_KINDS.includes(b.kind as ClientErrorKind)) return null;
  if (typeof b.message !== "string" || b.message.length === 0 || b.message.length > LIMITS.message) return null;
  if (typeof b.path !== "string" || !b.path.startsWith("/") || b.path.length > LIMITS.path) return null;
  const digest = optionalString(b.digest, LIMITS.digest);
  const stack = optionalString(b.stack, LIMITS.stack);
  if (digest === null || stack === null) return null;
  return {
    kind: b.kind as ClientErrorKind,
    message: b.message,
    path: b.path,
    ...(digest ? { digest } : {}),
    ...(stack ? { stack } : {}),
  };
}
