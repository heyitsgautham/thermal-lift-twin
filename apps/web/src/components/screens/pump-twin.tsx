"use client";

import { apiToSpecificGravity, rodFallSpeed_m_per_s, simulateStroke, type StrokeResult } from "@bgw/physics";
import type { PumpSetting } from "@bgw/optimise";
import { useEffect, useMemo, useState } from "react";
import { AxisX, AxisY, ChartFrame, GridY, linePath, linearScale } from "@/components/kit/chart";
import { Chip, Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { Segmented } from "@/components/kit/segmented";
import { WellPicker } from "@/components/kit/well-picker";
import { useTwinContext } from "@/components/twin/twin-provider";
import { Slider } from "@/components/ui/slider";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCssWellOptions, useCycleView } from "./cycle-plan";

type Mode = "practice" | "twin";

/** Real stroke time is slowed down this much for the live marker so the eye can follow it. */
const LIVE_SECONDS_PER_STROKE = 4;

function useStrokePhase(): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const cycles = Math.max(0, now - start) / 1000 / LIVE_SECONDS_PER_STROKE;
      setPhase(cycles - Math.floor(cycles));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return phase;
}

function CardChart({
  label,
  which,
  practice,
  twin,
  mode,
  phase,
}: {
  label: string;
  which: "surface" | "downhole";
  practice: StrokeResult;
  twin: StrokeResult;
  mode: Mode;
  phase: number;
}) {
  const all = [...practice[which], ...twin[which]];
  const loadMin = Math.min(-8, ...all.map((p) => p.load_kN));
  const loadMax = Math.max(...all.map((p) => p.load_kN)) * 1.08;
  const posMax = Math.max(...all.map((p) => p.position_m)) * 1.04;
  return (
    <ChartFrame margin={{ top: 16, right: 18, bottom: 34, left: 52 }} label={label}>
      {(box) => {
        const { x0, x1, y0, y1 } = box.inner;
        const xs = linearScale([0, posMax], [x0, x1]);
        const ys = linearScale([loadMin, loadMax], [y1, y0]);
        const loop = (r: StrokeResult) => linePath(r[which].map((p) => [xs(p.position_m), ys(p.load_kN)] as [number, number])) + "Z";
        const live = mode === "twin" ? twin : practice;
        const pts = live[which];
        const i = Math.min(pts.length - 1, Math.floor(phase * pts.length));
        const dot = pts[i]!;
        const slackBelow = which === "surface";
        return (
          <g>
            {slackBelow && (
              <g>
                <rect x={x0} width={x1 - x0} y={ys(0)} height={y1 - ys(0)} fill="var(--alert)" opacity={0.07} />
                <text x={x1 - 6} y={y1 - 6} textAnchor="end" fontSize={9.5} fill="var(--alert)" className="font-mono">
                  below zero the string goes slack
                </text>
              </g>
            )}
            <GridY scale={ys} x0={x0} x1={x1} ticks={ys.ticks(5)} />
            <AxisY scale={ys} x={x0} ticks={ys.ticks(5)} format={(v) => fmtInt(v)} label="load, kN" />
            <AxisX scale={xs} y={y1} ticks={xs.ticks(5)} format={(v) => fmtFixed(v, 1)} label="position, m" />
            <line x1={x0} x2={x1} y1={ys(0)} y2={ys(0)} stroke="var(--alert)" strokeWidth={1} />
            {which === "surface" && (
              <g>
                <line x1={x0} x2={x1} y1={ys(live.rodWeightInFluid_kN)} y2={ys(live.rodWeightInFluid_kN)} stroke="var(--ink)" strokeOpacity={0.4} strokeDasharray="2 3" />
                <text x={x0 + 4} y={ys(live.rodWeightInFluid_kN) - 4} fontSize={9} fill="var(--ink-3)" className="font-mono">
                  rods in fluid {fmtFixed(live.rodWeightInFluid_kN, 1)} kN
                </text>
              </g>
            )}
            {which === "downhole" && (
              <g>
                <line x1={x0} x2={x1} y1={ys(live.fluidLoad_kN)} y2={ys(live.fluidLoad_kN)} stroke="var(--ink)" strokeOpacity={0.4} strokeDasharray="2 3" />
                <text x={x0 + 4} y={ys(live.fluidLoad_kN) - 4} fontSize={9} fill="var(--ink-3)" className="font-mono">
                  fluid load {fmtFixed(live.fluidLoad_kN, 1)} kN
                </text>
              </g>
            )}
            <path d={loop(practice)} fill={mode === "practice" ? "rgb(204 31 26 / 0.08)" : "none"} stroke="var(--alert)" strokeWidth={mode === "practice" ? 2.2 : 1.3} strokeDasharray={mode === "practice" ? undefined : "5 3"} opacity={mode === "practice" ? 1 : 0.75} />
            <path d={loop(twin)} fill={mode === "twin" ? "rgb(15 118 110 / 0.1)" : "none"} stroke="var(--produce)" strokeWidth={mode === "twin" ? 2.4 : 1.3} strokeDasharray={mode === "twin" ? undefined : "5 3"} opacity={mode === "twin" ? 1 : 0.75} />
            <circle cx={xs(dot.position_m)} cy={ys(dot.load_kN)} r={5} fill={mode === "twin" ? "var(--produce)" : "var(--alert)"} stroke="var(--sheet)" strokeWidth={2} />
          </g>
        );
      }}
    </ChartFrame>
  );
}

