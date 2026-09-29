"use client";

import { MODEL, ROD_STRING, simulateStroke, viscosity_cP } from "@bgw/physics";
import { OPERATING } from "@bgw/optimise";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { AxisX, AxisY, ChartFrame, GridY, linePath, linearScale } from "@/components/kit/chart";
import { Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { useTwinContext } from "@/components/twin/twin-provider";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { useCycleView } from "./cycle-plan";
import { BRAND } from "@/lib/brand";

function Spark({ points, color, log = false }: { points: [number, number][]; color: string; log?: boolean }) {
  const w = 240;
  const h = 64;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => (log ? Math.log10(p[1]) : p[1]));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const px = (x: number) => ((x - x0) / (x1 - x0 || 1)) * (w - 4) + 2;
  const py = (y: number) => h - 4 - ((y - y0) / (y1 - y0 || 1)) * (h - 8);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" aria-hidden preserveAspectRatio="none">
      <path d={linePath(points.map((p, i) => [px(p[0]), py(ys[i]!)] as [number, number]))} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ChainNode({
  step,
  title,
  method,
  equation,
  pins,
  children,
  delay,
}: {
  step: string;
  title: string;
  method: string;
  equation: string;
  pins: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <div className="rise-in flex min-w-0 flex-col gap-2 rounded-[3px] border border-rule-strong bg-sheet px-3.5 py-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-steam">{step}</span>
        <span className="text-[15px] font-bold stretch-semi text-ink">{title}</span>
      </div>
      <span className="smallcaps text-[8.5px] font-semibold text-ink-3">{method}</span>
      <code className="rounded-[2px] bg-sand/70 px-2 py-1.5 font-mono text-[10.5px] leading-snug text-ink">{equation}</code>
      {children}
      <p className="text-[11px] leading-snug text-ink-2">{pins}</p>
    </div>
  );
}

export function ModelScreen() {
  const { twin, dataset } = useTwinContext();
  const asOf = dataset.meta.asOf;
  const view = useCycleView("BGW-14");
  const model = twin.field.model("BGW-14");
  const well = model.well;

  const sparks = useMemo(() => {
    const days = view.nextPlan?.days ?? [];
    const temp = days.map((d) => [d.t, d.temperature_C] as [number, number]);
    const visc: [number, number][] = [];
    for (let T = 45; T <= 200; T += 5) visc.push([T, viscosity_cP(model.fluid.viscosity, T)]);
    const oil = days.map((d) => [d.t, d.oil_bbl_per_d] as [number, number]);
    const card = simulateStroke({
      stroke_in: well.css!.pump.stroke_in,
      spm: 3,
      upstrokeFraction: 0.5,
      viscosity_cP: 6000,
      fluidDensity_kg_per_m3: 946,
      plungerDiameter_in: well.css!.pump.plungerDiameter_in,
      fillage_frac: 0.8,
    }).surface.map((p) => [p.position_m, p.load_kN] as [number, number]);
    return { temp, visc, oil, card };
  }, [view.nextPlan, model, well]);

  const cal = dataset.calibration.find((c) => c.wellId === "BGW-14")!;
  const stats = useMemo(() => {
    let n = 0;
    let ssRes = 0;
    let sum = 0;
    let bias = 0;
    const pairs: [number, number][] = [];
    cal.logged.forEach((l, i) => {
      if (l === null) return;
      pairs.push([l, cal.model[i]!]);
    });
    for (const [l] of pairs) sum += l;
    const mean = sum / pairs.length;
    let ssTot = 0;
    for (const [l, m] of pairs) {
      n++;
      ssRes += (l - m) ** 2;
      ssTot += (l - mean) ** 2;
      bias += l - m;
    }
    return { r2: 1 - ssRes / ssTot, biasPct: (bias / sum) * 100, missing: cal.logged.length - n, n };
  }, [cal]);

  const todayRate = twin.evalCurrent.timelines.reduce((s, t) => s + t.days[0]!.oil_bbl_per_d, 0);
  const anchors: [string, string, string][] = [
    ["Wells drilled, producing, on CSS", `${dataset.field.wellsDrilled}, ${dataset.field.wellsProducing}, ${dataset.field.wellsOnCss}`, "field make-up"],
    ["Crude viscosity at 50 °C", "10,000 to 13,000 cP", "per-well Walther anchor"],
    ["Gravity", "17 to 19° API", "density, cSt to cP"],
    ["Reservoir temperature", "46 to 48 °C", "cooling baseline"],
    ["Jodhpur Sandstone", "about 1,150 m", "pump at 1,100 m, map depth"],
    ["Field area", "200.26 km²", "map outline"],
    ["CSS pilot", "BGW-8, 2018", "cycle history start"],
    ["Field rate, April 2026", "1,202 bopd", `model today: ${fmtInt(todayRate)} bopd`],
  ];
  const assumptions: [string, string][] = [
    ["Steam generators", `${dataset.assumptions.generatorUnits} × ${fmtFixed(dataset.assumptions.generatorUnitCapacity_t_per_h, 1)} t/h, a setting`],
    ["Second viscosity anchor", `${dataset.assumptions.viscosityHighAnchor.viscosity_cP} cP at ${dataset.assumptions.viscosityHighAnchor.temperature_C} °C`],
    ["Cooling time", `${MODEL.coolingTau_d} d at ${fmtInt(MODEL.referenceSteam_t)} t of steam`],
    ["Steam cost in the re-steam rule", `${fmtFixed(dataset.assumptions.steamCost_bbl_per_t, 2)} bbl oil per tonne`],
    ["Pump limits", `${ROD_STRING.minSpm} to ${ROD_STRING.maxSpm} SPM, downstroke up to ${OPERATING.maxDownstrokeStretch}× the upstroke`],
    ["Failure hazard", `Weibull, shape ${dataset.assumptions.reliability.weibullShape}, scale ${dataset.assumptions.reliability.weibullScale_impact} impact units`],
    ["Base failure rate", `${dataset.assumptions.reliability.baseFailuresPerYear} per well-year`],
    ["Oil price, workover", `₹${fmtInt(dataset.assumptions.reliability.oilPrice_inr_per_bbl)}/bbl, ₹${dataset.assumptions.reliability.workover_inr_lakh} lakh`],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="model">
      <ScreenHeader title="Model" subtitle="The chain the twin runs, the published points it is pinned to, and where every number on these screens comes from">
        <Readout label="Daily history rows" value={fmtInt(dataset.history.dailyRows)} note={<>{dataset.history.from.slice(0, 4)} to {dataset.history.to.slice(0, 4)}, 33 wells</>} />
        <Readout label="Failures in history" value={String(dataset.history.failures)} note="drawn from the stated hazard" />
        <Readout label="Missing days" value={`${fmtFixed(dataset.history.missingFraction * 100, 1)}%`} note={`${dataset.history.frozenRuns} frozen-tag runs`} />
        <Readout label="Seed" value={String(dataset.meta.seed)} note={`generator ${dataset.meta.generatorVersion}`} />
      </ScreenHeader>

      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-2" data-testid="model-chain">
        <ChainNode
          step="1"
          title="Heated zone"
          method="lumped cooling after soak, Boberg-Lantz style"
          equation="T(t) = Tr + (T0 − Tr)·e^(−t/τ)"
          pins={`τ = ${MODEL.coolingTau_d} d at ${fmtInt(MODEL.referenceSteam_t)} t, grows with steam. Tr from the published 46 to 48 °C.`}
          delay={0}
        >
          <Spark points={sparks.temp} color="var(--heat)" />
        </ChainNode>
        <ArrowRight className="self-center text-ink-3" />
        <ChainNode
          step="2"
          title="Viscosity"
          method="ASTM D341, Walther"
          equation="log log(ν + 0.7) = A − B·log T"
          pins="Pinned per well to its 50 °C value inside the published 10,000 to 13,000 cP."
          delay={120}
        >
          <Spark points={sparks.visc} color="var(--ink)" log />
        </ChainNode>
        <ArrowRight className="self-center text-ink-3" />
        <ChainNode
          step="3"
          title="Inflow"
          method="productivity scaled by mobility"
          equation="q = q_cold·(μ_cold/μ)^β·0.93^(n−1)"
          pins="β of 0.40 to 0.46 stands for the share of drawdown in the heated zone. Steam condensate sets early water cut."
          delay={240}
        >
          <Spark points={sparks.oil} color="var(--produce)" />
        </ChainNode>
        <ArrowRight className="self-center text-ink-3" />
        <ChainNode
          step="4"
          title="Pump and rods"
          method="API RP 11L, Couette drag, Gibbs wave equation"
          equation="v_fall = w_b·ln(R/r) / (2πμ)"
          pins="Displacement 0.1166·S·N·D². Rods float when the downstroke outruns v_fall. Cards from the damped wave equation."
          delay={360}
        >
          <Spark points={sparks.card} color="var(--alert)" />
        </ChainNode>
        <ArrowRight className="self-center text-ink-3" />
        <ChainNode
          step="5"
          title="Outputs"
          method="one state, every screen"
          equation="oil, SOR, kWh/bbl, loads, hazard"
          pins="Calendar, cycle plan, pump twin, reliability and what-if all read from this one chain, so no two screens can disagree."
          delay={480}
        >
          <div className="grid h-16 grid-cols-2 content-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-ink">
            <span>oil bbl/d</span>
            <span>SOR</span>
            <span>kWh/bbl</span>
            <span>kN loads</span>
          </div>
        </ChainNode>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 max-[1600px]:gap-3">
        <Panel title="Calibration, BGW-14 logged against model" aside={`R² ${fmtFixed(stats.r2, 3)} · bias ${fmtFixed(stats.biasPct, 1)}% · ${stats.missing} days missing`} testId="calibration">
          <ChartFrame margin={{ top: 20, right: 16, bottom: 52, left: 52 }} label="Calibration">
            {(box) => {
              const { x0, x1, y0, y1 } = box.inner;
              const n = cal.model.length;
              const xs = linearScale([cal.from_d, cal.from_d + n], [x0, x1]);
              const ys = linearScale([0, Math.max(...cal.model, ...cal.logged.map((v) => v ?? 0)) * 1.1], [y1, y0]);
              const ticks: number[] = [];
              for (let d = cal.from_d + 30; d < cal.from_d + n; d += 90) ticks.push(d);
              return (
                <g>
                  <GridY scale={ys} x0={x0} x1={x1} ticks={ys.ticks(4)} />
                  <AxisY scale={ys} x={x0} ticks={ys.ticks(4)} format={(v) => fmtInt(v)} label="oil, bbl/d" />
                  <AxisX scale={xs} y={y1} ticks={ticks} format={(d) => shortDate(asOf, d)} />
                  {cal.logged.map((v, i) =>
                    v === null ? null : <circle key={i} cx={xs(cal.from_d + i)} cy={ys(v)} r={1.6} fill="var(--ink)" opacity={0.45} />,
                  )}
                  <path d={linePath(cal.model.map((v, i) => [xs(cal.from_d + i), ys(v)] as [number, number]))} fill="none" stroke="var(--produce)" strokeWidth={1.8} />
                  <text x={x0} y={y1 + 36} fontSize={10} fill="var(--ink-2)">
                    Dots are the logged daily oil, with sensor noise and missing days. The line is the model. The history was generated by the same
                  </text>
                  <text x={x0} y={y1 + 49} fontSize={10} fill="var(--ink-2)">
                    physics, so this fit checks the plumbing, not the physics. Field records from OIL are the real test.
                  </text>
                </g>
              );
            }}
          </ChartFrame>
        </Panel>
        <Panel title="Published points the model is pinned to" aside={`OIL ${BRAND.field || "field"} page; OIL press release, April 2026`} bodyClassName="overflow-y-auto">
          <table className="w-full border-collapse">
            <tbody>
              {anchors.map(([k, v, use]) => (
                <tr key={k} className="border-b border-rule last:border-b-0">
                  <td className="py-[7px] pl-3.5 text-[12px] text-ink">{k}</td>
                  <td className="py-[7px] text-right font-mono text-[11px] whitespace-nowrap text-ink">{v}</td>
                  <td className="py-[7px] pr-3.5 pl-3 text-right text-[11px] text-ink-3">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Assumptions and provenance" aside={`data/demo, ${dataset.history.file.split("/").pop()}`} bodyClassName="overflow-y-auto">
          <table className="w-full border-collapse">
            <tbody>
              {assumptions.map(([k, v]) => (
                <tr key={k} className="border-b border-rule last:border-b-0">
                  <td className="py-[7px] pl-3.5 text-[12px] text-ink">{k}</td>
                  <td className="py-[7px] pr-3.5 text-right font-mono text-[10.5px] text-ink">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-rule px-3.5 py-2.5 text-[11px] leading-[1.45] text-ink-2">
            Every row of the eight-year history comes from the simulator in packages/simulate with seed {dataset.meta.seed}. Noise, missing days
            and frozen tags are added last. Nothing on these screens is OIL field data.
          </p>
        </Panel>
      </div>
    </div>
  );
}
