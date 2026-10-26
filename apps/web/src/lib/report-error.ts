import { CLIENT_ERROR_ENDPOINT, toClientErrorReport, type ClientErrorKind, type ClientErrorReport } from "./client-error";

// Sends browser errors to the web server, which logs them as JSON lines.
// A three.js scene that throws inside its frame loop raises the same error
// sixty times a second, so each distinct error goes once per page load, and
// a page sends at most MAX_REPORTS in all.

export const MAX_REPORTS = 10;

export type Send = (report: ClientErrorReport) => void;

/** Posts with sendBeacon, which survives a page unload, or fetch where the browser lacks it. */
export const beacon: Send = (report) => {
  const body = JSON.stringify(report);
  try {
    if (navigator.sendBeacon?.(CLIENT_ERROR_ENDPOINT, new Blob([body], { type: "application/json" }))) return;
    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never throw on top of the error it reports.
  }
};

export function createReporter(send: Send = beacon) {
  const seen = new Set<string>();
  return (err: unknown, kind: ClientErrorKind, path = window.location.pathname): boolean => {
    const report = toClientErrorReport(err, kind, path);
    const key = `${report.kind}|${report.message}|${report.path}`;
    if (seen.has(key) || seen.size >= MAX_REPORTS) return false;
    seen.add(key);
    send(report);
    return true;
  };
}

/** The page's reporter, shared by the error boundaries and the window listeners. */
export const reportClientError = createReporter();

/** Reports uncaught errors and unhandled promise rejections. Returns a function that stops it. */
export function installErrorReporting(target: Window, report = reportClientError): () => void {
  const onError = (e: ErrorEvent) => report(e.error ?? e.message, "uncaught");
  const onRejection = (e: PromiseRejectionEvent) => report(e.reason, "rejection");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
