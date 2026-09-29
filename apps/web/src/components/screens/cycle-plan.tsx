"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AxisX, AxisY, ChartFrame, GridY, linePath, linearScale, logScale, stepPath, type Scale } from "@/components/kit/chart";
import { Chip, Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { WellPicker } from "@/components/kit/well-picker";
import { useTwinContext } from "@/components/twin/twin-provider";
import { Button } from "@/components/ui/button";
import { buildCycleView, type CycleDay, type CycleView } from "@/lib/cycle-view";
import { dateRange, dateWithYear, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLAY_MS = 9000;

export function useCycleView(wellId: string): CycleView {
  const { twin } = useTwinContext();
  // The "was" marker compares with the plan as issued, so it survives adopting the proposal.
  const { dataset } = useTwinContext();
  const { field, proposal } = twin;
  const issued = dataset.issuedPlan;
  return useMemo(() => buildCycleView(field, wellId, proposal, issued), [field, proposal, issued, wellId]);
}

export function useCssWellOptions() {
  const { field } = useTwinContext().twin;
  return useMemo(
    () =>
      field.cssWells
        .map((w) => ({ id: w.id, number: w.number, note: `cycle ${field.anchorCycle(w.id).cycleNumber}` }))
        .sort((a, b) => a.number - b.number),
    [field],
  );
}

interface LaneGeom {
  top: number;
  height: number;
}

function lanes(y0: number, y1: number) {
  const phase: LaneGeom = { top: y0, height: 22 };
  const gap = 14;
  const rest = y1 - (phase.top + phase.height) - gap * 5;
  const shares = [0.22, 0.22, 0.21, 0.19, 0.16];
  let top = phase.top + phase.height + gap;
  const out: LaneGeom[] = shares.map((s) => {
    const g = { top, height: Math.floor(rest * s) };
    top += g.height + gap;
    return g;
  });
  return { phase, temp: out[0]!, visc: out[1]!, oil: out[2]!, spm: out[3]!, float: out[4]! };
}

function LaneTitle({ x, lane, title, unit }: { x: number; lane: LaneGeom; title: string; unit: string }) {
  return (
    <g>
      <text x={x} y={lane.top + 4} fontSize={10} className="smallcaps" style={{ fontWeight: 700 }} fill="var(--ink)">
        {title}
      </text>
      <text x={x} y={lane.top + 17} fontSize={9.5} className="font-mono" fill="var(--ink-3)">
        {unit}
      </text>
    </g>
  );
}

function series(days: CycleDay[], xs: Scale, pick: (d: CycleDay) => number | null): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const day of days) {
    const v = pick(day);
    if (v === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([xs(day.d + 0.5), v]);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function CyclePlanScreen() {
  const { dataset, focusWell, setFocusWell } = useTwinContext();
  const asOf = dataset.meta.asOf;
  const wells = useCssWellOptions();
  const view = useCycleView(focusWell);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, now - start) / PLAY_MS);
      setCursor(Math.round(view.start_d + p * (view.end_d - view.start_d)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, view.end_d, view.start_d]);

  const next = view.next;
  const nextSoakEnd = next ? next.start_d + next.injection_d + next.soak_d : null;
  const cursorDay = view.days[Math.max(0, Math.min(view.days.length - 1, (cursor ?? 0) - view.start_d))]!;
  const upcoming = view.days.filter((d) => d.d >= 0 && d.part === "tail");
  const riskDays = upcoming.filter((d) => d.practice && d.practice.floatRatio >= 0.9).length;
  const twinMaxFloat = Math.max(0, ...upcoming.map((d) => d.twin?.floatRatio ?? 0));
  const tMax = Math.max(160, ...view.days.map((d) => d.temperature_C ?? 0)) + 10;
  const cycleNumber = view.anchor.cycleNumber;
  const today = view.days.find((d) => d.d === 0);
  const lastTail = next ? view.days.find((d) => d.d === next.start_d - 1) : undefined;
  const oilToSteam = upcoming.reduce((s, d) => s + d.oil_bbl_per_d, 0);
  const tailRuns = view.tailPlan.changes.map((c) => ({ ...c, day_d: view.anchorSoakEnd_d + c.t }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="cycle-plan">
      <ScreenHeader
        title={
          <span className="flex items-center gap-3">
            Cycle plan
            <WellPicker value={focusWell} wells={wells} onChange={setFocusWell} testId="well-picker" />
          </span>
        }
        subtitle={
          next ? (
            <>
              Cycle {cycleNumber} from its first day of production on {dateWithYear(asOf, view.anchorSoakEnd_d)}, through today, to its steam
              date on {dateWithYear(asOf, next.start_d)}
            </>
          ) : (
            <>No steam slot for this well in the 90-day calendar</>
          )
        }
      >
        {next && today?.tubingViscosity_cP && lastTail?.tubingViscosity_cP && (
          <>
            <Readout
              label="Steam date"
              value={shortDate(asOf, next.start_d)}
              note={view.plannedStart_d !== null ? <>plan had {shortDate(asOf, view.plannedStart_d)}</> : <>as planned</>}
              testId="readout-next-steam"
            />
            <Readout
              label="Crude in the tubing"
              value={fmtInt(lastTail.tubingViscosity_cP)}
              unit="cP"
              note={<>by {shortDate(asOf, lastTail.d)}, {fmtInt(today.tubingViscosity_cP)} cP today</>}
            />
            <Readout
              label="Pump today"
              value={fmtFixed(today.twin!.spm * today.twin!.runtime_frac, 2)}
              unit="avg SPM"
              note={<>{fmtFixed(today.twin!.spm, 1)} SPM running, {Math.round(today.twin!.runtime_frac * 100)}% of the day</>}
            />
            <Readout label="Oil until steam" value={fmtInt(oilToSteam)} unit="bbl" note={<>{upcoming.length} days of cycle {cycleNumber} left</>} />
          </>
        )}
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_356px] gap-4 max-[1600px]:grid-cols-[minmax(0,1fr)_300px] max-[1600px]:gap-3">
        <Panel
          title="Cooling, crude and pump, day by day"
          aside={
            <span className="flex items-center justify-end gap-2">
              {cursor !== null && (
                <span className="font-mono text-[10px] text-ink">
                  {shortDate(asOf, cursorDay.d)}
                  {cursorDay.temperature_C !== null && (
                    <>
                      {" · "}
                      {fmtFixed(cursorDay.temperature_C, 0)} °C · {fmtInt(cursorDay.viscosity_cP!)} cP · {fmtFixed(cursorDay.oil_bbl_per_d, 1)} bbl/d ·{" "}
                      {fmtFixed(cursorDay.twin!.spm * cursorDay.twin!.runtime_frac, 2)} SPM
                    </>
                  )}
                  {cursorDay.temperature_C === null && ` · ${cursorDay.part}`}
                </span>
              )}
            </span>
          }
          testId="cycle-chart"
        >
          <ChartFrame margin={{ top: 12, right: 66, bottom: 30, left: 118 }} label="Cycle plan charts">
            {(box) => {
              const { x0, x1, y0, y1 } = box.inner;
              const xs = linearScale([view.start_d, view.end_d + 1], [x0, x1]);
              const L = lanes(y0, y1);
              const yT = linearScale([30, tMax], [L.temp.top + L.temp.height, L.temp.top]);
              const yV = logScale([10, 40000], [L.visc.top + L.visc.height, L.visc.top]);
              const oilMax = Math.max(20, ...view.days.map((d) => d.oil_bbl_per_d)) * 1.12;
              const yO = linearScale([0, oilMax], [L.oil.top + L.oil.height, L.oil.top]);
              const yS = linearScale([0, 6.5], [L.spm.top + L.spm.height, L.spm.top]);
              const fMax = Math.max(1.6, ...view.days.map((d) => d.practice?.floatRatio ?? 0)) * 1.05;
              const yF = linearScale([0, fMax], [L.float.top + L.float.height, L.float.top]);
              const tickDays: number[] = [];
              for (let d = 0; d >= view.start_d; d -= 14) tickDays.unshift(d);
              for (let d = 14; d <= view.end_d; d += 14) tickDays.push(d);
              const phaseRect = (from: number, to: number) => ({ x: xs(from), w: xs(to) - xs(from) });
              const laneList = [L.temp, L.visc, L.oil, L.spm, L.float];
              const riskRuns: { from: number; to: number }[] = [];
              for (const d of view.days) {
                if (d.practice && d.practice.floatRatio >= 0.9) {
                  const last = riskRuns.at(-1);
                  if (last && last.to === d.d - 1) last.to = d.d;
                  else riskRuns.push({ from: d.d, to: d.d });
                }
              }
              const slowRuns: { from: number; to: number }[] = [];
              for (const d of view.days) {
                if (d.twin && d.twin.upstrokeFraction < 0.5) {
                  const last = slowRuns.at(-1);
                  if (last && last.to === d.d - 1) last.to = d.d;
                  else slowRuns.push({ from: d.d, to: d.d });
                }
              }
              return (
                <g>
                  <defs>
                    <linearGradient id="heat" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={yT(45)} y2={yT(Math.min(tMax, 170))}>
                      <stop offset="0" stopColor="#f59e0b" />
                      <stop offset="1" stopColor="#c2410c" />
                    </linearGradient>
                    <pattern id="risk-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="var(--alert)" opacity="0.07" />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="var(--alert)" strokeOpacity="0.35" strokeWidth="1.2" />
                    </pattern>
                  </defs>

                  {/* Risk band runs through every lane so the eye can follow it down. */}
                  {riskRuns.map((r) => (
                    <rect
                      key={`risk-${r.from}`}
                      x={xs(r.from)}
                      width={xs(r.to + 1) - xs(r.from)}
                      y={L.temp.top - 6}
                      height={L.float.top + L.float.height - L.temp.top + 6}
                      fill="url(#risk-hatch)"
                    />
                  ))}

                  {/* Phase strip */}
                  {next && (
                    <>
                      <rect {...(() => { const r = phaseRect(view.start_d, next.start_d); return { x: r.x, width: r.w }; })()} y={L.phase.top} height={L.phase.height} fill="var(--produce)" opacity={0.14} />
                      <rect x={xs(next.start_d)} width={xs(next.start_d + next.injection_d) - xs(next.start_d)} y={L.phase.top} height={L.phase.height} fill="var(--steam)" rx={2} />
                      <rect x={xs(next.start_d + next.injection_d)} width={xs(nextSoakEnd!) - xs(next.start_d + next.injection_d)} y={L.phase.top} height={L.phase.height} fill="var(--soak)" rx={2} />
                      <rect x={xs(nextSoakEnd!)} width={x1 - xs(nextSoakEnd!)} y={L.phase.top} height={L.phase.height} fill="var(--produce)" opacity={0.22} />
                      <text x={xs(view.start_d) + 8} y={L.phase.top + 15} fontSize={10.5} fill="var(--produce)" style={{ fontWeight: 700 }} className="stretch-semi">
                        Cycle {view.anchor.cycleNumber}, production
                      </text>
                      <text x={xs(next.start_d) + 6} y={L.phase.top + 15} fontSize={10.5} fill="#fff7ec" style={{ fontWeight: 700 }} className="font-mono">
                        {fmtInt(view.nextCycleSteam_t)} t
                      </text>
                      <text x={xs(nextSoakEnd!) + 8} y={L.phase.top + 15} fontSize={10.5} fill="var(--produce)" style={{ fontWeight: 700 }} className="stretch-semi">
                        Cycle {next.cycleNumber}
                      </text>
                      {view.plannedStart_d !== null && (
                        <g>
                          <rect
                            x={xs(view.plannedStart_d)}
                            width={xs(view.plannedStart_d + next.injection_d) - xs(view.plannedStart_d)}
                            y={L.phase.top - 3}
                            height={L.phase.height + 6}
                            fill="none"
                            stroke="var(--ink-2)"
                            strokeDasharray="3 2"
                            rx={2}
                          />
                          <text x={xs(view.plannedStart_d + next.injection_d) + 5} y={L.phase.top + 15} fontSize={9.5} fill="var(--ink-2)" className="font-mono">
                            was {shortDate(asOf, view.plannedStart_d)}
                          </text>
                        </g>
                      )}
                    </>
                  )}

                  {laneList.map((lane, i) => (
                    <rect key={i} x={x0} y={lane.top} width={x1 - x0} height={lane.height} fill="none" stroke="var(--ink)" strokeOpacity={0.12} />
                  ))}

                  {/* Temperature */}
                  <LaneTitle x={14} lane={L.temp} title="Temperature" unit="°C" />
                  <GridY scale={yT} x0={x0} x1={x1} ticks={yT.ticks(4)} />
                  <AxisY scale={yT} x={x0} ticks={yT.ticks(4)} format={(v) => fmtInt(v)} />
                  <line x1={x0} x2={x1} y1={yT(dataset.wells.find((w) => w.id === focusWell)!.fluid.reservoirTemperature_C)} y2={yT(dataset.wells.find((w) => w.id === focusWell)!.fluid.reservoirTemperature_C)} stroke="var(--ink)" strokeDasharray="1 3" strokeOpacity={0.6} />
                  <text x={x1 + 6} y={yT(dataset.wells.find((w) => w.id === focusWell)!.fluid.reservoirTemperature_C) + 3} fontSize={9} fill="var(--ink-3)" className="font-mono">
                    reservoir
                  </text>
                  {series(view.days, xs, (d) => (d.wellhead_C === null ? null : yT(d.wellhead_C))).map((pts, i) => (
                    <path key={`wh-${i}`} d={linePath(pts)} fill="none" stroke="var(--heat)" strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />
                  ))}
                  {series(view.days, xs, (d) => (d.temperature_C === null ? null : yT(d.temperature_C))).map((pts, i) => (
                    <path key={`t-${i}`} d={linePath(pts)} fill="none" stroke="url(#heat)" strokeWidth={2.4} />
                  ))}
                  {next && (
                    <text x={xs(next.start_d) + 4} y={L.temp.top + 12} fontSize={9.5} fill="var(--steam)" className="font-mono">
                      steam at {fmtInt(next.injectionTemperature_C)} °C
                    </text>
                  )}
                  <text x={x1 + 6} y={L.temp.top + 12} fontSize={9} fill="var(--heat)" className="font-mono">
                    bottomhole
                  </text>
                  <text x={x1 + 6} y={L.temp.top + 24} fontSize={9} fill="var(--heat)" className="font-mono" opacity={0.75}>
                    wellhead
                  </text>

                  {/* Viscosity */}
                  <LaneTitle x={14} lane={L.visc} title="Viscosity" unit="cP, log" />
                  <rect x={x0} width={x1 - x0} y={yV(13000)} height={yV(10000) - yV(13000)} fill="var(--ink)" opacity={0.08} />
                  <text x={x0 + 6} y={yV(13000) - 3} fontSize={9} fill="var(--ink-2)" className="font-mono">
                    published 10,000 to 13,000 cP at 50 °C
                  </text>
                  <GridY scale={yV} x0={x0} x1={x1} ticks={yV.ticks()} />
                  <AxisY scale={yV} x={x0} ticks={yV.ticks()} format={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                  {series(view.days, xs, (d) => (d.tubingViscosity_cP === null ? null : yV(d.tubingViscosity_cP))).map((pts, i) => (
                    <path key={`vt-${i}`} d={linePath(pts)} fill="none" stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 2" opacity={0.6} />
                  ))}
                  {series(view.days, xs, (d) => (d.viscosity_cP === null ? null : yV(d.viscosity_cP))).map((pts, i) => (
                    <path key={`v-${i}`} d={linePath(pts)} fill="none" stroke="var(--ink)" strokeWidth={2} />
                  ))}
                  <text x={x1 + 6} y={L.visc.top + 12} fontSize={9} fill="var(--ink)" className="font-mono">
                    bottomhole
                  </text>
                  <text x={x1 + 6} y={L.visc.top + 24} fontSize={9} fill="var(--ink-2)" className="font-mono">
                    in tubing
                  </text>

                  {/* Oil */}
                  <LaneTitle x={14} lane={L.oil} title="Oil rate" unit="bbl/d" />
                  <GridY scale={yO} x0={x0} x1={x1} ticks={yO.ticks(4)} />
                  <AxisY scale={yO} x={x0} ticks={yO.ticks(4)} format={(v) => fmtInt(v)} />
                  {series(view.days, xs, (d) => (d.temperature_C === null ? null : yO(d.oil_bbl_per_d))).map((pts, i) => (
                    <g key={`o-${i}`}>
                      <path d={`${linePath(pts)}L${pts.at(-1)![0]},${yO(0)}L${pts[0]![0]},${yO(0)}Z`} fill="var(--produce)" opacity={0.22} />
                      <path d={linePath(pts)} fill="none" stroke="var(--produce)" strokeWidth={1.8} />
                    </g>
                  ))}
                  {next && (
                    <g>
                      <line
                        x1={xs(view.start_d)}
                        x2={xs(next.start_d)}
                        y1={yO(view.currentResteam.freshCycleNetAverage_bbl_per_d)}
                        y2={yO(view.currentResteam.freshCycleNetAverage_bbl_per_d)}
                        stroke="var(--ink)"
                        strokeDasharray="5 3"
                      />
                      <text x={xs(view.start_d) + 6} y={yO(view.currentResteam.freshCycleNetAverage_bbl_per_d) - 5} fontSize={9.5} fill="var(--ink)" className="font-mono">
                        a fresh cycle would average {fmtFixed(view.currentResteam.freshCycleNetAverage_bbl_per_d, 1)} bbl/d after its steam
                      </text>
                    </g>
                  )}

                  {/* Pump speed */}
                  <LaneTitle x={14} lane={L.spm} title="Pump speed" unit="avg SPM" />
                  <GridY scale={yS} x0={x0} x1={x1} ticks={[0, 2, 4, 6]} />
                  <AxisY scale={yS} x={x0} ticks={[0, 2, 4, 6]} format={(v) => String(v)} />
                  {slowRuns.map((r) => (
                    <rect key={`slow-${r.from}`} x={xs(r.from)} width={xs(r.to + 1) - xs(r.from)} y={L.spm.top + L.spm.height - 6} height={6} fill="var(--produce)" opacity={0.55} />
                  ))}
                  {series(view.days, xs, (d) => (d.practice ? yS(d.practice.spm * d.practice.runtime_frac) : null)).map((pts, i) => (
                    <path key={`sp-${i}`} d={stepPath(pts, pts.at(-1)![0])} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="4 3" />
                  ))}
                  {series(view.days, xs, (d) => (d.twin ? yS(d.twin.spm * d.twin.runtime_frac) : null)).map((pts, i) => (
                    <path key={`st-${i}`} d={stepPath(pts, pts.at(-1)![0])} fill="none" stroke="var(--ink)" strokeWidth={2} />
                  ))}
                  <text x={x1 + 6} y={L.spm.top + 12} fontSize={9} fill="var(--ink)" className="font-mono">
                    twin
                  </text>
                  <text x={x1 + 6} y={L.spm.top + 24} fontSize={9} fill="var(--ink-3)" className="font-mono">
                    practice
                  </text>
                  <text x={x1 + 6} y={L.spm.top + L.spm.height} fontSize={9} fill="var(--produce)" className="font-mono">
                    slow down
                  </text>

                  {/* Rod float */}
                  <LaneTitle x={14} lane={L.float} title="Rod float" unit="ratio" />
                  <AxisY scale={yF} x={x0} ticks={[0, 0.5, 1, 1.5].filter((t) => t <= fMax)} format={(v) => fmtFixed(v, 1)} />
                  <line x1={x0} x2={x1} y1={yF(1)} y2={yF(1)} stroke="var(--alert)" strokeWidth={1} />
                  <text x={x1 + 6} y={yF(1) + 3} fontSize={9} fill="var(--alert)" className="font-mono">
                    floats
                  </text>
                  {series(view.days, xs, (d) => (d.practice ? yF(d.practice.floatRatio) : null)).map((pts, i) => (
                    <path key={`fp-${i}`} d={linePath(pts)} fill="none" stroke="var(--alert)" strokeWidth={1.4} strokeDasharray="4 3" />
                  ))}
                  {series(view.days, xs, (d) => (d.twin ? yF(d.twin.floatRatio) : null)).map((pts, i) => (
                    <path key={`ft-${i}`} d={linePath(pts)} fill="none" stroke="var(--produce)" strokeWidth={2} />
                  ))}

                  {/* Markers through all lanes */}
                  <rect x={xs(view.start_d)} width={xs(0) - xs(view.start_d)} y={L.temp.top} height={L.float.top + L.float.height - L.temp.top} fill="var(--ink)" opacity={0.035} />
                  <line x1={xs(0)} x2={xs(0)} y1={L.phase.top - 4} y2={L.float.top + L.float.height} stroke="var(--ink)" strokeOpacity={0.6} strokeDasharray="3 3" />
                  <text x={xs(0) - 5} y={L.float.top + L.float.height - 6} textAnchor="end" fontSize={9.5} fill="var(--ink-2)" className="font-mono">
                    today
                  </text>
                  {view.currentResteam.day_d >= view.start_d && view.currentResteam.day_d <= view.end_d && (
                    <g>
                      <line x1={xs(view.currentResteam.day_d)} x2={xs(view.currentResteam.day_d)} y1={L.phase.top - 4} y2={L.float.top + L.float.height} stroke="var(--ink)" strokeWidth={1.6} />
                      <path d={`M${xs(view.currentResteam.day_d) - 5},${L.phase.top - 10} h10 l-5,6 z`} fill="var(--ink)" />
                      <text x={xs(view.currentResteam.day_d) - 8} y={L.oil.top + 12} textAnchor="end" fontSize={10.5} fill="var(--ink)" style={{ fontWeight: 700 }} className="stretch-semi">
                        Re-steam {shortDate(asOf, view.currentResteam.day_d)}
                      </text>
                    </g>
                  )}

                  <AxisX scale={xs} y={L.float.top + L.float.height + 2} ticks={tickDays} format={(d) => shortDate(asOf, d)} />

                  {cursor !== null && (
                    <g pointerEvents="none">
                      <line x1={xs(cursorDay.d + 0.5)} x2={xs(cursorDay.d + 0.5)} y1={L.phase.top} y2={L.float.top + L.float.height} stroke="var(--ink)" strokeWidth={1} />
                      {cursorDay.temperature_C !== null && (
                        <>
                          <circle cx={xs(cursorDay.d + 0.5)} cy={yT(cursorDay.temperature_C)} r={3.5} fill="var(--heat)" stroke="var(--sheet)" strokeWidth={1.5} />
                          <circle cx={xs(cursorDay.d + 0.5)} cy={yV(cursorDay.viscosity_cP!)} r={3.5} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={1.5} />
                          <circle cx={xs(cursorDay.d + 0.5)} cy={yO(cursorDay.oil_bbl_per_d)} r={3.5} fill="var(--produce)" stroke="var(--sheet)" strokeWidth={1.5} />
                          <circle cx={xs(cursorDay.d + 0.5)} cy={yS(cursorDay.twin!.spm * cursorDay.twin!.runtime_frac)} r={3.5} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={1.5} />
                          <circle cx={xs(cursorDay.d + 0.5)} cy={yF(cursorDay.twin!.floatRatio)} r={3.5} fill="var(--produce)" stroke="var(--sheet)" strokeWidth={1.5} />
                        </>
                      )}
                    </g>
                  )}
                  <rect
                    x={x0}
                    y={L.phase.top}
                    width={x1 - x0}
                    height={L.float.top + L.float.height - L.phase.top}
                    fill="transparent"
                    onMouseMove={(e) => {
                      if (playing) return;
                      const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setCursor(Math.max(view.start_d, Math.min(view.end_d, Math.floor(xs.invert(e.clientX - rect.left)))));
                    }}
                    onMouseLeave={() => !playing && setCursor(null)}
                  />
                </g>
              );
            }}
          </ChartFrame>
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            title={`Pump schedule, cycle ${cycleNumber}`}
            aside={`${view.tailPlan.stroke_in} in stroke`}
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto [scrollbar-width:none]"
          >
            <ol className="flex flex-col px-3.5 py-1" data-testid="pump-schedule">
              {(() => {
                const past = tailRuns.filter((c) => c.day_d < 0);
                const lastPast = past.at(-1);
                return past.length > 0 ? (
                  <li className="border-b border-rule py-[6px] text-[11.5px] leading-snug text-ink-3">
                    {shortDate(asOf, past[0]!.day_d)} to {shortDate(asOf, -1)}: {past.length} steps, from {past[0]!.text.replace(/^Start at /, "").replace(/, stroke.*$/, "")}{" "}
                    down to {lastPast!.text}.
                  </li>
                ) : null;
              })()}
              <li className="flex items-center gap-2 py-1.5">
                <span className="smallcaps text-[8.5px] font-bold text-steam">today, {shortDate(asOf, 0)}</span>
                <span className="h-px flex-1 bg-steam/40" />
              </li>
              {(() => {
                const current = [...tailRuns].reverse().find((c) => c.day_d <= 0);
                const ahead = tailRuns.filter((c) => c.day_d > 0);
                const rows = [...(current ? [{ ...current, day_d: 0, label: "now" }] : []), ...ahead.map((c) => ({ ...c, label: `day ${c.t + 1}` }))];
                return rows.map((c) => (
                  <li key={`${c.t}-${c.label}`} className="grid grid-cols-[48px_52px_1fr] items-baseline gap-2 border-b border-rule py-[6px]">
                    <span className="font-mono text-[10px] text-ink-3">{c.label}</span>
                    <span className="font-mono text-[10.5px] text-ink-2">{shortDate(asOf, c.day_d)}</span>
                    <span className="text-[12.5px] leading-snug text-ink">{c.text}</span>
                  </li>
                ));
              })()}
              {next && (
                <li className="grid grid-cols-[48px_52px_1fr] items-baseline gap-2 py-[6px]">
                  <span className="font-mono text-[10px] text-steam">steam</span>
                  <span className="font-mono text-[10.5px] font-semibold text-steam">{shortDate(asOf, next.start_d)}</span>
                  <span className="text-[12.5px] leading-snug font-semibold text-steam">
                    Pump off, {fmtInt(view.nextCycleSteam_t)} t of steam over {next.injection_d} days
                  </span>
                </li>
              )}
            </ol>
          </Panel>
          <Panel title="Why these dates" testId="why-dates">
            <div className="flex flex-col gap-2.5 px-3.5 py-3 text-[12.5px] leading-[1.45] text-ink">
              {next && (
                <p>
                  <b className="font-semibold">Re-steam {shortDate(asOf, view.currentResteam.day_d)}.</b> That day the oil rate falls to{" "}
                  <span className="font-mono">{fmtFixed(view.currentResteam.oilRate_bbl_per_d, 1)}</span> bbl/d, below the{" "}
                  <span className="font-mono">{fmtFixed(view.currentResteam.freshCycleNetAverage_bbl_per_d, 1)}</span> bbl/d a fresh cycle would average
                  after paying for its steam at {fmtFixed(dataset.assumptions.steamCost_bbl_per_t, 2)} bbl/t.
                </p>
              )}
              <p className="flex items-start gap-2">
                <Chip tone={riskDays > 0 ? "alert" : "produce"} className="mt-[3px]">
                  {riskDays > 0 ? `${riskDays} d at risk` : "no float"}
                </Chip>
                <span>
                  {view.practiceFloatFrom_d !== null ? (
                    <>
                      At constant speed the rods start to float on {shortDate(asOf, view.practiceFloatFrom_d)}, as the crude in the tubing passes{" "}
                      <span className="font-mono">
                        {fmtInt(view.days.find((d) => d.d === view.practiceFloatFrom_d)?.tubingViscosity_cP ?? 0)}
                      </span>{" "}
                      cP.
                    </>
                  ) : riskDays > 0 ? (
                    <>At constant speed the rods run close to floating late in the cycle.</>
                  ) : (
                    <>The rods stay loaded at constant speed through this plan.</>
                  )}{" "}
                  The twin&apos;s slow downstroke keeps the float ratio at or under{" "}
                  <span className="font-mono">{fmtFixed(Math.max(0.01, twinMaxFloat), 2)}</span>.
                </span>
              </p>
            </div>
          </Panel>
          <div className="flex items-center gap-2">
            <Button onClick={() => { setCursor(0); setPlaying((p) => !p); }} data-testid="play-cycle" className="gap-1.5">
              {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {playing ? "Pause" : "Play the cycle"}
            </Button>
            <span className="text-[11px] text-ink-3">{next ? dateRange(asOf, 0, view.end_d) : ""}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 rounded-full" style={{ background: "linear-gradient(90deg,#f59e0b,#c2410c)" }} />Heated-zone temperature</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-5 bg-ink" />Viscosity</span>
        <span className="flex items-center gap-1.5"><span className="h-[9px] w-5 bg-produce/40" />Oil rate</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-5 bg-ink" />Twin schedule</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t border-dashed border-ink-3" />Current practice, constant speed</span>
        <span className={cn("flex items-center gap-1.5")}>
          <span className="h-[9px] w-5" style={{ background: "repeating-linear-gradient(45deg, rgb(204 31 26 / 0.35) 0 1.2px, rgb(204 31 26 / 0.07) 1.2px 4px)" }} />
          Rod-float risk band at constant speed
        </span>
      </div>
    </div>
  );
}
