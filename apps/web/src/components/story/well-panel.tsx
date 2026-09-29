"use client";

import type { PumpSetting, StoryMode } from "@bgw/optimise";
import { longDate, shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayView, easeOut, floatDaysBy, runOf, since, storyData, type DayView } from "./data";
import { story, type StoryState } from "./store";

function ModeToggle({ mode }: { mode: StoryMode }) {
  const opts: { id: StoryMode; label: string; sub: string }[] = [
    { id: "today", label: "Today", sub: "plan date, constant speed" },
    { id: "twin", label: "Twin", sub: "steam date and pump together" },
  ];
  return (
    <div className="grid grid-cols-2 rounded-[5px] border border-rule-strong bg-sand-deep/60 p-1" role="radiogroup" aria-label="Way of working">
      {opts.map((o) => {
        const on = o.id === mode;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-testid={`mode-${o.id}`}
            onClick={() => story.setMode(o.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-[3px] px-4 py-2 text-left",
              on && o.id === "today" && "bg-ink text-[#fbf4e8]",
              on && o.id === "twin" && "bg-produce text-[#fbf4e8]",
              !on && "text-ink-2",
            )}
          >
            <span className="text-[19px] leading-tight font-bold">{o.label}</span>
            <span className={cn("text-[14px] leading-tight", on ? "text-[#fbf4e8]/85" : "text-ink-3")}>{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function status(v: DayView, mode: StoryMode): string {
  const { well } = storyData();
  if (v.phase === "rest") return "Shut in for its steam job";
  if (v.phase === "steam") return `Steam in · ${fmtInt(v.steamed_t)} t so far`;
  if (v.phase === "soak") return "Soaking · pump off";
  const start = v.cycleNumber === well.cycleNumber ? well.soakEnd_d : runOf(mode).nextSoakEnd_d;
  return `Producing · cycle ${v.cycleNumber}, day ${Math.floor(v.d - start) + 1}`;
}

function Readout({ label, value, unit, tone = "ink", testId }: { label: string; value: string; unit: string; tone?: "ink" | "heat" | "produce"; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-l border-rule-strong pl-3 first:border-l-0 first:pl-0" data-testid={testId}>
      <span className="text-[14px] font-medium text-ink-2">{label}</span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={cn("font-mono text-[34px] leading-none font-semibold", tone === "heat" && "text-heat", tone === "produce" && "text-produce")}>{value}</span>
        <span className="text-[15px] text-ink-2">{unit}</span>
      </span>
    </div>
  );
}

/**
 * Polished-rod speed over one stroke, up above the line and down below it. The
 * dashed line is the fastest the rods can sink through today's crude: it sits
 * far below while the crude is thin and climbs as it thickens. Where the
 * downstroke goes past it, the rods float.
 */
function StrokeGlyph({ setting, cycle }: { setting: PumpSetting | null; cycle: number }) {
  const W = 452;
  const H = 92;
  const mid = 38;
  const depth = 28;
  const pad = 6;
  const plotW = W - 150;
  if (!setting) {
    return (
      <svg width={W} height={H} className="block" aria-hidden>
        <path d={`M${pad} ${mid} H${plotW}`} stroke="var(--rule-strong)" strokeWidth={2} />
      </svg>
    );
  }
  const up = setting.upstrokeFraction;
  const ratio = setting.floatRatio;
  const rise = Math.min(34, depth * ((1 - up) / up));
  const limit = Math.min(H - mid - 4, depth / Math.max(ratio, 1e-3));
  const faded = depth / ratio > H - mid - 4;
  const x0 = pad;
  const xu = x0 + (plotW - pad) * up;
  const x1 = plotW;
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = x0 + ((xu - x0) * i) / 60;
    pts.push(`${x.toFixed(1)},${(mid - rise * Math.sin((Math.PI * i) / 60)).toFixed(1)}`);
  }
  for (let i = 0; i <= 90; i++) {
    const x = xu + ((x1 - xu) * i) / 90;
    pts.push(`${x.toFixed(1)},${(mid + depth * Math.sin((Math.PI * i) / 90)).toFixed(1)}`);
  }
  const over = ratio >= 1;
  const cx = cycle < up ? x0 + (xu - x0) * (cycle / up) : xu + (x1 - xu) * ((cycle - up) / (1 - up));
  const cy = cycle < up ? mid - rise * Math.sin((Math.PI * cycle) / up) : mid + depth * Math.sin((Math.PI * (cycle - up)) / (1 - up));
  const clipId = `beyond-${Math.round(limit * 10)}`;
  return (
    <svg width={W} height={H} className="block overflow-visible" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={mid + limit} width={W} height={H} />
        </clipPath>
      </defs>
      <path d={`M${x0} ${mid} H${x1}`} stroke="var(--rule-strong)" strokeWidth={1} />
      <polyline points={`${x0},${mid} ${pts.join(" ")} ${x1},${mid}`} fill={over ? "rgb(204 31 26 / 0.10)" : "rgb(15 118 110 / 0.10)"} stroke="none" />
      {over && <polyline points={`${x0},${mid} ${pts.join(" ")} ${x1},${mid}`} fill="rgb(204 31 26 / 0.55)" clipPath={`url(#${clipId})`} />}
      <polyline points={pts.join(" ")} fill="none" stroke={over ? "var(--alert)" : "var(--produce)"} strokeWidth={2.4} />
      <path d={`M${x0} ${mid + limit} H${x1}`} stroke="var(--alert)" strokeWidth={1.4} strokeDasharray="5 4" opacity={faded ? 0.45 : 1} />
      <circle cx={cx} cy={cy} r={4.5} fill="var(--ink)" />
      <text x={x1 + 12} y={mid - 12} fontSize={14} fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
        rods rise
      </text>
      <text x={x1 + 12} y={Math.min(H - 2, mid + limit + 5)} fontSize={14} fill="var(--alert)" fontWeight={600} opacity={faded ? 0.6 : 1} style={{ fontFamily: "var(--font-archivo)" }}>
        rod fall limit
      </text>
    </svg>
  );
}

function PumpBlock({ v, s }: { v: DayView; s: StoryState }) {
  const setting = v.setting;
  return (
    <section className="flex flex-col gap-2 border-t border-rule-strong pt-3" data-testid="pump-block">
      <div className="flex items-baseline justify-between">
        <span className="smallcaps text-[13px] font-bold text-ink">Pump</span>
        {setting && (
          <span className="text-[15px] text-ink-2">
            up {Math.round(setting.upstrokeFraction * 100)}% · down {Math.round((1 - setting.upstrokeFraction) * 100)}% of each stroke
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        {setting ? (
          <>
            <span className="font-mono text-[34px] leading-none font-semibold">{fmtFixed(setting.spm, 1)}</span>
            <span className="text-[15px] text-ink-2">strokes/min</span>
            <span className="ml-auto text-[15px] text-ink-2">
              runs <span className="font-mono text-ink">{fmtFixed(setting.runtime_frac * 24, 1)}</span> h a day
            </span>
          </>
        ) : (
          <span className="flex items-baseline gap-3">
            <span className="text-[24px] leading-none font-semibold text-ink-3">Pump off</span>
            <span className="text-[15px] text-ink-3">while the steam goes in and soaks</span>
          </span>
        )}
      </div>
      <StrokeGlyph setting={setting} cycle={s.stroke - Math.floor(s.stroke)} />
    </section>
  );
}

function RodsBlock({ v, s }: { v: DayView; s: StoryState }) {
  const run = runOf(s.mode);
  const count = floatDaysBy(run, s.day);
  const slamAge = s.t - s.slamAt;
  const flash = slamAge >= 0 && slamAge < 500 ? 1 - slamAge / 500 : 0;
  const state = !v.setting ? "off" : v.floats ? "float" : "loaded";
  return (
    <section className="flex items-end justify-between gap-4 border-t border-rule-strong pt-3" data-testid="rods-block">
      <div className="flex flex-col gap-2">
        <span className="smallcaps text-[13px] font-bold text-ink">Rods</span>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-[3px] px-3 py-1.5 text-[17px] font-bold",
            state === "loaded" && "bg-produce/12 text-produce",
            state === "float" && "text-[#fbf4e8]",
            state === "off" && "bg-sand-deep text-ink-3",
          )}
          style={state === "float" ? { backgroundColor: `rgb(${204 + 40 * flash} ${31 + 60 * flash} ${26 + 40 * flash})` } : undefined}
          data-testid="rods-state"
        >
          <span className={cn("size-2.5 rounded-full", state === "loaded" ? "bg-produce" : state === "float" ? "bg-[#fbf4e8]" : "bg-ink-3")} />
          {state === "loaded" ? "Loaded" : state === "float" ? "Floating, slamming each stroke" : "Pump off"}
        </span>
        <span className="text-[15px] text-ink-2">
          {state === "float" ? "the crude is too thick for the rods to sink" : state === "loaded" ? "the rods sink as fast as the unit lowers them" : "rods at rest"}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[14px] font-medium text-ink-2">Rod-float days</span>
        <span className={cn("font-mono text-[52px] leading-none font-semibold", count > 0 ? "text-alert" : "text-produce")} data-testid="float-days">
          {count}
        </span>
      </div>
    </section>
  );
}

function ComparePanel({ s }: { s: StoryState }) {
  const { well, asOf } = storyData();
  const k = easeOut(since(s.t, s.panelAt, 600));
  const rows: { label: string; sub?: string; today: string; twin: string; note?: string }[] = [
    { label: "Steam date", today: shortDate(asOf, well.today.nextSteam_d), twin: shortDate(asOf, well.twin.nextSteam_d) },
    { label: "Rod-float days", today: String(well.today.floatDays.length), twin: String(well.twin.floatDays.length) },
    {
      label: "Pump electricity",
      sub: `${shortDate(asOf, well.samePeriod.from_d)} to ${shortDate(asOf, well.samePeriod.to_d)}, same ${fmtInt(well.samePeriod.oil_bbl)} bbl of oil`,
      today: `${fmtInt(well.samePeriod.today_kWh)} kWh`,
      twin: `${fmtInt(well.samePeriod.twin_kWh)} kWh`,
      note: `${Math.round(well.samePeriod.change_frac * 100)}%`.replace("-", "−"),
    },
  ];
  return (
    <section
      className="flex flex-col gap-3 rounded-[4px] border border-produce/40 bg-sheet p-4 shadow-[0_8px_24px_rgb(59_42_30/0.10)]"
      style={{ opacity: k, transform: `translateY(${(1 - k) * 12}px)` }}
      data-testid="compare-panel"
    >
      <div className="flex items-baseline justify-between">
        <span className="smallcaps text-[13px] font-bold text-ink">Today against twin</span>
        <span className="text-[14px] text-ink-2">
          {well.wellId}, cycle {well.cycleNumber}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 gap-y-3">
        <span />
        <span className="text-right text-[14px] font-bold text-ink-2">Today</span>
        <span className="text-right text-[14px] font-bold text-produce">Twin</span>
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <span className="flex flex-col">
              <span className="text-[17px] font-semibold text-ink">{r.label}</span>
              {r.sub && <span className="text-[14px] leading-snug text-ink-2">{r.sub}</span>}
            </span>
            <span className="text-right font-mono text-[22px] text-ink-2">{r.today}</span>
            <span className="flex flex-col items-end">
              <span className="text-right font-mono text-[22px] font-semibold text-produce">{r.twin}</span>
              {r.note && <span className="font-mono text-[15px] font-semibold text-produce">{r.note}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WellPanel({ s }: { s: StoryState }) {
  const { asOf } = storyData();
  const run = runOf(s.mode);
  const v = dayView(run, s.day);
  const tone = v.temperature_C > 90 ? "heat" : "ink";
  return (
    <aside className="flex min-h-0 flex-col gap-4 rounded-[4px] border border-rule-strong bg-sheet/85 p-5" data-testid="well-panel">
      <ModeToggle mode={s.mode} />
      <div className="flex flex-col gap-1">
        <span className="text-[26px] leading-tight font-bold tracking-[-0.01em] stretch-semi" data-testid="panel-date">
          {longDate(asOf, Math.floor(s.day))}
        </span>
        <span className={cn("text-[16px] font-medium", v.phase === "steam" ? "text-steam" : v.phase === "soak" ? "text-soak" : "text-ink-2")}>{status(v, s.mode)}</span>
      </div>
      <div className="grid grid-cols-[0.9fr_1.35fr_1fr] gap-3">
        <Readout label="Rock at the well" value={fmtInt(v.temperature_C)} unit="°C" tone={tone} testId="readout-temp" />
        <Readout label="Crude in the tubing" value={fmtInt(v.tubingViscosity_cP)} unit="cP" testId="readout-cp" />
        <Readout label="Oil rate" value={fmtFixed(v.oil_bbl_per_d, 1)} unit="bbl/d" tone="produce" testId="readout-oil" />
      </div>
      {s.panel === "compare" ? (
        <ComparePanel s={s} />
      ) : (
        <>
          <PumpBlock v={v} s={s} />
          <RodsBlock v={v} s={s} />
        </>
      )}
      <div className="mt-auto grid grid-cols-2 gap-3">
        <button
          type="button"
          data-testid="open-compare"
          onClick={() => story.setPanel(s.panel === "compare" ? "none" : "compare")}
          className={cn(
            "h-11 rounded-[4px] border text-[15px] font-semibold",
            s.panel === "compare" ? "border-produce bg-produce text-[#fbf4e8]" : "border-rule-strong bg-sheet text-ink",
          )}
        >
          Compare today and twin
        </button>
        <button
          type="button"
          data-testid="open-card"
          onClick={() => story.setPanel(s.panel === "card" ? "none" : "card")}
          className={cn(
            "h-11 rounded-[4px] border text-[15px] font-semibold",
            s.panel === "card" ? "border-ink bg-ink text-[#fbf4e8]" : "border-rule-strong bg-sheet text-ink",
          )}
        >
          Pump card · {shortDate(asOf, storyData().well.card.day_d)}
        </button>
      </div>
    </aside>
  );
}
