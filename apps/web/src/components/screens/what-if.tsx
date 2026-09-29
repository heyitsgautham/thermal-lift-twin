"use client";

import { cycleScenario, type ScenarioInput } from "@bgw/optimise";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { AxisX, AxisY, ChartFrame, GridY, linePath, linearScale } from "@/components/kit/chart";
import { Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { Segmented } from "@/components/kit/segmented";
import { WellPicker } from "@/components/kit/well-picker";
import { useTwinContext } from "@/components/twin/twin-provider";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { fmtFixed, fmtInt, fmtSigned } from "@/lib/format";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";
import { useCssWellOptions, useCycleView } from "./cycle-plan";

interface InputSpec {
  key: "steam_t" | "soak_d" | "steamCost_bbl_per_t";
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  help: string;
}

const INPUTS: InputSpec[] = [
  { key: "steam_t", label: "Steam per cycle", unit: "t", min: 1000, max: 3600, step: 100, digits: 0, help: "Sets injection days at the well's design rate." },
  { key: "soak_d", label: "Soak", unit: "days", min: 2, max: 14, step: 1, digits: 0, help: "5 to 7 days condenses the steam; shorter flashes it back, longer loses heat." },
  {
    key: "steamCost_bbl_per_t",
    label: "Cut-off, steam cost",
    unit: "bbl oil/t",
    min: 0.2,
    max: 1.0,
    step: 0.05,
    digits: 2,
    help: "Oil-equivalent price of steam. Higher means longer cycles before re-steaming.",
  },
];

function Stepper({ spec, value, onChange }: { spec: InputSpec; value: number; onChange(v: number): void }) {
  const clamp = (v: number) => Math.min(spec.max, Math.max(spec.min, Number(v.toFixed(4))));
  return (
    <div className="flex flex-col gap-2 border-b border-rule pb-3 last:border-b-0" data-testid={`input-${spec.key}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold stretch-semi text-ink">{spec.label}</span>
        <span className="font-mono text-[15px] font-medium text-ink">
          {spec.digits === 0 ? fmtInt(value) : fmtFixed(value, spec.digits)} <span className="text-[10.5px] text-ink-2">{spec.unit}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-xs" className="border-rule-strong bg-sheet" aria-label={`Lower ${spec.label}`} onClick={() => onChange(clamp(value - spec.step))} data-testid={`dec-${spec.key}`}>
          <Minus />
        </Button>
        <Slider
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={[value]}
          onValueChange={([v]) => onChange(clamp(v!))}
          aria-label={spec.label}
          className="[&_[data-slot=slider-range]]:bg-ink [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-ink [&_[data-slot=slider-track]]:bg-ink/15"
        />
        <Button variant="outline" size="icon-xs" className="border-rule-strong bg-sheet" aria-label={`Raise ${spec.label}`} onClick={() => onChange(clamp(value + spec.step))} data-testid={`inc-${spec.key}`}>
          <Plus />
        </Button>
      </div>
      <span className="text-[10.5px] leading-snug text-ink-3">{spec.help}</span>
    </div>
  );
}

function Delta({ now, base, digits = 0, goodWhen }: { now: number; base: number; digits?: number; goodWhen: "up" | "down" }) {
  const d = now - base;
  const zero = Number(d.toFixed(digits)) === 0;
  return (
    <span className={cn("font-mono font-semibold", zero ? "text-ink-3" : (goodWhen === "up" ? d > 0 : d < 0) ? "text-produce" : "text-alert")}>
      {fmtSigned(d, digits)}
    </span>
  );
}

export function WhatIfScreen() {
  const { twin, dataset, focusWell, setFocusWell } = useTwinContext();
  const wells = useCssWellOptions();
  const view = useCycleView(focusWell);
  const model = twin.field.model(focusWell);
  const design = model.well.css!.design;
  const cycleNumber = view.next?.cycleNumber ?? view.anchor.cycleNumber + 1;
  const baseInput: ScenarioInput = {
    steam_t: Math.round((design.injectionRate_t_per_h * 24 * design.injection_d) / 100) * 100,
    soak_d: design.soak_d,
    steamCost_bbl_per_t: dataset.assumptions.steamCost_bbl_per_t,
    pump: "twin",
  };
  const [input, setInput] = useState<{ well: string; v: ScenarioInput } | null>(null);
  const cur = input && input.well === focusWell ? input.v : baseInput;
  const set = (patch: Partial<ScenarioInput>) => setInput({ well: focusWell, v: { ...cur, ...patch } });

  const minLeg = dataset.assumptions.minProductionLeg_d;
  const reliability = dataset.assumptions.reliability;
  const base = useMemo(
    () => cycleScenario(model, cycleNumber, { ...baseInput, pump: "practice" }, minLeg, reliability),
    // The base input is rebuilt each render from these primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, cycleNumber, baseInput.steam_t, baseInput.soak_d, baseInput.steamCost_bbl_per_t, minLeg, reliability],
  );
  const now = useMemo(
    () => cycleScenario(model, cycleNumber, { steam_t: cur.steam_t, soak_d: cur.soak_d, steamCost_bbl_per_t: cur.steamCost_bbl_per_t, pump: cur.pump }, minLeg, reliability),
    [model, cycleNumber, cur.steam_t, cur.soak_d, cur.steamCost_bbl_per_t, cur.pump, minLeg, reliability],
  );
  const sweep = useMemo(() => {
    const out: { steam: number; oil: number; sor: number }[] = [];
    for (let t = INPUTS[0]!.min; t <= INPUTS[0]!.max; t += 100) {
      const r = cycleScenario(model, cycleNumber, { steam_t: t, soak_d: cur.soak_d, steamCost_bbl_per_t: cur.steamCost_bbl_per_t, pump: cur.pump }, minLeg, reliability);
      out.push({ steam: t, oil: r.cycleOil_bbl, sor: r.sor });
    }
    return out;
  }, [model, cycleNumber, cur.soak_d, cur.steamCost_bbl_per_t, cur.pump, minLeg, reliability]);

  const oilT = useTween(now.cycleOil_bbl);
  const sorT = useTween(now.sor);
  const kwhT = useTween(now.kWhPerBbl);
  const failT = useTween(now.failureChance * 100);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="what-if">
      <ScreenHeader
        title={
          <span className="flex items-center gap-3">
            What-if lab
            <WellPicker value={focusWell} wells={wells} onChange={setFocusWell} testId="well-picker" />
          </span>
        }
        subtitle={<>Cycle {cycleNumber} run to its re-steam day, against the design cycle at current practice. Reservoir, wellbore and pump are one model.</>}
      >
        <Readout label="Cycle oil" value={fmtInt(oilT)} unit="bbl" note={<><Delta now={now.cycleOil_bbl} base={base.cycleOil_bbl} goodWhen="up" /> vs design</>} testId="readout-cycle-oil" />
        <Readout label="Steam-oil ratio" value={fmtFixed(sorT, 2)} note={<><Delta now={now.sor} base={base.sor} digits={2} goodWhen="down" /> vs design</>} testId="readout-sor" />
        <Readout label="Lift energy" value={fmtFixed(kwhT, 2)} unit="kWh/bbl" note={<><Delta now={now.kWhPerBbl} base={base.kWhPerBbl} digits={2} goodWhen="down" /> vs design</>} testId="readout-kwh" />
        <Readout
          label="Failure chance"
          value={`${fmtFixed(failT, 0)}%`}
          unit="per cycle"
          tone={now.failureChance > 0.2 ? "alert" : "ink"}
          note={<><Delta now={now.failureChance * 100} base={base.failureChance * 100} goodWhen="down" /> pts, stated hazard</>}
          testId="readout-failures"
        />
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)_356px] gap-4 max-[1600px]:grid-cols-[290px_minmax(0,1fr)_290px] max-[1600px]:gap-3">
        <Panel title="Inputs" aside={`${focusWell}, cycle ${cycleNumber}`}>
          <div className="flex flex-col gap-3 px-3.5 py-3">
            {INPUTS.map((spec) => (
              <Stepper key={spec.key} spec={spec} value={cur[spec.key]} onChange={(v) => set({ [spec.key]: v })} />
            ))}
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold stretch-semi text-ink">Pump</span>
              <Segmented<ScenarioInput["pump"]>
                label="Pump setting"
                value={cur.pump}
                onChange={(pump) => set({ pump })}
                testId="pump-mode"
                options={[
                  { value: "twin", label: "Twin schedule" },
                  { value: "practice", label: "Constant speed" },
                ]}
              />
            </div>
            <Button variant="outline" className="w-fit border-rule-strong bg-sheet" onClick={() => setInput(null)} data-testid="reset-inputs">
              <RotateCcw data-icon="inline-start" />
              Back to design
            </Button>
          </div>
        </Panel>

        <div className="grid min-h-0 grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          <Panel title="Oil rate over the cycle" aside="scenario against design">
            <ChartFrame margin={{ top: 18, right: 20, bottom: 34, left: 52 }} label="Oil rate over the cycle">
              {(box) => {
                const { x0, x1, y0, y1 } = box.inner;
                const len = Math.max(now.oil.length, base.oil.length) + 5;
                const xs = linearScale([0, len], [x0, x1]);
                const ys = linearScale([0, Math.max(...now.oil, ...base.oil) * 1.12], [y1, y0]);
                const path = (v: number[]) => linePath(v.map((q, i) => [xs(i + 0.5), ys(q)] as [number, number]));
                return (
                  <g>
                    <GridY scale={ys} x0={x0} x1={x1} ticks={ys.ticks(4)} />
                    <AxisY scale={ys} x={x0} ticks={ys.ticks(4)} format={(v) => fmtInt(v)} label="bbl/d" />
                    <AxisX scale={xs} y={y1} ticks={xs.ticks(6)} format={(v) => `${v}`} label="production day" />
                    <path d={`${path(now.oil)}L${xs(now.oil.length - 0.5)},${ys(0)}L${xs(0.5)},${ys(0)}Z`} fill="var(--produce)" opacity={0.2} />
                    <path d={path(base.oil)} fill="none" stroke="var(--ink)" strokeWidth={1.3} strokeDasharray="5 3" />
                    <path d={path(now.oil)} fill="none" stroke="var(--produce)" strokeWidth={2.2} />
                    <line x1={xs(now.oil.length)} x2={xs(now.oil.length)} y1={y0} y2={y1} stroke="var(--produce)" strokeWidth={1.4} />
                    <text x={xs(now.oil.length) - 4} y={y0 + 10} textAnchor="end" fontSize={9.5} fill="var(--produce)" className="font-mono">
                      re-steam, day {now.oil.length}
                    </text>
                    {base.oil.length !== now.oil.length && (
                      <g>
                        <line x1={xs(base.oil.length)} x2={xs(base.oil.length)} y1={y0 + 18} y2={y1} stroke="var(--ink)" strokeDasharray="2 3" />
                        <text
                          x={xs(base.oil.length) + (base.oil.length > now.oil.length ? -4 : 4)}
                          y={y0 + 28}
                          textAnchor={base.oil.length > now.oil.length ? "end" : "start"}
                          fontSize={9.5}
                          fill="var(--ink-2)"
                          className="font-mono"
                        >
                          design, day {base.oil.length}
                        </text>
                      </g>
                    )}
                  </g>
                );
              }}
            </ChartFrame>
          </Panel>
          <Panel title="Steam per cycle against cycle oil and steam-oil ratio" aside="other inputs held">
            <ChartFrame margin={{ top: 18, right: 52, bottom: 34, left: 52 }} label="Steam sensitivity">
              {(box) => {
                const { x0, x1, y0, y1 } = box.inner;
                const xs = linearScale([INPUTS[0]!.min, INPUTS[0]!.max], [x0, x1]);
                const yo = linearScale([0, Math.max(...sweep.map((s) => s.oil)) * 1.1], [y1, y0]);
                const yr = linearScale([0, Math.max(...sweep.map((s) => s.sor)) * 1.15], [y1, y0]);
                return (
                  <g>
                    <GridY scale={yo} x0={x0} x1={x1} ticks={yo.ticks(4)} />
                    <AxisY scale={yo} x={x0} ticks={yo.ticks(4)} format={(v) => fmtInt(v)} label="cycle oil, bbl" color="var(--produce)" />
                    <AxisY scale={yr} x={x1} side="right" ticks={yr.ticks(4)} format={(v) => fmtFixed(v, 1)} label="SOR" color="var(--steam)" />
                    <AxisX scale={xs} y={y1} ticks={xs.ticks(6)} format={(v) => fmtInt(v)} label="steam, t" />
                    <path d={linePath(sweep.map((s) => [xs(s.steam), yo(s.oil)] as [number, number]))} fill="none" stroke="var(--produce)" strokeWidth={2} />
                    <path d={linePath(sweep.map((s) => [xs(s.steam), yr(s.sor)] as [number, number]))} fill="none" stroke="var(--steam)" strokeWidth={2} />
                    <line x1={xs(cur.steam_t)} x2={xs(cur.steam_t)} y1={y0} y2={y1} stroke="var(--ink)" strokeWidth={1} />
                    <circle cx={xs(cur.steam_t)} cy={yo(now.cycleOil_bbl)} r={4.5} fill="var(--produce)" stroke="var(--sheet)" strokeWidth={2} />
                    <circle cx={xs(cur.steam_t)} cy={yr(now.sor)} r={4.5} fill="var(--steam)" stroke="var(--sheet)" strokeWidth={2} />
                  </g>
                );
              }}
            </ChartFrame>
          </Panel>
        </div>

        <Panel title="Scenario against design" aside="design = current practice">
          <table className="w-full border-collapse" data-testid="what-if-table">
            <thead>
              <tr className="border-b border-rule-strong">
                <th className="py-1.5 pl-3.5 text-left smallcaps text-[8.5px] font-semibold text-ink-3"> </th>
                <th className="py-1.5 text-right smallcaps text-[8.5px] font-semibold text-ink-3">Design</th>
                <th className="py-1.5 pr-3.5 text-right smallcaps text-[8.5px] font-semibold text-ink">Scenario</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Injection", `${base.injection_d} d`, `${now.injection_d} d`],
                ["Production leg", `${base.productionLeg_d} d`, `${now.productionLeg_d} d`],
                ["Whole cycle", `${base.cycleLength_d} d`, `${now.cycleLength_d} d`],
                ["Cycle oil", `${fmtInt(base.cycleOil_bbl)} bbl`, `${fmtInt(now.cycleOil_bbl)} bbl`],
                ["Oil per cycle day", `${fmtFixed(base.oilPerCycleDay_bbl, 1)} bbl`, `${fmtFixed(now.oilPerCycleDay_bbl, 1)} bbl`],
                ["Steam-oil ratio", fmtFixed(base.sor, 2), fmtFixed(now.sor, 2)],
                ["Lift energy", `${fmtInt(base.energy_kWh)} kWh`, `${fmtInt(now.energy_kWh)} kWh`],
                ["Energy per barrel", `${fmtFixed(base.kWhPerBbl, 2)} kWh`, `${fmtFixed(now.kWhPerBbl, 2)} kWh`],
                ["Rod-float days", String(base.floatDays), String(now.floatDays)],
                ["Failure chance", `${fmtFixed(base.failureChance * 100, 0)}%`, `${fmtFixed(now.failureChance * 100, 0)}%`],
              ].map(([k, b, n]) => (
                <tr key={k} className="border-b border-rule last:border-b-0">
                  <td className="py-[7px] pl-3.5 text-[12px] text-ink-2">{k}</td>
                  <td className="py-[7px] text-right font-mono text-[11px] text-ink-2">{b}</td>
                  <td className="py-[7px] pr-3.5 text-right font-mono text-[11px] font-semibold text-ink">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-rule px-3.5 py-3 text-[11px] leading-[1.45] text-ink-3">
            Failure chance uses the stated Weibull hazard on rod-float loading plus a base rate of{" "}
            {fmtFixed(dataset.assumptions.reliability.baseFailuresPerYear, 2)} a year. It compares settings, it does not forecast a date.
            {now.noResteam && (
              <span className="mt-1.5 block font-semibold text-alert">
                At this cut-off no re-steam day comes within {now.productionLeg_d} days: a new cycle never pays for its steam.
              </span>
            )}
          </p>
        </Panel>
      </div>
    </div>
  );
}
