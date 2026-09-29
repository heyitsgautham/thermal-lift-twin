"use client";

import { repairPlan, shiftSlot, type PlanEvaluation, type RepairResult, type WellTimeline } from "@bgw/optimise";
import { useEffect, useRef, useState } from "react";
import { dateRange, dayInfo, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt, fmtSigned, fmtShift } from "@/lib/format";
import { cn } from "@/lib/utils";
import { clamp, easeInOut, easeOut, since, storyData } from "./data";
import { FIELD_TIMING, story, type StoryState } from "./store";
import { YearOverlay } from "./year-overlay";

// The 19 steam wells on the shared generators for the next 90 days. Drag
// BGW-14 to its re-steam day, the generators overload, the twin moves the
// cheapest other well, and the plan fits again. The same engine as Fable's
// steam calendar, drawn for one decision.

const LABEL_W = 92;
const LANE_H = 150;
const AXIS_H = 30;
const ROW_H = 26;
const LOAD_MAX = 30;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface Run {
  from: number;
  to: number;
  phase: "steam" | "soak" | "produce" | "down";
  slotId: string | null;
  oil: number;
}

function runs(t: WellTimeline): Run[] {
  const out: Run[] = [];
  t.days.forEach((c, d) => {
    const last = out.at(-1);
    if (last && last.phase === c.phase && last.slotId === c.slotId) {
      last.to = d + 1;
      last.oil = Math.max(last.oil, c.oil_bbl_per_d);
    } else out.push({ from: d, to: d + 1, phase: c.phase, slotId: c.slotId, oil: c.oil_bbl_per_d });
  });
  return out;
}

// Plans the story can reach, evaluated once each. The drag moves in whole days, so there are few.
const evals = new Map<number, PlanEvaluation>();
function evalAt(delta: number): PlanEvaluation {
  const { field, fieldStory: fs } = storyData();
  let ev = evals.get(delta);
  if (!ev) {
    ev = delta === 0 ? fs.issued : field.evaluate(shiftSlot(field.dataset.issuedPlan, fs.slotId, delta), fs.capacity);
    evals.set(delta, ev);
  }
  return ev;
}

const repairs = new Map<number, RepairResult>();
function repairAt(delta: number): RepairResult {
  const { field, fieldStory: fs } = storyData();
  if (delta === fs.to_d - fs.from_d) return fs.repair;
  let r = repairs.get(delta);
  if (!r) {
    r = repairPlan(field, shiftSlot(field.dataset.issuedPlan, fs.slotId, delta), new Set([fs.slotId]), fs.capacity);
    repairs.set(delta, r);
  }
  return r;
}

let order: string[] | null = null;
/** Steam wells in the order of their next planned steam, so the schedule reads as a staircase. */
function wellOrder(): string[] {
  if (!order) {
    const { field } = storyData();
    order = field.cssWells
      .map((w) => ({ id: w.id, first: field.dataset.issuedPlan.filter((p) => p.wellId === w.id).reduce((m, p) => Math.min(m, p.start_d), 999) }))
      .sort((a, b) => a.first - b.first || a.id.localeCompare(b.id))
      .map((r) => r.id);
  }
  return order;
}

