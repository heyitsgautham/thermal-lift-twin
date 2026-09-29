"use client";

import type { SteamSlot } from "@bgw/optimise";
import { dateOf, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt, fmtShift, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoryData } from "../data";
import { dragProgress, FIELD, FIELD_DAY, fieldStageAt, hud, lerp, repairProgress, smooth } from "../script";
import { PANEL } from "./well-hud";

// The field beat: the steam schedule for the 19 CSS wells, the generators' load
// under it, and the twin's panel. BGW-14 is dragged to its re-steam day, the
// generators go over, and the twin's cheapest move clears them.

const L = 98;
const R = 18;
const W = 1102;
const DAYS = 90;
const xOf = (d: number) => L + (Math.max(0, Math.min(DAYS, d)) / DAYS) * (W - L - R);

export function FieldHud({ t, data, pressed }: { t: number; data: StoryData; pressed: string | null }) {
  const a = hud(t, "fieldHud", 0.6);
  if (a <= 0.001) return null;
  const f = data.fieldBeat;
  const stage = fieldStageAt(t);
  const cap = f.capacity_t_per_h;
  const load = stage === "issued" || stage === "dragging" ? f.load.issued : stage === "resolved" ? f.load.proposal : f.load.edited;
  const maxLoad = 30;
  const laneTop = 30;
  const laneH = 76;
  const ly = (v: number) => laneTop + laneH - (v / maxLoad) * laneH;
  const rowTop = laneTop + laneH + 14;
  const rowH = 11.6;

  // Wells in plan order, the story's two wells always labelled.
  const wells = [...new Set(f.issued.map((s) => s.wellId))];
  const slotStart = (s: SteamSlot) => {
    if (s.wellId === f.wellId && s.id === f.slotId) return lerp(f.fromStart_d, f.toStart_d, dragProgress(t));
    const move = f.moves.find((m) => m.slotId === s.id);
    if (move) return lerp(move.fromStart_d, move.toStart_d, repairProgress(t));
    return s.start_d;
  };
  const months: number[] = [];
  for (let d = 0; d < DAYS; d++) if (dateOf(data.asOf, d).getUTCDate() === 1) months.push(d);
  const over = stage === "overload" || stage === "resolving";
  const peak = f.peakEdited_t_per_h;

  return (
    <>
      <div className={cn(PANEL, "absolute bottom-9 left-6 px-0 pt-3 pb-3")} style={{ opacity: a, width: W }}>
        <div className="flex items-baseline justify-between px-5">
          <span className="text-[17px] font-bold text-ink">Steam schedule, next 90 days</span>
          <span className="text-[14px] text-ink-2">{data.field.cssWells.length} wells on cyclic steam</span>
        </div>
        <svg width={W} height={rowTop + wells.length * rowH + 22} className="block overflow-visible">
          {months.map((d) => (
            <g key={d}>
              <line x1={xOf(d)} x2={xOf(d)} y1={laneTop - 6} y2={rowTop + wells.length * rowH} stroke="var(--rule-strong)" />
              <text x={xOf(d) + 5} y={laneTop - 10} fontSize={14} className="font-mono" fill="var(--ink-2)">
                {shortDate(data.asOf, d).split(" ")[1]}
              </text>
            </g>
          ))}
          <text x={20} y={laneTop + 18} fontSize={14} fontWeight={600} fill="var(--ink)">
            Generators
          </text>
          <text x={20} y={laneTop + 36} fontSize={14} fill="var(--ink-2)">
            t/h
          </text>
          {load.slice(0, DAYS).map((v, d) => {
            const bad = v > cap + 1e-6;
            return <rect key={d} x={xOf(d) + 0.6} width={xOf(d + 1) - xOf(d) - 1.2} y={ly(v)} height={laneTop + laneH - ly(v)} fill={bad ? "var(--alert)" : "var(--steam)"} opacity={bad ? 1 : 0.55} />;
          })}
          <line x1={L} x2={W - R} y1={ly(cap)} y2={ly(cap)} stroke="var(--ink)" strokeDasharray="5 4" strokeWidth={1.5} />
          <text x={W - R} y={ly(cap) - 6} textAnchor="end" fontSize={14} className="font-mono" fill="var(--ink)">
            {fmtFixed(cap, 1)} t/h, assumed
          </text>
          {over && (
            <g>
              <rect x={xOf(f.overloadDays[0]!) - 3} width={xOf(f.overloadDays.at(-1)! + 1) - xOf(f.overloadDays[0]!) + 6} y={laneTop - 4} height={rowTop + wells.length * rowH - laneTop + 4} fill="var(--alert)" opacity={0.09} />
              <text x={xOf(f.overloadDays.at(-1)! + 1) + 8} y={ly(peak) + 4} fontSize={15} fontWeight={700} className="font-mono" fill="var(--alert)">
                {fmtFixed(peak, 1)} t/h
              </text>
            </g>
          )}
          <line x1={xOf(FIELD_DAY) + 0.5} x2={xOf(FIELD_DAY) + 0.5} y1={laneTop + laneH} y2={rowTop + wells.length * rowH} stroke="var(--ink)" strokeWidth={1} opacity={0.35} />
          {wells.map((w, i) => {
            const y = rowTop + i * rowH;
            const story = w === f.wellId;
            const moved = f.moves.some((m) => m.wellId === w) && stage === "resolved";
            const slots = f.issued.filter((s) => s.wellId === w);
            return (
              <g key={w}>
                {(story || moved) && <rect x={L - 4} width={W - L - R + 8} y={y - 1} height={rowH + 2} fill={story ? "var(--heat)" : "var(--shift)"} opacity={0.1} />}
                {(story || f.moves.some((m) => m.wellId === w)) && (
                  <text x={L - 10} y={y + rowH - 1.5} textAnchor="end" fontSize={14} fontWeight={700} fill={story ? "var(--heat)" : "var(--ink)"}>
                    {w}
                  </text>
                )}
                {slots.map((s) => {
                  const st = slotStart(s);
                  return (
                    <g key={s.id} data-cursor={s.id === f.slotId ? `slot-${w}` : undefined}>
                      <rect x={xOf(st)} width={Math.max(0, xOf(st + s.injection_d) - xOf(st))} y={y + 1} height={rowH - 2} fill="var(--steam)" rx={1.5} />
                      <rect x={xOf(st + s.injection_d)} width={Math.max(0, xOf(st + s.injection_d + s.soak_d) - xOf(st + s.injection_d))} y={y + 1} height={rowH - 2} fill="var(--soak)" rx={1.5} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <TwinPanel t={t} data={data} a={a} pressed={pressed} />
    </>
  );
}

/** "7 to 9 Nov", or "30 Oct to 1 Nov" across a month. */
function rangeText(asOf: string, from: number, to: number): string {
  const a = dateOf(asOf, from);
  const b = dateOf(asOf, to);
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()} to ${shortDate(asOf, to)}` : `${shortDate(asOf, from)} to ${shortDate(asOf, to)}`;
}

function TwinPanel({ t, data, a, pressed }: { t: number; data: StoryData; a: number; pressed: string | null }) {
  const f = data.fieldBeat;
  const stage = fieldStageAt(t);
  const asOf = data.asOf;
  const moved = f.moves[0];
  const clears = f.options.filter((o) => o.status === "clears");
  const [head, sub, tone] =
    stage === "issued"
      ? ["Plan fits the generators", `${f.wellId} is due ${shortDate(asOf, f.toStart_d)}, booked ${shortDate(asOf, f.fromStart_d)}`, "text-produce"]
      : stage === "dragging"
        ? [`Moving ${f.wellId} to ${shortDate(asOf, f.toStart_d)}`, "The twin checks the generators", "text-ink"]
        : stage === "overload"
          ? [`Over capacity on ${f.overloadDays.length} days`, `${rangeText(asOf, f.overloadDays[0]!, f.overloadDays.at(-1)!)}, ${fmtFixed(f.peakEdited_t_per_h, 1)} against ${fmtFixed(f.capacity_t_per_h, 1)} t/h`, "text-alert"]
          : stage === "resolving"
            ? ["Testing moves", `${f.tested.slots} wells, ${f.tested.shifts} shifts`, "text-ink"]
            : ["Fits again", moved ? `${moved.wellId} steams ${Math.abs(moved.delta_d)} days ${moved.delta_d > 0 ? "later" : "sooner"}, the cheapest of ${clears.length} moves` : "", "text-produce"];
  const showOptions = stage === "resolving" || stage === "resolved";
  const adopted = t >= FIELD.adoptClick;
  const before = f.changeBefore;
  const after = f.changeAfter;
  const k = smooth((t - FIELD.resolved - 0.6) / 0.6);
  return (
    <div className={cn(PANEL, "absolute right-6 bottom-9 w-[426px] px-5 pt-4 pb-4")} style={{ opacity: a }}>
      <span className="text-[14px] font-bold tracking-[0.08em] text-ink-2 uppercase">Twin · steam scheduler</span>
      <div className={cn("mt-1.5 text-[26px] leading-tight font-bold stretch-semi", tone)}>{head}</div>
      <div className="mt-0.5 min-h-[22px] text-[15px] text-ink-2">{sub}</div>
      {showOptions && (
      <div className="mt-3 border-t border-rule-strong pt-2">
        <div className="grid grid-cols-[1fr_0.8fr_1fr] pb-1 text-[14px] font-semibold text-ink-3">
          <span>Well</span>
          <span>Move</span>
          <span className="text-right">Result</span>
        </div>
        {clears.slice(0, 4).map((o, i) => {
          const chosen = stage === "resolved" && moved && o.slotId === moved.slotId;
          const ki = smooth((t - (FIELD.overloadHold + 0.25 + i * 0.3)) / 0.3);
          return (
            <div key={o.slotId} className={cn("grid grid-cols-[1fr_0.8fr_1fr] rounded-[3px] px-1.5 py-1 text-[15.5px]", chosen && "bg-shift/20")} style={{ opacity: ki }}>
              <span className="font-semibold text-ink">{o.wellId}</span>
              <span className="font-mono text-ink">{fmtShift(o.delta_d!)}</span>
              <span className={cn("text-right font-semibold", chosen ? "text-ink" : "text-produce")}>{chosen ? "chosen" : "clears"}</span>
            </div>
          );
        })}
      </div>
      )}
      {stage === "resolved" && (
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-rule-strong pt-3" style={{ opacity: k }}>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-ink-2">Oil, 90 days</span>
          <span className="font-mono text-[18px] text-ink">
            {fmtInt(before.oil_bbl)} → {fmtInt(after.oil_bbl)}
          </span>
          <span className="font-mono text-[15px] font-semibold text-produce">{fmtSigned(after.oil_bbl - before.oil_bbl)} bbl</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-ink-2">Steam-oil ratio</span>
          <span className="font-mono text-[18px] text-ink">
            {fmtFixed(before.sor ?? 0, 2)} → {fmtFixed(after.sor ?? 0, 2)}
          </span>
          <span className="text-[14px] text-ink-2">{f.changedWells.join(" and ")}</span>
        </div>
      </div>
      )}
      <button
        type="button"
        data-cursor="adopt"
        className={cn(
          "mt-4 h-[46px] w-full rounded-[4px] text-[17px] font-semibold",
          adopted ? "bg-produce text-[#f4fbfa]" : stage === "resolved" ? "bg-ink text-[#fbf4e8]" : "bg-sand-deep text-ink-3",
          pressed === "adopt" && "scale-[0.98]",
        )}
      >
        {adopted ? "Adopted" : "Adopt proposal"}
      </button>
    </div>
  );
}
