"use client";

import type { CycleRecord, DayCell, ResteamPoint, SteamSlot, WellRecord, WellTimeline } from "@bgw/optimise";
import { useDraggable } from "@dnd-kit/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dateRange, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Geometry } from "./geometry";
import { differenceRuns, phaseRuns, type PhaseRun } from "./runs";

const PHASE_FILL: Record<string, string> = {
  steam: "var(--steam)",
  soak: "var(--soak)",
  produce: "var(--produce)",
  down: "var(--down)",
};

export type RowMark = "edited" | "moved" | null;

interface CycleBlock {
  key: string;
  slotId: string | null;
  cycleNumber: number | null;
  steam: PhaseRun | null;
  soak: PhaseRun | null;
}

function cycleBlocks(days: readonly DayCell[]): CycleBlock[] {
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

/** Oil-rate area for the production runs of one track, as SVG paths. */
function RateArea({
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

function SlotBlock({ block, geo, top, height, slot, anchor, mark, draggable, dragging, asOf, wellId }: SlotBlockProps) {
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

export interface CssRowProps {
  geo: Geometry;
  top: number;
  well: WellRecord;
  view: WellTimeline;
  base: WellTimeline;
  viewSlots: SteamSlot[];
  baseSlots: SteamSlot[];
  anchor: CycleRecord;
  resteam: ResteamPoint;
  rateMax: number;
  asOf: string;
  mark: RowMark;
  draggable: boolean;
  draggingSlotId: string | null;
  focused: boolean;
  onFocus(wellId: string | null): void;
}

export function CssRow({
  geo,
  top,
  well,
  view,
  base,
  viewSlots,
  baseSlots,
  anchor,
  resteam,
  rateMax,
  asOf,
  mark,
  draggable,
  draggingSlotId,
  focused,
  onFocus,
}: CssRowProps) {
  const rowH = geo.cssRowH;
  const trackTop = Math.round(rowH * 0.12);
  const trackH = Math.round(rowH * 0.58);
  const baseTop = trackTop + trackH + 2;
  const baseH = Math.max(3, Math.round(rowH * 0.13));
  const blocks = cycleBlocks(view.days);
  const diff = differenceRuns(view.days, base.days);
  const nextSlot = viewSlots[0] ?? null;
  const lateBy = nextSlot && resteam.day_d >= 0 && resteam.day_d < geo.horizon_d ? nextSlot.start_d - resteam.day_d : null;
  const markerVisible = resteam.day_d >= 0 && resteam.day_d < geo.horizon_d;
  const movedGhosts = baseSlots.filter((b) => {
    const v = viewSlots.find((s) => s.id === b.id);
    return v && v.start_d !== b.start_d;
  });
  const oilDelta = view.oil90_bbl - base.oil90_bbl;
  const x = (d: number) => geo.x0 + d * geo.dayPx;

  return (
    <div
      className="absolute"
      style={{ left: 0, top, width: geo.width, height: rowH }}
      data-testid={`row-${well.id}`}
      data-resteam-day={resteam.day_d}
      onMouseEnter={() => onFocus(well.id)}
      onMouseLeave={() => onFocus(null)}
    >
      <div
        className={cn(
          "absolute inset-y-0 transition-colors duration-300",
          mark === "edited" && "bg-ink/[0.05]",
          mark === "moved" && "bg-shift/[0.10]",
          !mark && focused && "bg-ink/[0.03]",
        )}
        style={{ left: geo.padX - 6, width: geo.width - 2 * geo.padX + 12 }}
      />
      <div className="absolute border-b border-rule" style={{ left: geo.padX, right: geo.padX, bottom: 0 }} />

      <div className="absolute flex items-center gap-1.5 pr-2" style={{ left: geo.padX, width: geo.labelW, top: 0, height: rowH }}>
        <span className="whitespace-nowrap text-[13px] font-semibold leading-none stretch-semi text-ink max-[1600px]:text-[12px]">
          {well.id}
        </span>
        <span className="font-mono text-[9.5px] leading-none text-ink-3">C{view.cycleToday}</span>
        {mark === "edited" && (
          <span className="rounded-[2px] bg-ink px-1 py-[1px] smallcaps text-[7.5px] font-bold leading-none text-sheet">edit</span>
        )}
        {mark === "moved" && (
          <span className="rounded-[2px] bg-shift px-1 py-[1px] smallcaps text-[7.5px] font-bold leading-none text-ink">twin</span>
        )}
        {view.days[0]!.phase === "produce" ? (
          <span className="ml-auto font-mono text-[10.5px] leading-none text-ink-2">{fmtFixed(view.oilToday_bbl_per_d, 1)}</span>
        ) : (
          <span className="ml-auto smallcaps text-[8.5px] leading-none text-ink-3">{view.days[0]!.phase}</span>
        )}
      </div>

      {diff.map((run) => (
        <svg
          key={`diff-${run.from}`}
          className="rise-in absolute"
          style={{ left: x(run.from), top: 1, width: (run.to - run.from + 1) * geo.dayPx + 1, height: rowH - 2 }}
          aria-hidden
        >
          <rect width="100%" height="100%" fill="url(#hatch-shift)" />
          <line x1="0" x2="100%" y1="0.5" y2="0.5" stroke="var(--shift)" />
          <line x1="0" x2="100%" y1={rowH - 2.5} y2={rowH - 2.5} stroke="var(--shift)" />
        </svg>
      ))}

      <svg className="absolute" style={{ left: geo.x0, top: trackTop }} width={geo.gridW} height={trackH} aria-hidden>
        <RateArea days={view.days} geo={geo} height={trackH} rateMax={rateMax} />
      </svg>

      <svg className="absolute" style={{ left: geo.x0, top: baseTop }} width={geo.gridW} height={baseH} aria-hidden>
        {phaseRuns(base.days).map((run) => (
          <rect
            key={run.from}
            x={run.from * geo.dayPx + (run.phase === "produce" ? 0 : 0.5)}
            width={(run.to - run.from + 1) * geo.dayPx - (run.phase === "produce" ? 0 : 1)}
            y={0}
            height={baseH}
            fill={PHASE_FILL[run.phase]}
            opacity={run.phase === "produce" ? 0.28 : 0.85}
          />
        ))}
      </svg>

      {movedGhosts.map((g) => (
        <div
          key={`ghost-${g.id}`}
          className="pointer-events-none absolute rounded-[2px] border border-dashed border-ink-2/80"
          style={{
            left: x(Math.max(0, g.start_d)),
            top: trackTop,
            width: (Math.min(geo.horizon_d, g.start_d + g.injection_d + g.soak_d) - Math.max(0, g.start_d)) * geo.dayPx,
            height: trackH,
          }}
        />
      ))}

      {markerVisible && (
        <>
          <div
            className="pointer-events-none absolute w-[1.5px] bg-ink"
            style={{ left: x(resteam.day_d) - 0.75, top: trackTop - 2, height: trackH + 4 }}
          />
          <svg
            className="pointer-events-none absolute"
            style={{ left: x(resteam.day_d) - 4.5, top: trackTop - 7 }}
            width={9}
            height={6}
            aria-hidden
          >
            <path d="M0 0 H9 L4.5 6 Z" fill="var(--ink)" />
          </svg>
          {lateBy !== null && lateBy >= 3 && (
            <>
              <div
                className="pointer-events-none absolute border-t-[1.5px] border-dotted border-ink"
                style={{ left: x(resteam.day_d), width: lateBy * geo.dayPx, top: trackTop + trackH / 2 }}
              />
              {lateBy * geo.dayPx >= 56 && (
                <span
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[2px] bg-sheet px-1 font-mono text-[9.5px] font-semibold leading-[13px] text-ink ring-1 ring-ink/70"
                  style={{ left: x(resteam.day_d) + (lateBy * geo.dayPx) / 2, top: trackTop + trackH / 2 }}
                >
                  {lateBy} d late
                </span>
              )}
            </>
          )}
        </>
      )}

      {blocks.map((block) => (
        <SlotBlock
          key={block.key}
          block={block}
          geo={geo}
          top={trackTop}
          height={trackH}
          slot={block.slotId ? (viewSlots.find((s) => s.id === block.slotId) ?? null) : null}
          anchor={block.slotId ? null : anchor}
          mark={block.slotId && mark ? mark : null}
          draggable={draggable}
          dragging={draggingSlotId !== null && draggingSlotId === block.slotId}
          asOf={asOf}
          wellId={well.id}
        />
      ))}

      <div
        className="absolute flex flex-col items-end justify-center"
        style={{ left: geo.x0 + geo.gridW + 4, width: geo.oilW - 4, top: 0, height: rowH }}
      >
        <span className="font-mono text-[11px] leading-none text-ink">{fmtInt(view.oil90_bbl)}</span>
        {Math.abs(oilDelta) >= 0.5 && (
          <span
            className={cn(
              "rise-in mt-[3px] font-mono text-[9px] font-semibold leading-none",
              oilDelta > 0 ? "text-produce" : "text-alert",
            )}
          >
            {fmtSigned(oilDelta)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ColdRow({
  geo,
  top,
  well,
  view,
  rateMax,
  downReasons,
  asOf,
}: {
  geo: Geometry;
  top: number;
  well: WellRecord;
  view: WellTimeline;
  rateMax: number;
  downReasons: { start_d: number; duration_d: number; reason: string }[];
  asOf: string;
}) {
  const h = geo.coldRowH;
  const trackH = Math.max(5, h - 3);
  const showLabel = h >= 10;
  return (
    <div className="absolute" style={{ left: 0, top, width: geo.width, height: h }} data-testid={`row-${well.id}`}>
      {showLabel && (
        <div className="absolute flex items-center gap-1.5 pr-2" style={{ left: geo.padX, width: geo.labelW, top: 0, height: h }}>
          <span className="font-mono text-[9px] leading-none text-ink-2">{well.id}</span>
          {well.completion === "fishbone" && (
            <span className="smallcaps text-[7px] font-semibold leading-none text-ink-3">fishbone</span>
          )}
          <span className="ml-auto font-mono text-[9px] leading-none text-ink-3">{fmtFixed(view.oilToday_bbl_per_d, 1)}</span>
        </div>
      )}
      <svg className="absolute" style={{ left: geo.x0, top: 1 }} width={geo.gridW} height={trackH} aria-hidden>
        <RateArea days={view.days} geo={geo} height={trackH} rateMax={rateMax} opacity={0.72} />
      </svg>
      {downReasons.map((d) => (
        <Tooltip key={d.start_d}>
          <TooltipTrigger asChild>
            <div
              className="absolute cursor-help"
              style={{ left: geo.x0 + d.start_d * geo.dayPx, top: 0, width: d.duration_d * geo.dayPx, height: h }}
              aria-label={`${well.id} down ${dateRange(asOf, d.start_d, d.start_d + d.duration_d - 1)}, ${d.reason}`}
            />
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4} className="bg-popover text-popover-foreground">
            <span className="text-[11.5px]">
              {well.id} down {dateRange(asOf, d.start_d, d.start_d + d.duration_d - 1)} · {d.reason}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
      {showLabel && (
        <div
          className="absolute flex items-center justify-end"
          style={{ left: geo.x0 + geo.gridW + 4, width: geo.oilW - 4, top: 0, height: h }}
        >
          <span className="font-mono text-[9px] leading-none text-ink-3">{fmtInt(view.oil90_bbl)}</span>
        </div>
      )}
      <span className="sr-only">from {shortDate(asOf, 0)}</span>
    </div>
  );
}