function VelocityChart({
  practice,
  twin,
  fallSpeed,
  mode,
  phase,
}: {
  practice: StrokeResult;
  twin: StrokeResult;
  fallSpeed: number;
  mode: Mode;
  phase: number;
}) {
  const vmax = Math.max(...practice.velocity_m_per_s.map(Math.abs), ...twin.velocity_m_per_s.map(Math.abs), fallSpeed) * 1.18;
  return (
    <ChartFrame margin={{ top: 16, right: 150, bottom: 34, left: 52 }} label="Polished-rod speed over one stroke">
      {(box) => {
        const { x0, x1, y0, y1 } = box.inner;
        const xs = linearScale([0, 1], [x0, x1]);
        const ys = linearScale([-vmax, vmax], [y1, y0]);
        const curve = (r: StrokeResult) =>
          linePath(r.velocity_m_per_s.map((v, i) => [xs(i / (r.velocity_m_per_s.length - 1)), ys(v)] as [number, number]));
        const live = mode === "twin" ? twin : practice;
        const i = Math.min(live.velocity_m_per_s.length - 1, Math.floor(phase * live.velocity_m_per_s.length));
        return (
          <g>
            <rect x={x0} width={x1 - x0} y={ys(-fallSpeed)} height={y1 - ys(-fallSpeed)} fill="var(--alert)" opacity={0.08} />
            <line x1={x0} x2={x1} y1={ys(-fallSpeed)} y2={ys(-fallSpeed)} stroke="var(--alert)" strokeWidth={1.2} />
            <text x={x1 + 8} y={ys(-fallSpeed) + 3} fontSize={9.5} fill="var(--alert)" className="font-mono">
              rod fall speed
            </text>
            <text x={x1 + 8} y={ys(-fallSpeed) + 15} fontSize={9.5} fill="var(--alert)" className="font-mono">
              {fmtFixed(fallSpeed, 2)} m/s
            </text>
            <GridY scale={ys} x0={x0} x1={x1} ticks={ys.ticks(6)} />
            <AxisY scale={ys} x={x0} ticks={ys.ticks(6)} format={(v) => fmtFixed(v, 1)} label="speed, m/s" />
            <AxisX scale={xs} y={y1} ticks={[0, 0.25, 0.5, 0.75, 1]} format={(v) => `${Math.round(v * 100)}%`} label="share of one stroke" />
            <line x1={x0} x2={x1} y1={ys(0)} y2={ys(0)} stroke="var(--ink)" strokeOpacity={0.4} />
            <text x={x0 + 8} y={y0 + 12} fontSize={9.5} fill="var(--ink-3)" className="smallcaps" style={{ fontWeight: 600 }}>
              upstroke, rods rising
            </text>
            <text x={x0 + 8} y={y1 - 8} fontSize={9.5} fill="var(--ink-3)" className="smallcaps" style={{ fontWeight: 600 }}>
              downstroke, rods falling
            </text>
            <path d={curve(practice)} fill="none" stroke="var(--alert)" strokeWidth={mode === "practice" ? 2.2 : 1.3} strokeDasharray={mode === "practice" ? undefined : "5 3"} />
            <path d={curve(twin)} fill="none" stroke="var(--produce)" strokeWidth={mode === "twin" ? 2.4 : 1.3} strokeDasharray={mode === "twin" ? undefined : "5 3"} />
            <line x1={xs(i / (live.velocity_m_per_s.length - 1))} x2={xs(i / (live.velocity_m_per_s.length - 1))} y1={y0} y2={y1} stroke="var(--ink)" strokeOpacity={0.35} />
            <text x={x1 + 8} y={y0 + 10} fontSize={9.5} fill="var(--produce)" className="font-mono">
              twin profile
            </text>
            <text x={x1 + 8} y={y0 + 23} fontSize={9.5} fill="var(--alert)" className="font-mono">
              constant speed
            </text>
          </g>
        );
      }}
    </ChartFrame>
  );
}

