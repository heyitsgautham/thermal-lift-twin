"use client";

import {
  FieldModel,
  repairPlan,
  shiftSlot,
  type Capacity,
  type FieldDataset,
  type PlanEvaluation,
  type RepairResult,
  type SteamSlot,
} from "@bgw/optimise";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The twin's working state for the steam calendar. One place owns the plan in
// force, the proposal being shaped, the generator capacity setting and the
// stage of the interaction, and every number on screen is evaluated from them.

export type Stage = "idle" | "dragging" | "overload" | "resolving" | "resolved";

export interface EditRecord {
  slotId: string;
  wellId: string;
  fromStart_d: number;
  toStart_d: number;
  delta_d: number;
}

export interface DragState {
  slotId: string;
  wellId: string;
  start_d: number;
  min_d: number;
  max_d: number;
  delta_d: number;
}

/** Fixed timings, so a scripted take lands the same way every time. */
export const TIMING = {
  overloadHold_ms: 2000,
  resolve_ms: 1300,
} as const;

export interface Twin {
  field: FieldModel;
  capacity: Capacity;
  defaultCapacity: Capacity;
  current: SteamSlot[];
  proposal: SteamSlot[];
  stage: Stage;
  drag: DragState | null;
  edit: EditRecord | null;
  repair: RepairResult | null;
  pinned: ReadonlySet<string>;
  evalCurrent: PlanEvaluation;
  evalView: PlanEvaluation;
  /** Proposal differs from the plan in force. */
  dirty: boolean;
  beginDrag(slotId: string): void;
  moveDrag(delta_d: number): void;
  endDrag(): void;
  cancelDrag(): void;
  resolveNow(): void;
  adopt(): void;
  reset(): void;
  setCapacity(next: Capacity): void;
}

function samePlan(a: readonly SteamSlot[], b: readonly SteamSlot[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((s) => [s.id, s.start_d]));
  return b.every((s) => byId.get(s.id) === s.start_d);
}

