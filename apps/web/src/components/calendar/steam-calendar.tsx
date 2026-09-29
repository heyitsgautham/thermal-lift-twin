"use client";

import type { SteamSlot } from "@bgw/optimise";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TwinConsole } from "@/components/twin/twin-console";
import { useTwinContext } from "@/components/twin/twin-provider";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtShift } from "@/lib/format";
import { DayAxis, GridLines } from "./day-axis";
import { computeGeometry, useElementSize } from "./geometry";
import { GeneratorLane } from "./generator-lane";
import { Readouts } from "./readouts";
import { runsOf } from "./runs";
import { ColdRow, CssRow, PatternDefs, type RowMark } from "./well-rows";

function Legend() {
  const item = (swatch: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-2">
      {swatch}
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {item(<span className="h-[9px] w-4 rounded-[1px] bg-steam" />, "Steam")}
      {item(<span className="h-[9px] w-4 rounded-[1px] bg-soak" />, "Soak")}
      {item(
        <svg width="16" height="9" aria-hidden>
          <rect width="16" height="9" fill="var(--produce)" opacity="0.1" />
          <path d="M0 2 C5 3, 9 6, 16 7 L16 9 L0 9 Z" fill="var(--produce)" opacity="0.55" />
        </svg>,
        "Produce, height is oil rate",
      )}
      {item(
        <span
          className="h-[9px] w-4 rounded-[1px]"
          style={{ background: "repeating-linear-gradient(45deg, var(--down) 0 1.5px, transparent 1.5px 4px)" }}
        />,
        "Down",
      )}
      {item(
        <svg width="10" height="11" aria-hidden>
          <path d="M1 0 H9 L5 5 Z" fill="var(--ink)" />
          <rect x="4.25" y="4" width="1.5" height="7" fill="var(--ink)" />
        </svg>,
        "Re-steam day",
      )}
      {item(<span className="h-[3px] w-4 bg-ink/40" />, "Thin line is the current plan")}
      {item(
        <span
          className="h-[9px] w-4 rounded-[1px] border-y border-shift"
          style={{ background: "repeating-linear-gradient(-45deg, rgb(245 158 11 / 0.45) 0 1.4px, rgb(245 158 11 / 0.12) 1.4px 5px)" }}
        />,
        "Changed from current",
      )}
    </div>
  );
}

