"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { WellPicker } from "@/components/kit/well-picker";
import { useTwinContext } from "@/components/twin/twin-provider";
import { Button } from "@/components/ui/button";
import { dateRange, dateWithYear, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CycleChart } from "./cycle-chart";
import { useCssWellOptions, useCycleView } from "./cycle-hooks";
import { PumpSchedule, WhyTheseDates } from "./cycle-plan-side";

const PLAY_MS = 9000;

export function CyclePlanScreen() {
  const { dataset, focusWell, setFocusWell } = useTwinContext();
  const asOf = dataset.meta.asOf;
  const wells = useCssWellOptions();
  const view = useCycleView(focusWell);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, now - start) / PLAY_MS);
      setCursor(Math.round(view.start_d + p * (view.end_d - view.start_d)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, view.end_d, view.start_d]);

  const next = view.next;
  const cursorDay = view.days[Math.max(0, Math.min(view.days.length - 1, (cursor ?? 0) - view.start_d))]!;
  const upcoming = view.days.filter((d) => d.d >= 0 && d.part === "tail");
  const cycleNumber = view.anchor.cycleNumber;
  const today = view.days.find((d) => d.d === 0);
  const lastTail = next ? view.days.find((d) => d.d === next.start_d - 1) : undefined;
  const oilToSteam = upcoming.reduce((s, d) => s + d.oil_bbl_per_d, 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="cycle-plan">
      <ScreenHeader
        title={
          <span className="flex items-center gap-3">
            Cycle plan
            <WellPicker value={focusWell} wells={wells} onChange={setFocusWell} testId="well-picker" />
          </span>
        }
        subtitle={
          next ? (
            <>
              Cycle {cycleNumber} from its first day of production on {dateWithYear(asOf, view.anchorSoakEnd_d)}, through today, to its steam
              date on {dateWithYear(asOf, next.start_d)}
            </>
          ) : (
            <>No steam slot for this well in the 90-day calendar</>
          )
        }
      >
        {next && today?.tubingViscosity_cP && lastTail?.tubingViscosity_cP && (
          <>
            <Readout
              label="Steam date"
              value={shortDate(asOf, next.start_d)}
              note={view.plannedStart_d !== null ? <>plan had {shortDate(asOf, view.plannedStart_d)}</> : <>as planned</>}
              testId="readout-next-steam"
            />
            <Readout
              label="Crude in the tubing"
              value={fmtInt(lastTail.tubingViscosity_cP)}
              unit="cP"
              note={<>by {shortDate(asOf, lastTail.d)}, {fmtInt(today.tubingViscosity_cP)} cP today</>}
            />
            <Readout
              label="Pump today"
              value={fmtFixed(today.twin!.spm * today.twin!.runtime_frac, 2)}
              unit="avg SPM"
              note={<>{fmtFixed(today.twin!.spm, 1)} SPM running, {Math.round(today.twin!.runtime_frac * 100)}% of the day</>}
            />
            <Readout label="Oil until steam" value={fmtInt(oilToSteam)} unit="bbl" note={<>{upcoming.length} days of cycle {cycleNumber} left</>} />
          </>
        )}
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_356px] gap-4 max-[1600px]:grid-cols-[minmax(0,1fr)_300px] max-[1600px]:gap-3">
        <Panel
          title="Cooling, crude and pump, day by day"
          aside={
            <span className="flex items-center justify-end gap-2">
              {cursor !== null && (
                <span className="font-mono text-[10px] text-ink">
                  {shortDate(asOf, cursorDay.d)}
                  {cursorDay.temperature_C !== null && (
                    <>
                      {" · "}
                      {fmtFixed(cursorDay.temperature_C, 0)} °C · {fmtInt(cursorDay.viscosity_cP!)} cP · {fmtFixed(cursorDay.oil_bbl_per_d, 1)} bbl/d ·{" "}
                      {fmtFixed(cursorDay.twin!.spm * cursorDay.twin!.runtime_frac, 2)} SPM
                    </>
                  )}
                  {cursorDay.temperature_C === null && ` · ${cursorDay.part}`}
                </span>
              )}
            </span>
          }
          testId="cycle-chart"
        >
          <CycleChart
            view={view}
            asOf={asOf}
            reservoir_C={dataset.wells.find((w) => w.id === focusWell)!.fluid.reservoirTemperature_C}
            cursor={cursor}
            playing={playing}
            onCursor={setCursor}
          />
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <PumpSchedule view={view} asOf={asOf} />
          <WhyTheseDates view={view} asOf={asOf} steamCost_bbl_per_t={dataset.assumptions.steamCost_bbl_per_t} />
          <div className="flex items-center gap-2">
            <Button onClick={() => { setCursor(0); setPlaying((p) => !p); }} data-testid="play-cycle" className="gap-1.5">
              {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {playing ? "Pause" : "Play the cycle"}
            </Button>
            <span className="text-[11px] text-ink-3">{next ? dateRange(asOf, 0, view.end_d) : ""}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 rounded-full" style={{ background: "linear-gradient(90deg,#f59e0b,#c2410c)" }} />Heated-zone temperature</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-5 bg-ink" />Viscosity</span>
        <span className="flex items-center gap-1.5"><span className="h-[9px] w-5 bg-produce/40" />Oil rate</span>
        <span className="flex items-center gap-1.5"><span className="h-[2px] w-5 bg-ink" />Twin schedule</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t border-dashed border-ink-3" />Current practice, constant speed</span>
        <span className={cn("flex items-center gap-1.5")}>
          <span className="h-[9px] w-5" style={{ background: "repeating-linear-gradient(45deg, rgb(204 31 26 / 0.35) 0 1.2px, rgb(204 31 26 / 0.07) 1.2px 4px)" }} />
          Rod-float risk band at constant speed
        </span>
      </div>
    </div>
  );
}