export function useTwin(dataset: FieldDataset, options: { holdOverload: boolean }): Twin {
  const field = useMemo(() => new FieldModel(dataset), [dataset]);
  const defaultCapacity = useMemo<Capacity>(
    () => ({
      units: dataset.assumptions.generatorUnits,
      unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
    }),
    [dataset],
  );

  const [capacity, setCapacityState] = useState<Capacity>(defaultCapacity);
  const [current, setCurrent] = useState<SteamSlot[]>(dataset.issuedPlan);
  const [proposal, setProposal] = useState<SteamSlot[]>(dataset.issuedPlan);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [stage, setStage] = useState<Stage>("idle");
  const [edit, setEdit] = useState<EditRecord | null>(null);
  const [repair, setRepair] = useState<RepairResult | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const stageBeforeDrag = useRef<Stage>("idle");
  const timers = useRef<number[]>([]);
  const pending = useRef<{ plan: SteamSlot[]; pinned: ReadonlySet<string>; capacity: Capacity } | null>(null);
  const pendingResult = useRef<RepairResult | null>(null);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const finishResolve = useCallback(() => {
    const job = pending.current;
    if (!job) return;
    const result = pendingResult.current ?? repairPlan(field, job.plan, job.pinned, job.capacity);
    pending.current = null;
    pendingResult.current = null;
    setRepair(result);
    setProposal(result.proposal);
    setStage("resolved");
  }, [field]);

  const startResolving = useCallback(() => {
    if (!pending.current) return;
    setStage("resolving");
    schedule(finishResolve, TIMING.resolve_ms);
  }, [finishResolve, schedule]);

  /** Checks a plan against the generators and, if it overloads, lets the twin re-sequence it. */
  const runTwin = useCallback(
    (plan: SteamSlot[], pins: ReadonlySet<string>, cap: Capacity) => {
      clearTimers();
      const check = field.evaluate(plan, cap);
      if (check.overloadDays.length === 0) {
        pending.current = null;
        setRepair(null);
        setStage("resolved");
        return;
      }
      pending.current = { plan, pinned: pins, capacity: cap };
      pendingResult.current = null;
      setRepair(null);
      setStage("overload");
      // Run the search once the overload has painted, then reveal it on the fixed beat.
      schedule(() => {
        if (pending.current) pendingResult.current = repairPlan(field, plan, pins, cap);
      }, 80);
      if (!options.holdOverload) schedule(startResolving, TIMING.overloadHold_ms);
    },
    [clearTimers, field, options.holdOverload, schedule, startResolving],
  );

  const beginDrag = useCallback(
    (slotId: string) => {
      if (stage === "overload" || stage === "resolving") return;
      const slot = proposal.find((s) => s.id === slotId);
      if (!slot) return;
      const bounds = field.slotBounds(proposal, slotId);
      stageBeforeDrag.current = stage;
      setDrag({ slotId, wellId: slot.wellId, start_d: slot.start_d, ...bounds, delta_d: 0 });
      setStage("dragging");
    },
    [field, proposal, stage],
  );

  const moveDrag = useCallback((delta_d: number) => {
    setDrag((d) => {
      if (!d) return d;
      const clamped = Math.max(d.min_d - d.start_d, Math.min(d.max_d - d.start_d, delta_d));
      return clamped === d.delta_d ? d : { ...d, delta_d: clamped };
    });
  }, []);

  const cancelDrag = useCallback(() => {
    setDrag(null);
    setStage(stageBeforeDrag.current);
  }, []);

  const endDrag = useCallback(() => {
    if (!drag) return;
    if (drag.delta_d === 0) {
      cancelDrag();
      return;
    }
    const edited = shiftSlot(proposal, drag.slotId, drag.delta_d);
    const pins = new Set(pinned).add(drag.slotId);
    setDrag(null);
    setProposal(edited);
    setPinned(pins);
    setEdit({
      slotId: drag.slotId,
      wellId: drag.wellId,
      fromStart_d: drag.start_d,
      toStart_d: drag.start_d + drag.delta_d,
      delta_d: drag.delta_d,
    });
    runTwin(edited, pins, capacity);
  }, [cancelDrag, capacity, drag, pinned, proposal, runTwin]);

  const resolveNow = useCallback(() => {
    if (stage === "overload") {
      clearTimers();
      startResolving();
    }
  }, [clearTimers, stage, startResolving]);

  const adopt = useCallback(() => {
    clearTimers();
    setCurrent(proposal);
    setPinned(new Set());
    setEdit(null);
    setRepair(null);
    setStage("idle");
  }, [clearTimers, proposal]);

  const reset = useCallback(() => {
    clearTimers();
    pending.current = null;
    setCapacityState(defaultCapacity);
    setCurrent(dataset.issuedPlan);
    setProposal(dataset.issuedPlan);
    setPinned(new Set());
    setEdit(null);
    setRepair(null);
    setDrag(null);
    setStage("idle");
  }, [clearTimers, dataset.issuedPlan, defaultCapacity]);

  const setCapacity = useCallback(
    (next: Capacity) => {
      setCapacityState(next);
      setEdit(null);
      runTwin(proposal, pinned, next);
    },
    [pinned, proposal, runTwin],
  );

  const viewPlan = useMemo(
    () => (drag && drag.delta_d !== 0 ? shiftSlot(proposal, drag.slotId, drag.delta_d) : proposal),
    [drag, proposal],
  );
  const evalCurrent = useMemo(() => field.evaluate(current, capacity), [field, current, capacity]);
  const evalView = useMemo(() => field.evaluate(viewPlan, capacity), [field, viewPlan, capacity]);

  return {
    field,
    capacity,
    defaultCapacity,
    current,
    proposal: viewPlan,
    stage,
    drag,
    edit,
    repair,
    pinned,
    evalCurrent,
    evalView,
    dirty: !samePlan(current, viewPlan),
    beginDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    resolveNow,
    adopt,
    reset,
    setCapacity,
  };
}
