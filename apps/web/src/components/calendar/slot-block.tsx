"use client";

import type { CycleRecord, DayCell, SteamSlot } from "@bgw/optimise";
import { useDraggable } from "@dnd-kit/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dateRange } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Geometry } from "./geometry";
import { phaseRuns, type PhaseRun } from "./runs";

// One steam cycle on a calendar row: its steam and soak days as a single
// block, draggable when it is a booked slot, with a tooltip of its numbers.

export type RowMark = "edited" | "moved" | null;

export interface CycleBlock {
  key: string;
  slotId: string | null;
  cycleNumber: number | null;
  steam: PhaseRun | null;
  soak: PhaseRun | null;
}

/** Groups a row's steam and soak runs into one block per cycle, keyed by slot or by cycle number. */
export function cycleBlocks(days: readonly DayCell[]): CycleBlock[] {
  const blocks = new Map<string, CycleBlock>();
  for (const run of phaseRuns(days)) {
    if (run.phase !== "steam" && run.phase !== "soak") continue;
    const key = run.slotId ?? `anchor-${run.cycleNumber}`;
    const block = blocks.get(key) ?? { key, slotId: run.slotId, cycleNumber: run.cycleNumber, steam: null, soak: null };
    if (run.phase === "steam") block.steam = run;
    else block.soak = run;
    blocks.set(key, block);
  }
  return [...blocks.values()];
}

interface SlotBlockProps {
  block: CycleBlock;
  geo: Geometry;
  top: number;
  height: number;
  slot: SteamSlot | null;
  anchor: CycleRecord | null;
  mark: RowMark;
  draggable: boolean;
  dragging: boolean;
  asOf: string;
  wellId: string;
}

export function SlotBlock({ block, geo, top, height, slot, anchor, mark, draggable, dragging, asOf, wellId }: SlotBlockProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: block.slotId ?? `${wellId}:${block.key}`,
    disabled: !draggable || !block.slotId,
  });
  const first = block.steam ?? block.soak!;
  const last = block.soak ?? block.steam!;
  const left = geo.x0 + first.from * geo.dayPx;
  const width = (last.to - first.from + 1) * geo.dayPx;
  const steamW = block.steam ? (block.steam.to - block.steam.from + 1) * geo.dayPx : 0;
  const soakW = block.soak ? (block.soak.to - block.soak.from + 1) * geo.dayPx : 0;
  const source = slot ?? anchor;
  const rate = source?.rate_t_per_h ?? 0;
  const injection = slot?.injection_d ?? anchor?.injection_d ?? 0;
  const soakDays = slot?.soak_d ?? anchor?.soak_d ?? 0;
  const start = slot?.start_d ?? anchor?.steamStart_d ?? first.from;
  const tonnes = rate * 24 * injection;
  const inProgress = start < 0;
  const canDrag = draggable && !!block.slotId;

  const steamLabel =
    steamW >= 118 ? (
      <>
        <span className="smallcaps text-[8.5px] opacity-80">Steam</span>
        <span className="font-mono text-[10.5px] font-semibold">{fmtInt(tonnes)} t</span>
      </>
    ) : steamW >= 58 ? (
      <span className="font-mono text-[10px] font-semibold">{fmtInt(tonnes)} t</span>
    ) : null;

  return (
    <Tooltip open={dragging ? false : undefined}>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          {...(canDrag ? listeners : {})}
          {...(canDrag ? attributes : {})}
          aria-roledescription={canDrag ? "steam slot, draggable" : "steam cycle in progress"}
          aria-label={`${wellId} steam ${dateRange(asOf, start, start + injection - 1)}`}
          data-testid={block.slotId ? `slot-${wellId}` : undefined}
          data-slot-id={block.slotId ?? undefined}
          data-start-day={start}
          className={cn(
            "group absolute flex overflow-hidden rounded-[2px] outline-none",
            canDrag && "cursor-grab touch-none active:cursor-grabbing",
            canDrag && "hover:ring-1 hover:ring-ink focus-visible:ring-2 focus-visible:ring-heat",
            mark === "edited" && "ring-[1.5px] ring-ink ring-offset-1 ring-offset-sheet",
            mark === "moved" && "ring-2 ring-shift ring-offset-1 ring-offset-sheet",
            dragging && "z-20 shadow-[0_6px_14px_-4px_rgb(59_42_30/0.55)] ring-[1.5px] ring-ink",
          )}
          style={{
            left,
            top,
            width,
            height,
            transition: dragging ? "left 70ms linear" : "left 560ms cubic-bezier(0.3, 0.8, 0.2, 1)",
          }}
        >
          {block.steam && (
            <div
              className="relative flex h-full items-center gap-1.5 overflow-hidden whitespace-nowrap bg-steam px-1.5 text-[#fff7ec] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]"
              style={{ width: steamW }}
            >
              {inProgress && (
                <span
                  className="absolute inset-y-0 left-0 w-1.5"
                  style={{ background: "repeating-linear-gradient(180deg, var(--sheet) 0 2px, transparent 2px 4px)" }}
                />
              )}
              {canDrag && steamW >= 40 && (
                <span className="grid grid-cols-2 gap-[2px] opacity-70" aria-hidden>
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className="size-[2px] rounded-full bg-[#fff7ec]" />
                  ))}
                </span>
              )}
              {steamLabel}
            </div>
          )}
          {block.soak && (
            <div
              className="flex h-full items-center justify-center overflow-hidden whitespace-nowrap bg-soak text-[#3b2a1e]"
              style={{ width: soakW }}
            >
              {soakW >= 42 && <span className="smallcaps text-[8.5px] font-semibold">Soak</span>}
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="bg-popover text-popover-foreground">
        <div className="flex flex-col gap-0.5 py-0.5">
          <span className="text-[12px] font-semibold">
            {wellId} · cycle {block.cycleNumber}
          </span>
          <span className="font-mono text-[10.5px]">
            steam {dateRange(asOf, start, start + injection - 1)} · {fmtInt(tonnes)} t at {fmtFixed(rate, 1)} t/h
          </span>
          <span className="font-mono text-[10.5px]">soak {soakDays} d{inProgress ? " · under way" : ""}</span>
          {canDrag && <span className="text-[10.5px] opacity-70">Drag to move this cycle</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