export function SteamCalendar() {
  const { twin, dataset, holdOverload } = useTwinContext();
  const { field } = twin;
  const asOf = dataset.meta.asOf;
  const H = dataset.meta.horizon_d;

  const sheetRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(sheetRef);
  const [focusWell, setFocusWell] = useState<string | null>(null);

  // Row order is fixed from the issued plan, so rows never jump while you edit.
  const { cssOrder, coldOrder, wellTone, rateMax } = useMemo(() => {
    const issued = field.evaluate(dataset.issuedPlan, {
      units: dataset.assumptions.generatorUnits,
      unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
    });
    const key = (wellId: string) => {
      const slot = dataset.issuedPlan.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d)[0];
      const anchor = field.anchorCycle(wellId);
      if (anchor.steamStart_d + anchor.injection_d + anchor.soak_d > 0) return anchor.steamStart_d - 1000;
      if (slot) return slot.start_d;
      return H + field.currentResteam(wellId).day_d;
    };
    const css = [...field.cssWells].sort((a, b) => key(a.id) - key(b.id) || a.number - b.number);
    const cold = field.producing.filter((w) => w.status === "cold").sort((a, b) => a.number - b.number);
    let max = 0;
    for (const t of issued.timelines) for (const c of t.days) max = Math.max(max, c.oil_bbl_per_d);
    return {
      cssOrder: css,
      coldOrder: cold,
      wellTone: new Map(css.map((w, i) => [w.id, i])),
      rateMax: max * 1.08,
    };
  }, [H, dataset, field]);

  const geo = size ? computeGeometry(size.width, size.height, H, cssOrder.length, coldOrder.length) : null;
  const dayPxRef = useRef(12);
  const dayPx = geo?.dayPx;
  useLayoutEffect(() => {
    if (dayPx) dayPxRef.current = dayPx;
  }, [dayPx]);

  const keyboardCoordinates: KeyboardCoordinateGetter = useCallback((event, { currentCoordinates }) => {
    const step = dayPxRef.current;
    if (event.code === "ArrowLeft") return { ...currentCoordinates, x: currentCoordinates.x - step };
    if (event.code === "ArrowRight") return { ...currentCoordinates, x: currentCoordinates.x + step };
    return undefined;
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const onDragMove = useCallback(
    (e: DragMoveEvent) => twin.moveDrag(Math.round(e.delta.x / dayPxRef.current)),
    [twin],
  );

  const viewByWell = useMemo(() => new Map(twin.evalView.timelines.map((t) => [t.wellId, t])), [twin.evalView]);
  const baseByWell = useMemo(() => new Map(twin.evalCurrent.timelines.map((t) => [t.wellId, t])), [twin.evalCurrent]);
  const slotsByWell = (plan: SteamSlot[], wellId: string) =>
    plan.filter((s) => s.wellId === wellId).sort((a, b) => a.start_d - b.start_d);

  const editedWells = useMemo(() => {
    const set = new Set<string>();
    for (const id of twin.pinned) {
      const s = twin.proposal.find((p) => p.id === id);
      if (s) set.add(s.wellId);
    }
    if (twin.drag) set.add(twin.drag.wellId);
    return set;
  }, [twin.pinned, twin.proposal, twin.drag]);
  const movedWells = useMemo(
    () => new Set(twin.stage === "resolved" ? (twin.repair?.moves.map((m) => m.wellId) ?? []) : []),
    [twin.repair, twin.stage],
  );
  const markOf = (wellId: string): RowMark => (editedWells.has(wellId) ? "edited" : movedWells.has(wellId) ? "moved" : null);

  const overRuns = runsOf(twin.evalView.overloadDays);
  const draggable = twin.stage === "idle" || twin.stage === "resolved" || twin.stage === "dragging";
  const cleared = twin.stage === "resolved" && twin.repair && twin.repair.feasible ? twin.repair.edited : null;

  return (
    <div
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_336px] gap-4 px-5 pt-3 pb-2 max-[1600px]:grid-cols-[minmax(0,1fr)_300px] max-[1600px]:gap-3 max-[1600px]:px-4"
      data-testid="steam-calendar"
      data-stage={twin.stage}
      data-ready={geo ? "true" : "false"}
      data-day-px={geo?.dayPx}
    >
      <section className="flex min-h-0 min-w-0 flex-col gap-2.5">
        <header className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[28px] leading-none font-bold tracking-[-0.01em] stretch-semi text-ink max-[1600px]:text-[24px]">
              Field steam calendar
            </h1>
            <p className="text-[12.5px] text-ink-2 max-[1600px]:text-[11.5px]">
              {H} days from {shortDate(asOf, 0)} {asOf.slice(0, 4)} · {dataset.field.wellsProducing} producing wells,{" "}
              {dataset.field.wellsOnCss} on cyclic steam · {twin.capacity.units} steam generators at{" "}
              {fmtFixed(twin.capacity.unitCapacity_t_per_h, 1)} t/h
            </p>
          </div>
          <Readouts view={twin.evalView} base={twin.evalCurrent} capacity={twin.capacity} dirty={twin.dirty} />
        </header>

        <div
          ref={sheetRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-[3px] border border-rule-strong bg-sheet shadow-[0_1px_0_rgb(59_42_30/0.06),0_12px_30px_-22px_rgb(59_42_30/0.5)]"
        >
          <PatternDefs />
          {geo && (
            <DndContext
              sensors={sensors}
              autoScroll={false}
              onDragStart={(e) => twin.beginDrag(String(e.active.id))}
              onDragMove={onDragMove}
              onDragEnd={() => twin.endDrag()}
              onDragCancel={() => twin.cancelDrag()}
            >
              <div className="plot-in absolute inset-0">
                <GridLines geo={geo} asOf={asOf} overload={overRuns} top={geo.axisTop + geo.axisH - 4} />
                <GeneratorLane
                  geo={geo}
                  evaluation={twin.evalView}
                  capacity={twin.capacity}
                  cleared={cleared}
                  wellTone={wellTone}
                  editedWells={editedWells}
                  movedWells={movedWells}
                  focusWell={twin.drag?.wellId ?? focusWell}
                />
                <DayAxis geo={geo} asOf={asOf} />

                {cssOrder.map((well, i) => (
                  <CssRow
                    key={well.id}
                    geo={geo}
                    top={geo.rowsTop + i * geo.cssRowH}
                    well={well}
                    view={viewByWell.get(well.id)!}
                    base={baseByWell.get(well.id)!}
                    viewSlots={slotsByWell(twin.proposal, well.id)}
                    baseSlots={slotsByWell(twin.current, well.id)}
                    anchor={field.anchorCycle(well.id)}
                    resteam={field.currentResteam(well.id)}
                    rateMax={rateMax}
                    asOf={asOf}
                    mark={markOf(well.id)}
                    draggable={draggable}
                    draggingSlotId={twin.drag?.slotId ?? null}
                    focused={focusWell === well.id}
                    onFocus={setFocusWell}
                  />
                ))}

                <div
                  className="absolute flex items-center gap-3"
                  style={{ left: geo.padX, right: geo.padX, top: geo.coldTop - geo.dividerH, height: geo.dividerH }}
                >
                  <span className="smallcaps whitespace-nowrap text-[9.5px] font-semibold text-ink-2">
                    Cold production · {coldOrder.length} wells, not on steam
                  </span>
                  <span className="h-px flex-1 bg-rule-strong" />
                </div>

                {coldOrder.map((well, i) => (
                  <ColdRow
                    key={well.id}
                    geo={geo}
                    top={geo.coldTop + i * geo.coldRowH}
                    well={well}
                    view={viewByWell.get(well.id)!}
                    rateMax={rateMax}
                    downReasons={dataset.downtime.filter((d) => d.wellId === well.id)}
                    asOf={asOf}
                  />
                ))}
              </div>
              {/* The overlay carries the live readout under the pointer. It also stops dnd-kit
                  from treating the snapped block's own movement as a layout shift. */}
              <DragOverlay dropAnimation={null}>
                {twin.drag ? (
                  <div className="relative h-full w-full">
                    <span className="absolute -top-7 left-0 flex items-center gap-2 whitespace-nowrap rounded-[2px] bg-ink px-2 py-1 text-[11px] text-sheet shadow-[0_4px_10px_-4px_rgb(59_42_30/0.6)]">
                      <span className="font-semibold stretch-semi">{twin.drag.wellId}</span>
                      <span className="font-mono">{twin.drag.delta_d === 0 ? "±0 d" : fmtShift(twin.drag.delta_d)}</span>
                      <span className="text-sheet/70">steam {shortDate(asOf, twin.drag.start_d + twin.drag.delta_d)}</span>
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
        <Legend />
      </section>

      <TwinConsole twin={twin} asOf={asOf} holdOverload={holdOverload} />
    </div>
  );
}
