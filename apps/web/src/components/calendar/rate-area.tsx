import type { DayCell } from "@bgw/optimise";
import type { Geometry } from "./geometry";
import { phaseRuns } from "./runs";

// The drawing pieces under a calendar row: the oil-rate area of its
// production runs, and the hatch patterns its down days and changes fill with.

/** Oil-rate area for the production runs of one track, as SVG paths. */
export function RateArea({
  days,
  geo,
  height,
  rateMax,
  opacity = 1,
}: {
  days: readonly DayCell[];
  geo: Geometry;
  height: number;
  rateMax: number;
  opacity?: number;
}) {
  const runs = phaseRuns(days);
  const yOf = (q: number) => height - Math.min(1, q / rateMax) * (height - 1);
  return (
    <>
      {runs.map((run) => {
        const x0 = run.from * geo.dayPx;
        const x1 = (run.to + 1) * geo.dayPx;
        if (run.phase === "produce") {
          const pts: string[] = [`${x0},${height}`];
          pts.push(`${x0},${yOf(days[run.from]!.oil_bbl_per_d)}`);
          for (let d = run.from; d <= run.to; d++) {
            pts.push(`${d * geo.dayPx + geo.dayPx / 2},${yOf(days[d]!.oil_bbl_per_d)}`);
          }
          pts.push(`${x1},${yOf(days[run.to]!.oil_bbl_per_d)}`, `${x1},${height}`);
          const top = pts.slice(1, -1).join(" ");
          return (
            <g key={`p-${run.from}`} opacity={opacity}>
              <rect x={x0} width={x1 - x0} y={0} height={height} fill="var(--produce)" opacity={0.08} />
              <polygon points={pts.join(" ")} fill="var(--produce)" opacity={0.5} />
              <polyline points={top} fill="none" stroke="var(--produce)" strokeWidth={1.1} />
            </g>
          );
        }
        if (run.phase === "down") {
          return (
            <g key={`d-${run.from}`}>
              <rect x={x0} width={x1 - x0} y={0} height={height} fill="url(#hatch-down)" />
              <rect x={x0 + 0.5} width={x1 - x0 - 1} y={0.5} height={height - 1} fill="none" stroke="var(--down)" />
            </g>
          );
        }
        return null;
      })}
    </>
  );
}

export function PatternDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <pattern id="hatch-down" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="var(--down)" opacity="0.22" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--down)" strokeWidth="1.6" />
        </pattern>
        <pattern id="hatch-shift" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="6" height="6" fill="var(--shift)" opacity="0.13" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--shift)" strokeOpacity="0.45" strokeWidth="1.4" />
        </pattern>
      </defs>
    </svg>
  );
}
