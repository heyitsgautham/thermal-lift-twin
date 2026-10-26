// Server-side JSON logging for the web app: one object per line, in the same
// shape the API writes (ts, level, logger, msg, then any fields), so one log
// shipper can parse both services. LOG_LEVEL sets the floor, info by default.

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const LOGGER = "twin_web";

/** The level LOG_LEVEL names, accepting the API's spellings such as WARNING. */
export function parseLevel(value: string | undefined): LogLevel {
  const v = value?.trim().toLowerCase();
  if (v === "warning") return "warn";
  return v && v in RANK ? (v as LogLevel) : "info";
}

/** Turns an Error into plain fields, since JSON.stringify drops its message and stack. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) {
    const digest = "digest" in err && typeof err.digest === "string" ? err.digest : undefined;
    return { error: err.name, error_message: err.message, digest, stack: err.stack };
  }
  return { error: typeof err, error_message: String(err) };
}

/** One log line. The standard keys always win over a field of the same name. */
export function logLine(level: LogLevel, msg: string, fields: LogFields = {}, now = new Date()): string {
  return JSON.stringify({ ...fields, ts: now.toISOString(), level, logger: LOGGER, msg }, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

/** Writes one line to stdout, or to stderr for warn and error, if LOG_LEVEL lets it through. */
export function log(level: LogLevel, msg: string, fields?: LogFields): void {
  if (RANK[level] < RANK[parseLevel(process.env.LOG_LEVEL)]) return;
  const line = logLine(level, msg, fields);
  if (RANK[level] >= RANK.warn) console.error(line);
  else console.log(line);
}
