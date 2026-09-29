const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function fmtInt(n: number): string {
  return INT.format(Math.round(n));
}

export function fmtFixed(n: number, digits: number): string {
  return n.toFixed(digits);
}

/** "+1,270" or "−52", with a true minus sign. Zero prints as "±0". */
export function fmtSigned(n: number, digits = 0): string {
  const r = Number(n.toFixed(digits));
  if (r === 0) return "±0";
  const body = digits === 0 ? INT.format(Math.abs(r)) : Math.abs(r).toFixed(digits);
  return `${r > 0 ? "+" : "−"}${body}`;
}

export function fmtPercent(n: number, digits = 1): string {
  return `${fmtSigned(n * 100, digits)}%`;
}

/** "+3 d" or "−14 d" */
export function fmtShift(days: number): string {
  return `${days > 0 ? "+" : "−"}${Math.abs(days)} d`;
}