export function FieldView({ s }: { s: StoryState }) {
  const { field, fieldStory: fs, asOf } = storyData();
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = field.horizon_d;
  const chartW = Math.max(1, w - LABEL_W - 16);
  const dayW = chartW / H;
  const x = (d: number) => LABEL_W + d * dayW;
  const f = s.field;

  const issued = fs.issued;
  const slot = field.dataset.issuedPlan.find((p) => p.id === fs.slotId)!;
  const bounds = field.slotBounds(field.dataset.issuedPlan, fs.slotId);
  const repair = f.stage === "idle" || f.stage === "dragging" || f.delta === 0 ? null : repairAt(f.delta);

  const settle = f.stage === "resolved" && repair ? easeInOut(since(s.t, f.stageAt, FIELD_TIMING.settle_ms)) : 0;
  const edited = f.stage === "idle" ? issued : evalAt(f.delta);
  const view = f.stage === "resolved" && repair ? repair.after : edited;
  // The twin's move shows only once it lands, so the overload is seen before the answer.
  const landed = f.stage === "resolved" ? (repair?.moves ?? []) : [];
  const moved = new Map(landed.map((m) => [m.slotId, m.delta_d]));
  const movedWells = new Set(landed.map((m) => m.wellId));
  const order = wellOrder();

  // Pointer drag of BGW-14's steam block, in whole days.
  const drag = useRef<{ x0: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (f.stage !== "idle") return;
    drag.current = { x0: e.clientX };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    story.fieldDrag(0);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const delta = clamp(Math.round((e.clientX - drag.current.x0) / dayW), bounds.min_d - slot.start_d, bounds.max_d - slot.start_d);
    if (delta !== f.delta) story.fieldDrag(delta);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    story.fieldDrop(evalAt(f.delta).overloadDays.length > 0);
  };

  // Generator load, easing from the edited plan to the proposal as the twin's move lands.
  const loadAt = (d: number) => {
    const a = edited.load[d]!;
    const b = view.load[d]!;
    return { total: a.total_t_per_h + (b.total_t_per_h - a.total_t_per_h) * settle, a, b };
  };
  const cap = edited.capacity_t_per_h;
  const laneY = (v: number) => LANE_H - 8 - (v / LOAD_MAX) * (LANE_H - 30);
  const over = f.stage === "overload" || f.stage === "resolving" || (f.stage === "dragging" && edited.overloadDays.length > 0) ? edited.overloadDays : [];
  const overRange = over.length ? dateRange(asOf, over[0]!, over.at(-1)!).replace("–", " to ") : "";
  const cleared = f.stage === "resolved" && repair?.feasible ? since(s.t, f.stageAt + 300, 500) : 0;
  const peak = edited.overloadDays.reduce((m, d) => Math.max(m, edited.load[d]!.total_t_per_h), 0);
  const months: number[] = [];
  for (let d = 0; d < H; d++) if (dayInfo(asOf, d).firstOfMonth) months.push(d);

  const rowsTop = LANE_H + AXIS_H;
  const hi14 = order.indexOf(fs.wellId);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_420px] gap-3 p-4" data-testid="field-view">
      <section className="relative flex min-h-0 flex-col gap-2 rounded-[4px] border border-rule-strong bg-sheet/85 px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-4">
            <h2 className="text-[26px] leading-none font-bold stretch-semi">Steam schedule</h2>
            <span className="text-[16px] text-ink-2">
              {order.length} steam wells, next {H} days from {shortDate(asOf, 0)}
            </span>
          </div>
          <span className="text-[15px] text-ink-2">
            {field.assumptions.generatorUnits} steam generators × {fmtFixed(field.assumptions.generatorUnitCapacity_t_per_h, 1)} t/h, assumed
          </span>
        </div>
        <div ref={ref} className="relative min-h-0 flex-1">
          {w > 0 && (
            <svg width={w} height={rowsTop + order.length * ROW_H + 4} className="block touch-none select-none" onPointerMove={onMove} onPointerUp={onUp}>
              <text x={0} y={18} fontSize={14} fontWeight={700} letterSpacing="0.08em" fill="var(--ink)" style={{ fontFamily: "var(--font-archivo)" }}>
                GENERATOR LOAD
              </text>
              <text x={0} y={36} fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
                t/h of steam
              </text>
              {over.length > 0 && (
                <rect x={x(over[0]!)} y={4} width={x(over.at(-1)! + 1) - x(over[0]!)} height={rowsTop + order.length * ROW_H - 4} fill="var(--alert)" opacity={0.08 * (1 - cleared)} />
              )}
              {Array.from({ length: H }, (_, d) => {
                const L = loadAt(d);
                const segs = (settle > 0.5 ? L.b : L.a).segments;
                let acc = 0;
                const scale = segs.length ? L.total / segs.reduce((m, g) => m + g.rate_t_per_h, 0) : 0;
                return (
                  <g key={d}>
                    {segs.map((g, i) => {
                      const y0 = laneY(acc);
                      acc += g.rate_t_per_h * scale;
                      const y1 = laneY(acc);
                      const fill = g.wellId === fs.wellId ? "var(--steam-deep)" : movedWells.has(g.wellId) && f.stage === "resolved" ? "var(--shift)" : "var(--steam)";
                      return <rect key={i} x={x(d) + 0.6} y={y1} width={dayW - 1.2} height={Math.max(0, y0 - y1 - 0.8)} fill={fill} opacity={g.wellId === fs.wellId || movedWells.has(g.wellId) ? 1 : 0.55} />;
                    })}
                    {L.total > cap + 1e-9 && (
                      <rect x={x(d) + 0.6} y={laneY(L.total)} width={dayW - 1.2} height={laneY(cap) - laneY(L.total)} fill="var(--alert)" />
                    )}
                  </g>
                );
              })}
              <path d={`M${x(0)} ${laneY(cap)} H${x(H)}`} stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="6 4" />
              <text x={x(H) - 4} y={laneY(cap) - 7} textAnchor="end" fontSize={14} fill="var(--ink)" fontWeight={600} style={{ fontFamily: "var(--font-archivo)" }}>
                capacity {fmtFixed(cap, 1)} t/h
              </text>
              {over.length > 0 && (
                <text x={(x(over[0]!) + x(over.at(-1)! + 1)) / 2} y={laneY(peak) - 8} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--alert)" opacity={1 - cleared} className="font-mono">
                  {fmtFixed(peak, 1)} t/h
                </text>
              )}
              {cleared > 0 && over.length === 0 && repair && (
                <text
                  x={(x(repair.edited.overloadDays[0]!) + x(repair.edited.overloadDays.at(-1)! + 1)) / 2}
                  y={laneY(cap) - 24}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={700}
                  fill="var(--produce)"
                  opacity={cleared}
                  style={{ fontFamily: "var(--font-archivo)" }}
                >
                  cleared
                </text>
              )}
              {months.map((d) => (
                <g key={d}>
                  <path d={`M${x(d)} ${LANE_H - 4} V${rowsTop + order.length * ROW_H}`} stroke="var(--rule-strong)" />
                  <text x={x(d) + 5} y={LANE_H + 18} fontSize={14} fontWeight={600} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
                    {dayInfo(asOf, d).month}
                  </text>
                </g>
              ))}
              {order.map((id, i) => {
                const y = rowsTop + i * ROW_H;
                const tl = view.timelines.find((t) => t.wellId === id)!;
                const isHero = id === fs.wellId;
                const isMoved = movedWells.has(id) && f.stage === "resolved";
                return (
                  <g key={id}>
                    {(isHero || isMoved) && <rect x={0} y={y} width={x(H)} height={ROW_H} fill={isHero ? "var(--sand-deep)" : "rgb(245 158 11 / 0.14)"} />}
                    <text x={0} y={y + 18} fontSize={15} fontWeight={isHero || isMoved ? 800 : 500} fill={isHero || isMoved ? "var(--ink)" : "var(--ink-2)"} style={{ fontFamily: "var(--font-archivo)" }}>
                      {id}
                    </text>
                    {runs(tl).map((r, j) => {
                      const shift = r.slotId && moved.has(r.slotId) ? -(1 - settle) * moved.get(r.slotId)! * dayW : 0;
                      if (r.phase === "produce")
                        return <rect key={j} x={x(r.from) + shift} y={y + 7} width={(r.to - r.from) * dayW} height={12} fill="var(--produce)" opacity={0.14 + 0.3 * clamp(r.oil / 70, 0, 1)} />;
                      if (r.phase === "down") return <rect key={j} x={x(r.from)} y={y + 7} width={(r.to - r.from) * dayW} height={12} fill="var(--down)" opacity={0.5} />;
                      const hero = isHero && r.slotId === fs.slotId;
                      return (
                        <rect
                          key={j}
                          x={x(r.from) + shift + 0.5}
                          y={y + 4}
                          width={(r.to - r.from) * dayW - 1}
                          height={ROW_H - 8}
                          rx={2}
                          fill={r.phase === "steam" ? "var(--steam)" : "var(--soak)"}
                          stroke={hero || (r.slotId && moved.has(r.slotId)) ? "var(--ink)" : "none"}
                          strokeWidth={1.6}
                          style={hero && f.stage === "idle" ? { cursor: "grab" } : undefined}
                          onPointerDown={hero ? onDown : undefined}
                          data-testid={hero && r.phase === "steam" ? "hero-steam-block" : undefined}
                        />
                      );
                    })}
                  </g>
                );
              })}
              {hi14 >= 0 && (
                <g>
                  <path d={`M${x(fs.to_d)} ${rowsTop + hi14 * ROW_H - 4} V${rowsTop + hi14 * ROW_H + ROW_H + 2}`} stroke="var(--produce)" strokeWidth={2.4} />
                  <rect x={x(fs.to_d) - 104} y={rowsTop + hi14 * ROW_H + 3} width={98} height={20} rx={3} fill="var(--produce)" opacity={f.stage === "idle" || f.stage === "dragging" ? 1 : 0} />
                  <text x={x(fs.to_d) - 55} y={rowsTop + hi14 * ROW_H + 18} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fbf4e8" opacity={f.stage === "idle" || f.stage === "dragging" ? 1 : 0} style={{ fontFamily: "var(--font-archivo)" }}>
                    due {shortDate(asOf, fs.to_d)}
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>
        {f.year && <YearOverlay s={s} />}
      </section>
      <FieldStatus s={s} repair={repair} edited={edited} overRange={overRange} peak={peak} />
    </div>
  );
}

function FieldStatus({ s, repair, edited, overRange, peak }: { s: StoryState; repair: RepairResult | null; edited: PlanEvaluation; overRange: string; peak: number }) {
  const { fieldStory: fs, asOf } = storyData();
  const f = s.field;
  const cap = edited.capacity_t_per_h;
  const clears = repair?.options.filter((o) => o.status === "clears") ?? [];
  const move = repair?.moves[0];
  const shown = f.stage === "resolving" ? Math.floor(since(s.t, f.stageAt + 300, 2400) * clears.length + 0.001) : clears.length;
  const k = (at: number) => easeOut(since(s.t, at, 450));
  let chip: { text: string; cls: string };
  let head: React.ReactNode;
  let sub: React.ReactNode;
  if (f.stage === "idle") {
    chip = { text: "Plan in force", cls: "bg-ink text-[#fbf4e8]" };
    head = <>{fs.wellId} is due on {shortDate(asOf, fs.to_d)}</>;
    sub = <>The plan steams it on {shortDate(asOf, fs.from_d)}, {fs.from_d - fs.to_d} days late.</>;
  } else if (f.stage === "dragging") {
    chip = { text: "Checking", cls: "bg-sand-deep text-ink" };
    head = <>{fs.wellId} steam {f.delta === 0 ? "held" : fmtShift(f.delta)}</>;
    sub = edited.overloadDays.length ? <span className="text-alert">Over capacity on {edited.overloadDays.length} days</span> : <>Fits the generators</>;
  } else if (f.stage === "overload") {
    chip = { text: "Over capacity", cls: "bg-alert text-[#fbf4e8]" };
    head = <span className="text-alert">{edited.overloadDays.length} days over capacity</span>;
    sub = (
      <>
        {overRange}, peak <span className="font-mono">{fmtFixed(peak, 1)}</span> t/h against <span className="font-mono">{fmtFixed(cap, 1)}</span>
      </>
    );
  } else if (f.stage === "resolving") {
    chip = { text: "Twin re-sequencing", cls: "bg-shift text-ink" };
    head = <>Testing every other well on those days</>;
    sub = <>One day at a time, up to 21 days either way</>;
  } else {
    chip = repair?.feasible ? { text: "Fits the generators", cls: "bg-produce text-[#fbf4e8]" } : { text: "No fit", cls: "bg-alert text-[#fbf4e8]" };
    head = move ? (
      <>
        {move.wellId} steams {move.delta_d} days {move.delta_d > 0 ? "later" : "earlier"}
      </>
    ) : (
      <>Proposal fits</>
    );
    sub = <>Cheapest of {clears.length} moves that clear it</>;
  }
  return (
    <aside className="flex min-h-0 flex-col gap-4 rounded-[4px] border border-rule-strong bg-sheet/85 p-5" data-testid="field-status">
      <span className={cn("w-fit rounded-[3px] px-3 py-1 text-[14px] font-bold", chip.cls)}>{chip.text}</span>
      <div className="flex flex-col gap-2">
        <span className="text-[25px] leading-tight font-bold stretch-semi">{head}</span>
        <span className="text-[17px] leading-snug text-ink-2">{sub}</span>
      </div>
      {(f.stage === "resolving" || f.stage === "resolved") && clears.length > 0 && (
        <div className="flex flex-col border-t border-rule-strong pt-3">
          <div className="mb-1 grid grid-cols-[1fr_64px_84px] items-baseline gap-4 px-2">
            <span className="smallcaps text-[13px] font-bold text-ink">Moves that clear it</span>
            <span className="text-right text-[14px] text-ink-2">move</span>
            <span className="text-right text-[14px] text-ink-2">cost, bbl</span>
          </div>
          {clears.slice(0, shown).map((o, i) => {
            const chosen = f.stage === "resolved" && o.slotId === move?.slotId;
            return (
              <div
                key={o.slotId}
                className={cn("grid grid-cols-[1fr_64px_84px] items-baseline gap-4 rounded-[3px] px-2 py-1.5", chosen && "bg-shift/20")}
                style={{ opacity: f.stage === "resolving" ? k(f.stageAt + 300 + (i * 2400) / clears.length) : 1 }}
              >
                <span className="flex items-baseline gap-2 text-[17px] font-semibold">
                  {o.wellId}
                  {chosen && <span className="rounded-[3px] bg-ink px-1.5 py-0.5 text-[13px] font-bold text-[#fbf4e8]">chosen</span>}
                </span>
                <span className="text-right font-mono text-[17px]">{fmtShift(o.delta_d ?? 0)}</span>
                <span className={cn("text-right font-mono text-[17px]", chosen ? "font-semibold text-ink" : "text-ink-2")}>{fmtFixed(-(o.valueChange_bbl ?? 0), 1)}</span>
              </div>
            );
          })}
        </div>
      )}
      {f.stage === "resolved" && repair?.feasible && (
        <div className="flex flex-col gap-3 border-t border-rule-strong pt-3" style={{ opacity: k(f.stageAt + 700) }} data-testid="change-block">
          <span className="smallcaps text-[13px] font-bold text-ink">
            {fs.change.wells.join(" and ")}, next 90 days
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] text-ink-2">Oil</span>
            <span className="font-mono text-[21px] whitespace-nowrap">
              {fmtInt(fs.change.oilBefore_bbl)} → <span className="font-semibold text-produce">{fmtInt(fs.change.oilAfter_bbl)}</span>
              <span className="ml-2 text-[16px] font-semibold text-produce">{fmtSigned(fs.change.oilAfter_bbl - fs.change.oilBefore_bbl)} bbl</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] text-ink-2">Steam-oil ratio</span>
            <span className="font-mono text-[21px] whitespace-nowrap">
              {fmtFixed(fs.change.sorBefore, 2)} → <span className="font-semibold text-produce">{fmtFixed(fs.change.sorAfter, 2)}</span>
            </span>
          </div>
        </div>
      )}
      <button
        type="button"
        data-testid="open-year"
        disabled={f.stage !== "resolved"}
        onClick={() => story.showYear(!f.year)}
        className={cn(
          "mt-auto h-12 rounded-[4px] border text-[16px] font-semibold",
          f.stage !== "resolved" ? "border-rule bg-sand-deep/40 text-ink-3" : f.year ? "border-produce bg-produce text-[#fbf4e8]" : "border-ink bg-ink text-[#fbf4e8]",
        )}
      >
        One year on the field
      </button>
    </aside>
  );
}
