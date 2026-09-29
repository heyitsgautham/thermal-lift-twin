"use client";

import { fieldRisk, OPERATING, practiceSetting, type WellRisk } from "@bgw/optimise";
import { apiToSpecificGravity, pumpDisplacement_bbl_per_d, simulateStroke } from "@bgw/physics";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { AxisX, AxisY, ChartFrame, GridY, linePath, linearScale } from "@/components/kit/chart";
import { Chip, Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { useTwinContext } from "@/components/twin/twin-provider";
import { Button } from "@/components/ui/button";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACTION_TEXT: Record<WellRisk["action"], string> = {
  inspect: "Pull and inspect rods",
  "slow-downstroke": "Switch to slow downstroke",
  monitor: "Monitor",
};

function pct(v: number): string {
  const p = v * 100;
  return p < 1 ? "<1" : p < 10 ? fmtFixed(p, 1) : fmtInt(p);
}

function Sparkline({ values, threshold }: { values: number[]; threshold: number }) {
  const w = 96;
  const h = 20;
  const max = Math.max(0.3, ...values);
  const xs = (i: number) => (i / (values.length - 1)) * w;
  const ys = (v: number) => h - (v / max) * h;
  return (
    <svg width={w} height={h} aria-hidden className="block">
      <line x1={0} x2={w} y1={ys(threshold)} y2={ys(threshold)} stroke="var(--ink)" strokeOpacity={0.25} strokeDasharray="2 2" />
      <path d={linePath(values.map((v, i) => [xs(i), ys(v)] as [number, number]))} fill="none" stroke="var(--ink)" strokeWidth={1.2} />
      <circle cx={xs(values.length - 1)} cy={ys(values.at(-1)!)} r={2} fill={values.at(-1)! > threshold ? "var(--alert)" : "var(--ink)"} />
    </svg>
  );
}

function RiskBar({ risk, scale = 0.6 }: { risk: WellRisk["risk"]; scale?: number }) {
  const w = 120;
  const x = (v: number) => Math.min(w, (v / scale) * w);
  return (
    <svg width={w} height={12} aria-hidden className="block">
      <rect x={0} y={5} width={w} height={2} fill="var(--ink)" opacity={0.08} />
      <rect x={x(risk.low)} y={2} width={Math.max(2, x(risk.high) - x(risk.low))} height={8} rx={1} fill={risk.high >= 0.15 ? "var(--alert)" : "var(--ink)"} opacity={risk.high >= 0.15 ? 0.3 : 0.18} />
      <rect x={x(risk.central) - 1} y={0} width={2} height={12} fill={risk.high >= 0.15 ? "var(--alert)" : "var(--ink)"} />
    </svg>
  );
}

interface WorkOrder {
  id: string;
  wellId: string;
  action: string;
  due_d: number;
  status: "proposed" | "raised";
}

export function ReliabilityScreen() {
  const { twin, dataset, setFocusWell } = useTwinContext();
  const asOf = dataset.meta.asOf;
  const a = dataset.assumptions.reliability;
  const risks = useMemo(() => fieldRisk(twin.field, twin.proposal, dataset.health, a), [twin.field, twin.proposal, dataset.health, a]);
  const [selected, setSelected] = useState(risks[0]!.wellId);
  const sel = risks.find((r) => r.wellId === selected) ?? risks[0]!;
  const flagged = risks.filter((r) => r.risk.high >= 0.1);
  const [raised, setRaised] = useState<Set<string>>(new Set());

  const orders: WorkOrder[] = risks
    .filter((r) => r.action !== "monitor")
    .map((r, i) => ({
      id: `WO-2609-${String(31 + i).padStart(3, "0")}`,
      wellId: r.wellId,
      action: ACTION_TEXT[r.action],
      due_d: r.action === "inspect" ? 2 : 5,
      status: raised.has(r.wellId) ? "raised" : "proposed",
    }));

  const cards = useMemo(() => {
    const model = twin.field.model(sel.wellId);
    const well = model.well;
    const pump = well.css?.pump ?? well.cold!.pump;
    const day = twin.field.dayState(sel.wellId, twin.proposal, 0) ?? twin.field.dayState(sel.wellId, twin.proposal, -1);
    if (!day) return null;
    const density = apiToSpecificGravity(well.fluid.api_deg) * 1000;
    const perSpm = pumpDisplacement_bbl_per_d({ ...pump, fillage_frac: OPERATING.fillageTarget_frac }, 1);
    const setting = practiceSetting({ liquid: day.state.liquid_bbl_per_d, viscosity: day.state.tubingViscosity_cP, density, perSpm, stroke: pump.stroke_in });
    const base = simulateStroke({
      stroke_in: pump.stroke_in,
      spm: setting.spm,
      upstrokeFraction: 0.5,
      viscosity_cP: day.state.tubingViscosity_cP,
      fluidDensity_kg_per_m3: density,
      plungerDiameter_in: pump.plungerDiameter_in,
      fillage_frac: Math.max(0.4, setting.fillage_frac),
    }).downhole;
    // Illustrate the drift score: the load picks up late and sags on the upstroke.
    const k = Math.max(0, sel.risk.drift - 0.05);
    const maxPos = Math.max(...base.map((p) => p.position_m));
    const today = base.map((p, i) => {
      const up = i < base.length / 2;
      const s = p.position_m / maxPos;
      const sag = up ? 1 - 1.3 * k * Math.sin(Math.PI * s) : 1;
      return { position_m: p.position_m, load_kN: p.load_kN * sag - (up && s < 0.25 ? k * 18 * (0.25 - s) : 0) };
    });
    return { base, today };
  }, [twin.field, twin.proposal, sel.wellId, sel.risk.drift]);

  const failureCost = a.workover_inr_lakh + (sel.cost.lostOilIfFails_bbl * a.oilPrice_inr_per_bbl) / 1e5;
  const costMax = Math.max(sel.cost.expectedFailure_inr_lakh, sel.cost.slowing_inr_lakh, 0.5) * 1.15;
  const historyYears = (Date.parse(`${dataset.history.to}T00:00:00Z`) - Date.parse(`${dataset.history.from}T00:00:00Z`)) / (365.25 * 86_400_000);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="reliability">
      <ScreenHeader
        title="Reliability"
        subtitle={<>Estimated failure risk over the next 7 days, from card-shape drift and rod loading, for all {risks.length} producing wells</>}
      >
        <Readout label="Wells above 10%" value={String(flagged.length)} note="upper end of the risk window" tone={flagged.length ? "alert" : "ink"} />
        <Readout
          label="Highest estimate"
          value={`${pct(risks[0]!.risk.central)}%`}
          note={
            <>
              {risks[0]!.wellId}, window {pct(risks[0]!.risk.low)} to {pct(risks[0]!.risk.high)}%
            </>
          }
          testId="readout-highest"
        />
        <Readout label="Failures in history" value={String(dataset.history.failures)} note={<>{fmtFixed(historyYears, 1)} years, synthetic</>} />
        <Readout label="Work orders" value={String(orders.length)} note={`${orders.filter((o) => o.status === "raised").length} raised`} />
      </ScreenHeader>

      <div className="flex items-start gap-2.5 rounded-[3px] border border-shift/60 bg-shift/[0.09] px-3 py-2" data-testid="honesty-note">
        <TriangleAlert className="mt-[1px] size-4 shrink-0 text-heat" />
        <p className="text-[12px] leading-[1.45] text-ink">
          <b className="font-semibold">Estimated risk window under stated assumptions.</b> The hazard shape and the drift gains are set by hand and
          checked only against synthetic history, so these are not calibrated warnings and there is no validated lead time. The window shows how far
          the estimate moves when the least certain assumptions move.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_600px] gap-4 max-[1600px]:grid-cols-[minmax(0,1fr)_470px] max-[1600px]:gap-3">
        <Panel title="Wells by estimated risk, next 7 days" aside="click a well" bodyClassName="overflow-y-auto [scrollbar-width:thin]" testId="risk-table">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-sheet">
              <tr className="border-b border-rule-strong text-left">
                {["Well", "Now", "Card drift, 60 d", "Drift", "Estimated risk window", "Driver", "Failure cost", "Slowing cost", "Action"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "py-2 smallcaps text-[8.5px] font-semibold whitespace-nowrap text-ink-3",
                      i === 0 && "pl-3.5",
                      (i === 3 || i === 6 || i === 7) && "text-right",
                      i >= 4 && "pl-3",
                      i === 8 && "pr-3.5",
                      i === 7 && "max-[1600px]:hidden",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risks.map((r) => {
                const day = twin.evalView.timelines.find((t) => t.wellId === r.wellId)?.days[0];
                const hot = r.risk.high >= 0.15;
                return (
                  <tr
                    key={r.wellId}
                    onClick={() => setSelected(r.wellId)}
                    data-testid={`risk-row-${r.wellId}`}
                    className={cn(
                      "cursor-pointer border-b border-rule transition-colors hover:bg-ink/[0.03]",
                      r.wellId === sel.wellId && "bg-shift/12 hover:bg-shift/15",
                    )}
                  >
                    <td className="py-[5px] pl-3.5 text-[12.5px] font-semibold whitespace-nowrap stretch-semi text-ink">
                      {r.wellId}
                      {r.status === "cold" && <span className="ml-1.5 smallcaps text-[7.5px] font-semibold text-ink-3">cold</span>}
                    </td>
                    <td className="py-[5px]">
                      <Chip tone={day?.phase === "steam" ? "steam" : day?.phase === "soak" ? "soak" : day?.phase === "down" ? "down" : "produce"}>
                        {day?.phase ?? "n/a"}
                      </Chip>
                    </td>
                    <td className="py-[5px]">
                      <Sparkline values={r.health.drift60} threshold={a.driftThreshold} />
                    </td>
                    <td className={cn("py-[5px] text-right font-mono text-[11px]", r.risk.drift > a.driftThreshold ? "font-semibold text-alert" : "text-ink")}>
                      {fmtFixed(r.risk.drift, 2)}
                    </td>
                    <td className="py-[5px] pl-3">
                      <div className="flex items-center gap-2">
                        <RiskBar risk={r.risk} />
                        <span className={cn("font-mono text-[10.5px] whitespace-nowrap", hot ? "font-semibold text-alert" : "text-ink-2")}>
                          {r.risk.high < 0.01 ? "<1%" : `${pct(r.risk.low)}–${pct(r.risk.high)}%`}
                        </span>
                      </div>
                    </td>
                    <td className="py-[5px] pl-3 text-[11.5px] text-ink-2">{r.risk.driver}</td>
                    <td className="py-[5px] pl-3 text-right font-mono text-[11px] text-ink">₹{fmtFixed(r.cost.expectedFailure_inr_lakh, 2)}L</td>
                    <td className="py-[5px] pl-3 text-right font-mono text-[11px] text-ink max-[1600px]:hidden">₹{fmtFixed(r.cost.slowing_inr_lakh, 2)}L</td>
                    <td className="py-[5px] pr-3.5 pl-3">
                      {r.action === "monitor" ? (
                        <span className="text-[11px] text-ink-3">monitor</span>
                      ) : (
                        <Chip tone={r.action === "inspect" ? "alert" : "shift"}>{r.action === "inspect" ? "inspect" : "slow down"}</Chip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <div className="grid min-h-0 grid-rows-[minmax(0,1.15fr)_minmax(0,0.8fr)_auto_auto] gap-3" data-testid="risk-detail">
          <Panel title={`${sel.wellId}: downhole card against its baseline`} aside={`drift ${fmtFixed(sel.risk.drift, 2)}`}>
            {cards ? (
              <ChartFrame margin={{ top: 18, right: 16, bottom: 32, left: 48 }} label="Downhole card against baseline">
                {(box) => {
                  const { x0, x1, y0, y1 } = box.inner;
                  const all = [...cards.base, ...cards.today];
                  const xs = linearScale([0, Math.max(...all.map((p) => p.position_m)) * 1.04], [x0, x1]);
                  const ys = linearScale([Math.min(-2, ...all.map((p) => p.load_kN)), Math.max(...all.map((p) => p.load_kN)) * 1.12], [y1, y0]);
                  const loop = (pts: { position_m: number; load_kN: number }[]) =>
                    linePath(pts.map((p) => [xs(p.position_m), ys(p.load_kN)] as [number, number])) + "Z";
                  return (
                    <g>
                      <GridY scale={ys} x0={x0} x1={x1} ticks={ys.ticks(4)} />
                      <AxisY scale={ys} x={x0} ticks={ys.ticks(4)} format={(v) => fmtInt(v)} label="load, kN" />
                      <AxisX scale={xs} y={y1} ticks={xs.ticks(4)} format={(v) => fmtFixed(v, 1)} label="plunger position, m" />
                      <path d={loop(cards.base)} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="6 3" />
                      <path d={loop(cards.today)} fill="rgb(204 31 26 / 0.07)" stroke="var(--alert)" strokeWidth={2} />
                      <text x={x1 - 4} y={y0 + 10} textAnchor="end" fontSize={9.5} fill="var(--ink)" className="font-mono">
                        baseline card
                      </text>
                      <text x={x1 - 4} y={y0 + 23} textAnchor="end" fontSize={9.5} fill="var(--alert)" className="font-mono">
                        today
                      </text>
                    </g>
                  );
                }}
              </ChartFrame>
            ) : (
              <p className="p-3.5 text-[12px] text-ink-2">{sel.wellId} is not pumping today, it is in steam or soak.</p>
            )}
          </Panel>

          <Panel title="Card drift, last 60 days" aside={`slope ${fmtFixed(sel.risk.slope_per_d * 7, 3)} per week`}>
            <ChartFrame margin={{ top: 14, right: 16, bottom: 28, left: 48 }} label="Card drift trend">
              {(box) => {
                const { x0, x1, y0, y1 } = box.inner;
                const v = sel.health.drift60;
                const xs = linearScale([-v.length, 0], [x0, x1]);
                const ys = linearScale([0, Math.max(0.3, ...v) * 1.1], [y1, y0]);
                return (
                  <g>
                    <GridY scale={ys} x0={x0} x1={x1} ticks={ys.ticks(3)} />
                    <AxisY scale={ys} x={x0} ticks={ys.ticks(3)} format={(t) => fmtFixed(t, 1)} />
                    <AxisX scale={xs} y={y1} ticks={[-60, -45, -30, -15, 0]} format={(d) => (d === 0 ? "today" : shortDate(asOf, d))} />
                    <line x1={x0} x2={x1} y1={ys(a.driftThreshold)} y2={ys(a.driftThreshold)} stroke="var(--ink)" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <text x={x0 + 4} y={ys(a.driftThreshold) - 4} fontSize={9} fill="var(--ink-3)" className="font-mono">
                      normal scatter
                    </text>
                    <path d={linePath(v.map((d, i) => [xs(i - v.length + 1), ys(d)] as [number, number]))} fill="none" stroke="var(--alert)" strokeWidth={1.8} />
                  </g>
                );
              }}
            </ChartFrame>
          </Panel>

          <Panel title="Cost of a failure against cost of slowing down" aside="next 7 days" testId="cost-panel">
            <div className="flex flex-col gap-2 px-3.5 py-3">
              {[
                {
                  label: "Expected failure cost",
                  value: sel.cost.expectedFailure_inr_lakh,
                  note: `${pct(sel.risk.central)}% × ₹${fmtFixed(failureCost, 1)} lakh (workover plus ${fmtInt(sel.cost.lostOilIfFails_bbl)} bbl lost)`,
                  color: "var(--alert)",
                },
                {
                  label: "Cost of slowing down",
                  value: sel.cost.slowing_inr_lakh,
                  note:
                    sel.slowingLoss_bbl < 0.5
                      ? "the slowest setting still lifts all the inflow"
                      : `${fmtInt(sel.slowingLoss_bbl)} bbl the slowest setting cannot lift`,
                  color: "var(--produce)",
                },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-[150px_1fr_74px] items-center gap-2">
                  <span className="text-[12px] text-ink">{row.label}</span>
                  <div className="h-3 rounded-[1px] bg-ink/6">
                    <div className="h-3 rounded-[1px]" style={{ width: `${Math.max(1, (row.value / costMax) * 100)}%`, background: row.color }} />
                  </div>
                  <span className="text-right font-mono text-[12px] text-ink">₹{fmtFixed(row.value, 2)}L</span>
                  <span className="col-span-3 -mt-1 text-[10.5px] text-ink-3">{row.note}</span>
                </div>
              ))}
              <p className="text-[12px] leading-[1.4] text-ink">
                <b className="font-semibold">{ACTION_TEXT[sel.action]}.</b>{" "}
                {sel.cost.expectedFailure_inr_lakh > sel.cost.slowing_inr_lakh
                  ? "Slowing costs less than the failure it may prevent."
                  : "Slowing costs more than the failure risk it would buy down, so keep it running and watch the drift."}
              </p>
            </div>
          </Panel>

          <Panel title="Work orders" aside="raised by the twin, approved by the engineer">
            <ul className="flex flex-col px-3.5 py-1.5" data-testid="work-orders">
              {orders.slice(0, 3).map((o) => (
                <li key={o.id} className="grid grid-cols-[88px_58px_1fr_auto] items-center gap-2 border-b border-rule py-[5px] last:border-b-0">
                  <span className="font-mono text-[10.5px] text-ink-2">{o.id}</span>
                  <button className="text-left text-[12px] font-semibold stretch-semi text-ink hover:underline" onClick={() => { setSelected(o.wellId); setFocusWell(o.wellId); }}>
                    {o.wellId}
                  </button>
                  <span className="text-[12px] text-ink">
                    {o.action}, by {shortDate(asOf, o.due_d)}
                  </span>
                  {o.status === "raised" ? (
                    <Chip tone="produce">raised</Chip>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-rule-strong bg-sheet"
                      onClick={() => setRaised((s) => new Set(s).add(o.wellId))}
                      data-testid={`raise-${o.wellId}`}
                    >
                      <ClipboardCheck data-icon="inline-start" />
                      Raise
                    </Button>
                  )}
                </li>
              ))}
              {orders.length === 0 && <li className="py-2 text-[12px] text-ink-2">No work orders this week.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
