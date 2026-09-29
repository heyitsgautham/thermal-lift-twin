import type { DayCell, Phase } from "@bgw/optimise";

export interface DayRun {
  from: number;
  to: number;
}

/** Groups sorted day indices into inclusive runs of consecutive days. */
export function runsOf(days: readonly number[]): DayRun[] {
  const runs: DayRun[] = [];
  for (const d of days) {
    const last = runs.at(-1);
    if (last && d === last.to + 1) last.to = d;
    else runs.push({ from: d, to: d });
  }
  return runs;
}

export interface PhaseRun extends DayRun {
  phase: Phase;
  cycleNumber: number | null;
  slotId: string | null;
}

/** Splits a well's days into runs of one phase within one cycle. */
export function phaseRuns(days: readonly DayCell[]): PhaseRun[] {
  const runs: PhaseRun[] = [];
  days.forEach((cell, d) => {
    const last = runs.at(-1);
    if (last && last.phase === cell.phase && last.slotId === cell.slotId && last.cycleNumber === cell.cycleNumber) {
      last.to = d;
    } else {
      runs.push({ from: d, to: d, phase: cell.phase, cycleNumber: cell.cycleNumber, slotId: cell.slotId });
    }
  });
  return runs;
}

/** Runs of days where two timelines of the same well are in different phases. */
export function differenceRuns(a: readonly DayCell[], b: readonly DayCell[]): DayRun[] {
  const days: number[] = [];
  for (let d = 0; d < a.length; d++) if (a[d]!.phase !== b[d]!.phase) days.push(d);
  return runsOf(days);
}