function hz(s: PumpSetting): { up: number; down: number } {
  const period = 60 / s.spm;
  const up = 60 / (2 * s.upstrokeFraction * period);
  const down = 60 / (2 * (1 - s.upstrokeFraction) * period);
  return { up: up * 10, down: down * 10 };
}

export function PumpTwinScreen() {
  const { dataset, focusWell, setFocusWell } = useTwinContext();
  const asOf = dataset.meta.asOf;
  const wells = useCssWellOptions();
  const view = useCycleView(focusWell);
  const pumpDays = useMemo(() => view.days.filter((d) => d.twin && d.practice && d.d >= 0), [view.days]);
  // Open on the last day the well pumps before its steam: the crude is at its thickest then.
  // Without a steam slot, open on the day constant speed comes closest to floating the rods.
  const lastBeforeSteam = view.next ? pumpDays.filter((d) => d.d < view.next!.start_d).at(-1) : undefined;
  const defaultDay =
    lastBeforeSteam?.d ?? pumpDays.reduce((b, x) => (x.practice!.floatRatio > b.practice!.floatRatio ? x : b), pumpDays[0]!)?.d ?? 0;
  const [dayChoice, setDayChoice] = useState<{ well: string; d: number } | null>(null);
  const day = dayChoice && dayChoice.well === focusWell ? dayChoice.d : defaultDay;
  const [mode, setMode] = useState<Mode>("practice");
  const phase = useStrokePhase();
  const well = dataset.wells.find((w) => w.id === focusWell)!;
  const pump = well.css!.pump;
  const cell = pumpDays.find((d) => d.d === day) ?? pumpDays[0]!;
  const density = apiToSpecificGravity(well.fluid.api_deg) * 1000;

  const sims = useMemo(() => {
    const run = (s: PumpSetting) =>
      simulateStroke({
        stroke_in: s.stroke_in,
        spm: s.spm,
        upstrokeFraction: s.upstrokeFraction,
        viscosity_cP: cell.tubingViscosity_cP!,
        fluidDensity_kg_per_m3: density,
        plungerDiameter_in: pump.plungerDiameter_in,
        fillage_frac: Math.max(0.3, s.fillage_frac),
      });
    return { practice: run(cell.practice!), twin: run(cell.twin!) };
  }, [cell, density, pump.plungerDiameter_in]);

  const fall = rodFallSpeed_m_per_s(cell.tubingViscosity_cP!, density);
  const live = mode === "twin" ? sims.twin : sims.practice;
  const liveSetting = mode === "twin" ? cell.twin! : cell.practice!;
  const cycleDay = cell.part === "tail" ? cell.d - (view.anchor.start_d + view.anchor.injection_d + view.anchor.soak_d) : cell.d - (view.next!.start_d + view.next!.injection_d + view.next!.soak_d);
  const cycleNo = cell.part === "tail" ? view.anchor.cycleNumber : view.next!.cycleNumber;
  const pHz = hz(cell.practice!);
  const tHz = hz(cell.twin!);

  const rows: { label: string; practice: string; twin: string; worse?: "practice" | "twin" }[] = [
    { label: "Average SPM", practice: fmtFixed(cell.practice!.spm, 1), twin: fmtFixed(cell.twin!.spm, 1) },
    {
      label: "Up / down share",
      practice: `${Math.round(cell.practice!.upstrokeFraction * 100)}/${Math.round((1 - cell.practice!.upstrokeFraction) * 100)}`,
      twin: `${Math.round(cell.twin!.upstrokeFraction * 100)}/${Math.round((1 - cell.twin!.upstrokeFraction) * 100)}`,
    },
    { label: "Motor, up / down", practice: `${fmtInt(pHz.up)} / ${fmtInt(pHz.down)} Hz`, twin: `${fmtInt(tHz.up)} / ${fmtInt(tHz.down)} Hz` },
    { label: "Runs", practice: `${Math.round(cell.practice!.runtime_frac * 100)}% of day`, twin: `${Math.round(cell.twin!.runtime_frac * 100)}% of day` },
    { label: "Fillage", practice: `${Math.round(cell.practice!.fillage_frac * 100)}%`, twin: `${Math.round(cell.twin!.fillage_frac * 100)}%` },
    {
      label: "Float ratio",
      practice: fmtFixed(cell.practice!.floatRatio, 2),
      twin: fmtFixed(cell.twin!.floatRatio, 2),
      worse: cell.practice!.floatRatio > cell.twin!.floatRatio ? "practice" : undefined,
    },
    {
      label: "Min rod load",
      practice: `${fmtFixed(sims.practice.minLoad_kN, 1)} kN`,
      twin: `${fmtFixed(sims.twin.minLoad_kN, 1)} kN`,
      worse: sims.practice.minLoad_kN < 0 ? "practice" : undefined,
    },
    { label: "Slack share", practice: `${Math.round(sims.practice.slackFraction * 100)}%`, twin: `${Math.round(sims.twin.slackFraction * 100)}%` },
    { label: "Lift energy", practice: `${fmtInt(cell.practice!.energy_kWh)} kWh/d`, twin: `${fmtInt(cell.twin!.energy_kWh)} kWh/d` },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="pump-twin" data-mode={mode}>
      <ScreenHeader
        title={
          <span className="flex items-center gap-3">
            Pump twin
            <WellPicker value={focusWell} wells={wells} onChange={setFocusWell} testId="well-picker" />
          </span>
        }
        subtitle={
          <>
            {shortDate(asOf, cell.d)}, cycle {cycleNo} day {cycleDay + 1}
            {lastBeforeSteam && cell.d === lastBeforeSteam.d ? ", its last day before steam" : ""} · crude in the tubing {fmtInt(cell.tubingViscosity_cP!)} cP at{" "}
            {fmtFixed(((cell.temperature_C ?? 0) + (cell.wellhead_C ?? 0)) / 2, 0)} °C · {pump.stroke_in} in stroke, {pump.plungerDiameter_in} in
            plunger, pump at 1,100 m
          </>
        }
      >
        <Readout label="Peak rod load" value={fmtFixed(live.peakLoad_kN, 1)} unit="kN" note={mode === "twin" ? "twin profile" : "constant speed"} testId="readout-peak" />
        <Readout
          label="Minimum rod load"
          value={fmtFixed(live.minLoad_kN, 1)}
          unit="kN"
          tone={live.minLoad_kN < 0 ? "alert" : "ink"}
          note={live.minLoad_kN < 0 ? "string goes slack" : "rods stay loaded"}
          testId="readout-min"
        />
        <Readout label="Fillage" value={`${Math.round(liveSetting.fillage_frac * 100)}%`} note={`runs ${Math.round(liveSetting.runtime_frac * 100)}% of the day`} />
        <Readout
          label="Polished-rod power"
          value={fmtFixed(live.polishedRodPower_kW, 1)}
          unit="kW"
          note={<>from the surface card area</>}
        />
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_356px] gap-4 max-[1600px]:grid-cols-[minmax(0,1fr)_300px] max-[1600px]:gap-3">
        <div className="grid min-h-0 grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
          <div className="grid min-h-0 grid-cols-2 gap-3">
            <Panel title="Surface card" aside="polished-rod load against position" testId="surface-card">
              <CardChart label="Surface card" which="surface" practice={sims.practice} twin={sims.twin} mode={mode} phase={phase} />
            </Panel>
            <Panel title="Downhole card" aside="plunger load against plunger position">
              <CardChart label="Downhole card" which="downhole" practice={sims.practice} twin={sims.twin} mode={mode} phase={phase} />
            </Panel>
          </div>
          <Panel title="VFD in-stroke speed profile" aside="slow on the way down, fast on the way up" testId="vfd-panel">
            <VelocityChart practice={sims.practice} twin={sims.twin} fallSpeed={fall} mode={mode} phase={phase} />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="Setting">
            <div className="flex flex-col gap-3 px-3.5 py-3">
              <Segmented<Mode>
                label="Pump setting"
                value={mode}
                onChange={setMode}
                testId="mode"
                options={[
                  { value: "practice", label: "Constant speed" },
                  { value: "twin", label: "Twin profile" },
                ]}
              />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="smallcaps text-[9px] font-semibold text-ink-2">Day</span>
                  <span className="font-mono text-[11px] text-ink">
                    {shortDate(asOf, cell.d)} · {fmtInt(cell.tubingViscosity_cP!)} cP
                  </span>
                </div>
                <Slider
                  min={pumpDays[0]?.d ?? 0}
                  max={pumpDays.at(-1)?.d ?? 1}
                  step={1}
                  value={[cell.d]}
                  onValueChange={([v]) => {
                    const nearest = pumpDays.reduce((b, x) => (Math.abs(x.d - v!) < Math.abs(b.d - v!) ? x : b), pumpDays[0]!);
                    setDayChoice({ well: focusWell, d: nearest.d });
                  }}
                  data-testid="day-slider"
                  aria-label="Day"
                  className="[&_[data-slot=slider-range]]:bg-ink [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-ink [&_[data-slot=slider-track]]:bg-ink/15"
                />
              </div>
              <div
                className={cn(
                  "flex items-start gap-2 rounded-[3px] border px-2.5 py-2",
                  sims.practice.floats ? "border-alert/40 bg-alert/[0.06]" : "border-produce/30 bg-produce/[0.06]",
                )}
                data-testid="float-flag"
              >
                <Chip tone={sims.practice.floats ? "alert" : "produce"} className="mt-[2px]">
                  {sims.practice.floats ? "Rod float" : "Loaded"}
                </Chip>
                <p className="text-[12px] leading-[1.4] text-ink">
                  {sims.practice.floats ? (
                    <>
                      At constant speed the polished rod comes down at{" "}
                      <span className="font-mono">{fmtFixed(Math.max(...sims.practice.velocity_m_per_s.map((v) => -v)), 2)}</span> m/s, faster than
                      the rods can fall through {fmtInt(cell.tubingViscosity_cP!)} cP crude. The string is slack for{" "}
                      {Math.round(sims.practice.slackFraction * 100)}% of each stroke.
                    </>
                  ) : (
                    <>At this viscosity the rods fall fast enough at constant speed. The twin still matches speed to inflow.</>
                  )}
                  {sims.practice.floats && !sims.twin.floats && <> The twin profile keeps the rods loaded.</>}
                </p>
              </div>
            </div>
          </Panel>
          <Panel title="Constant speed against twin profile" className="min-h-0 flex-1" bodyClassName="overflow-y-auto">
            <table className="w-full border-collapse" data-testid="setting-table">
              <thead>
                <tr className="border-b border-rule-strong">
                  <th className="py-1.5 pl-3.5 text-left smallcaps text-[8.5px] font-semibold text-ink-3"> </th>
                  <th className="py-1.5 text-right smallcaps text-[8.5px] font-semibold text-alert">Constant</th>
                  <th className="py-1.5 pr-3.5 text-right smallcaps text-[8.5px] font-semibold text-produce">Twin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-rule last:border-b-0">
                    <td className="py-[6px] pl-3.5 text-[12px] text-ink-2">{r.label}</td>
                    <td className={cn("py-[6px] text-right font-mono text-[11px]", r.worse === "practice" ? "font-semibold text-alert" : "text-ink")}>{r.practice}</td>
                    <td className="py-[6px] pr-3.5 text-right font-mono text-[11px] text-ink">{r.twin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
      <p className="text-[11px] text-ink-2">
        Cards from Gibbs&apos; damped wave equation on a 1,100 m, 7/8 in rod string, solved by finite differences. Rod drag is laminar Couette flow
        in 2 7/8 in tubing. The live marker runs one stroke every {LIVE_SECONDS_PER_STROKE} s; the real stroke takes {fmtFixed(60 / liveSetting.spm, 0)} s.
      </p>
    </div>
  );
}
