"use client";

import { fieldRisk, slotSteam_t, type WellRecord } from "@bgw/optimise";
import { steamTonnesToCweBbl } from "@bgw/physics";
import { contours } from "d3-contour";
import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBoxSize } from "@/components/kit/chart";
import { Chip, Panel, ScreenHeader } from "@/components/kit/panel";
import { Readout } from "@/components/kit/readout";
import { Segmented } from "@/components/kit/segmented";
import { useTwinContext } from "@/components/twin/twin-provider";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { shortDate } from "@/lib/dates";
import { fmtFixed, fmtInt } from "@/lib/format";
import { useNoOverlap } from "@/lib/use-no-overlap";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const PLAY_MS = 8000;
const PHASE_COLOR: Record<string, string> = {
  steam: "var(--steam)",
  soak: "var(--soak)",
  produce: "var(--produce)",
  down: "var(--down)",
};

type Highlight = "css" | "all";

export function FieldMapScreen() {
  const { twin, dataset, setFocusWell } = useTwinContext();
  const router = useRouter();
  const asOf = dataset.meta.asOf;
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [highlight, setHighlight] = useState<Highlight>("css");
  const [selected, setSelected] = useState<string>("BGW-14");
  const [ref, size] = useBoxSize<HTMLDivElement>();
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, now - start) / PLAY_MS);
      setDay(Math.round(p * (dataset.meta.horizon_d - 1)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, dataset.meta.horizon_d]);

  const risks = useMemo(
    () => new Map(fieldRisk(twin.field, twin.proposal, dataset.health, dataset.assumptions.reliability).map((r) => [r.wellId, r])),
    [twin.field, twin.proposal, dataset.health, dataset.assumptions.reliability],
  );
  const timelines = useMemo(() => new Map(twin.evalView.timelines.map((t) => [t.wellId, t])), [twin.evalView]);
  const sor = useMemo(() => {
    const out = new Map<string, number>();
    for (const w of twin.field.cssWells) {
      const anchor = twin.field.anchorCycle(w.id);
      const inst = { ...anchor, slotId: null, start_d: anchor.steamStart_d };
      const leg = twin.field.resteamOf(w.id, inst).productionLeg_d;
      const oil = twin.field.curveFor(w.id, inst).cumulativeOil(leg - 1);
      out.set(w.id, steamTonnesToCweBbl(slotSteam_t(anchor)) / oil);
    }
    return out;
  }, [twin.field]);

  const { outline_km, structure } = dataset.map;
  // Zoom to the wells; an inset shows where that sits in the whole 200 km² field.
  const bounds = useMemo(() => {
    const producingWells = dataset.wells.filter((w) => w.status === "css" || w.status === "cold");
    const xs = producingWells.map((w) => w.location.x_km);
    const ys = producingWells.map((w) => w.location.y_km);
    return { x0: Math.min(...xs) - 0.9, x1: Math.max(...xs) + 0.9, y0: Math.min(...ys) - 0.6, y1: Math.max(...ys) + 0.6 };
  }, [dataset.wells]);
  const full = useMemo(() => {
    const xs = outline_km.map((p) => p[0]);
    const ys = outline_km.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }, [outline_km]);
  const k = size.width > 0 ? Math.min(size.width / (bounds.x1 - bounds.x0), size.height / (bounds.y1 - bounds.y0)) : 1;
  const ox = (size.width - k * (bounds.x1 - bounds.x0)) / 2;
  const oy = (size.height - k * (bounds.y1 - bounds.y0)) / 2;
  const px = (x: number) => ox + (x - bounds.x0) * k;
  const py = (y: number) => size.height - (oy + (y - bounds.y0) * k);

  const contourPaths = useMemo(() => {
    const levels = [1140, 1145, 1150, 1155, 1160, 1170, 1180, 1190, 1200];
    const gen = contours().size([structure.nx, structure.ny]).thresholds(levels.map((l) => -l));
    // Depth increases downwards, so contour the negated depth to get closed crest rings.
    const polys = gen(structure.depth_m.map((d) => -d));
    return polys.map((p) => ({
      level: -p.value,
      rings: p.coordinates.flatMap((poly) =>
        poly.map((ring) => ring.map(([gx, gy]) => [structure.x0_km + (gx - 0.5) * structure.step_km, structure.y0_km + (gy - 0.5) * structure.step_km] as [number, number])),
      ),
    }));
  }, [structure]);

  useNoOverlap(svgRef, [size.width, size.height, day, highlight], 2);

  const producing = dataset.wells.filter((w) => w.status === "css" || w.status === "cold");
  const counts = { steam: 0, soak: 0, produce: 0, down: 0 };
  let fieldOil = 0;
  let cssOil = 0;
  for (const w of producing) {
    const c = timelines.get(w.id)!.days[day]!;
    counts[c.phase]++;
    fieldOil += c.oil_bbl_per_d;
    if (w.status === "css") cssOil += c.oil_bbl_per_d;
  }
  const sel = dataset.wells.find((w) => w.id === selected)!;
  const selCell = timelines.get(selected)?.days[day];
  const selRisk = risks.get(selected);

  const glyph = (w: WellRecord) => {
    const cx = px(w.location.x_km);
    const cy = py(w.location.y_km);
    const dim = highlight === "css" && w.status !== "css";
    if (w.status !== "css" && w.status !== "cold") {
      return (
        <g key={w.id} opacity={dim ? 0.35 : 0.8}>
          <circle cx={cx} cy={cy} r={3.2} fill="var(--sheet)" stroke="var(--ink-3)" strokeWidth={1.1} />
          <line x1={cx - 2.2} x2={cx + 2.2} y1={cy} y2={cy} stroke="var(--ink-3)" strokeWidth={1} />
        </g>
      );
    }
    const cell = timelines.get(w.id)!.days[day]!;
    const r = Math.max(w.status === "css" ? 6 : 3.5, 3.5 + Math.sqrt(Math.max(0, cell.oil_bbl_per_d)) * (w.status === "css" ? 1.05 : 0.8));
    const risk = risks.get(w.id);
    const hot = risk && risk.risk.high >= 0.1;
    const isSel = w.id === selected;
    return (
      <g
        key={w.id}
        opacity={dim ? 0.3 : 1}
        className="cursor-pointer"
        onClick={() => setSelected(w.id)}
        data-testid={`map-well-${w.id}`}
      >
        {w.status === "css" && <circle cx={cx} cy={cy} r={r + 3.5} fill="none" stroke="var(--ink)" strokeWidth={isSel ? 2 : 1} opacity={isSel ? 1 : 0.55} />}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={PHASE_COLOR[cell.phase]}
          fillOpacity={w.status === "css" ? 0.92 : 0.55}
          stroke={w.status === "cold" ? "var(--produce)" : "var(--sheet)"}
          strokeWidth={1.2}
          style={{ transition: "r 250ms ease, fill 250ms ease" }}
        />
        {w.id === "BGW-8" && (
          <text x={cx} y={cy + r + 16} textAnchor="middle" fontSize={9} className="smallcaps" fill="var(--ink-2)" style={{ fontWeight: 600 }}>
            pilot 2018
          </text>
        )}
        <g data-label={w.status === "css" ? 1 : 3}>
          <text x={cx + r + 5} y={cy + 3.5} fontSize={10.5} fill="var(--ink)" className="font-mono" style={{ fontWeight: w.status === "css" ? 600 : 400 }}>
            {w.number}
          </text>
        </g>
        {w.status === "css" && !dim && (
          <g data-label={2}>
            <text x={cx + r + 5} y={cy + 15} fontSize={9} fill="var(--ink-3)" className="font-mono">
              SOR {fmtFixed(sor.get(w.id)!, 1)}
            </text>
          </g>
        )}
        {hot && (
          <g data-label={0}>
            <rect x={cx - r - 38} y={cy - 8} width={34} height={15} rx={2} fill="var(--alert)" />
            <text x={cx - r - 21} y={cy + 3} textAnchor="middle" fontSize={9.5} fill="#fff7ec" className="font-mono" style={{ fontWeight: 700 }}>
              {Math.round(risk.risk.high * 100)}%
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 px-5 pt-3 pb-2 max-[1600px]:px-4" data-testid="field-map">
      <ScreenHeader
        title="Field map"
        subtitle={
          <>
            {dataset.field.wellsDrilled} wells drilled, {dataset.field.wellsProducing} producing, {dataset.field.wellsOnCss} on cyclic steam ·
            phases on {shortDate(asOf, day)} from the proposal
          </>
        }
      >
        <Readout label="Field oil" value={fmtInt(fieldOil)} unit="bbl/d" note={<>on {shortDate(asOf, day)}</>} testId="readout-field-oil" />
        <Readout label="From CSS wells" value={`${Math.round((cssOil / fieldOil) * 100)}%`} note={<>{fmtInt(cssOil)} bbl/d from 19 wells</>} />
        <Readout label="In steam or soak" value={String(counts.steam + counts.soak)} note={<>{counts.steam} steam, {counts.soak} soak</>} tone="steam" />
        <Readout label="Risk flags" value={String([...risks.values()].filter((r) => r.risk.high >= 0.1).length)} note="est. 7-day risk above 10%" tone="alert" />
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_356px] gap-4 max-[1600px]:grid-cols-[minmax(0,1fr)_300px] max-[1600px]:gap-3">
        <Panel title={`${BRAND.field || "Field"}, wells by phase`} aside="positions and structure are schematic; OIL does not publish well coordinates">
          <div ref={ref} className="absolute inset-0">
            <div ref={svgRef} className="absolute inset-0">
              {size.width > 0 && (
                <svg width={size.width} height={size.height} className="block" role="img" aria-label="Field map">
                  <defs>
                    <pattern id="map-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink)" strokeOpacity="0.06" strokeWidth="1" />
                    </pattern>
                    <clipPath id="field-clip">
                      <path d={outline_km.map(([x, y], i) => `${i ? "L" : "M"}${px(x)},${py(y)}`).join("") + "Z"} />
                    </clipPath>
                  </defs>
                  <path d={outline_km.map(([x, y], i) => `${i ? "L" : "M"}${px(x)},${py(y)}`).join("") + "Z"} fill="var(--sand)" />
                  <path d={outline_km.map(([x, y], i) => `${i ? "L" : "M"}${px(x)},${py(y)}`).join("") + "Z"} fill="url(#map-hatch)" />
                  <g clipPath="url(#field-clip)">
                    {contourPaths.map((c) =>
                      c.rings.map((ring, i) => (
                        <path
                          key={`${c.level}-${i}`}
                          d={ring.map(([x, y], j) => `${j ? "L" : "M"}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join("") + "Z"}
                          fill={c.level <= 1150 ? "rgb(194 65 12 / 0.05)" : "none"}
                          stroke="var(--heat)"
                          strokeOpacity={c.level % 10 === 0 ? 0.42 : 0.2}
                          strokeWidth={c.level % 10 === 0 ? 1 : 0.7}
                        />
                      )),
                    )}
                  </g>
                  {contourPaths
                    .filter((c) => c.level % 10 === 0 && c.rings[0])
                    .map((c) => {
                      const ring = c.rings[0]!;
                      const [x, y] = ring[Math.floor(ring.length * 0.15)]!;
                      return (
                        <g key={`lab-${c.level}`} data-label={4}>
                          <text x={px(x)} y={py(y)} fontSize={9} fill="var(--heat)" className="font-mono" opacity={0.85}>
                            {fmtInt(c.level)} m
                          </text>
                        </g>
                      );
                    })}
                  <path d={outline_km.map(([x, y], i) => `${i ? "L" : "M"}${px(x)},${py(y)}`).join("") + "Z"} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
                  {dataset.wells.filter((w) => w.status !== "css" && w.status !== "cold").map(glyph)}
                  {dataset.wells.filter((w) => w.status === "cold").map(glyph)}
                  {dataset.wells.filter((w) => w.status === "css").map(glyph)}

                  <g transform={`translate(${size.width - 4 * k - 40}, ${size.height - 34})`}>
                    <rect x={0} y={0} width={k * 2} height={5} fill="var(--ink)" />
                    <rect x={k * 2} y={0} width={k * 2} height={5} fill="var(--sheet)" stroke="var(--ink)" />
                    <text x={0} y={18} fontSize={9.5} className="font-mono" fill="var(--ink-2)">0</text>
                    <text x={k * 2} y={18} fontSize={9.5} className="font-mono" fill="var(--ink-2)" textAnchor="middle">2</text>
                    <text x={k * 4} y={18} fontSize={9.5} className="font-mono" fill="var(--ink-2)" textAnchor="middle">4 km</text>
                  </g>
                  {(() => {
                    const iw = 150;
                    const s2 = iw / (full.x1 - full.x0);
                    const ih = (full.y1 - full.y0) * s2;
                    const ix = (x: number) => 16 + (x - full.x0) * s2;
                    const iy = (y: number) => 16 + ih - (y - full.y0) * s2;
                    return (
                      <g data-testid="map-inset">
                        <rect x={8} y={8} width={iw + 16} height={ih + 30} fill="var(--sheet)" stroke="var(--rule-strong)" />
                        <path d={outline_km.map(([x, y], i) => `${i ? "L" : "M"}${ix(x)},${iy(y)}`).join("") + "Z"} fill="var(--sand)" stroke="var(--ink)" strokeWidth={1} />
                        {dataset.wells.map((w) => (
                          <circle key={w.id} cx={ix(w.location.x_km)} cy={iy(w.location.y_km)} r={1.1} fill={w.status === "css" ? "var(--steam)" : "var(--ink-3)"} />
                        ))}
                        <rect x={ix(bounds.x0)} y={iy(bounds.y1)} width={(bounds.x1 - bounds.x0) * s2} height={(bounds.y1 - bounds.y0) * s2} fill="none" stroke="var(--ink)" strokeDasharray="2 2" />
                        <text x={16} y={ih + 32} fontSize={9} className="font-mono" fill="var(--ink-2)">
                          whole field, 200 km²
                        </text>
                      </g>
                    );
                  })()}
                  <g transform={`translate(${size.width - 40}, 40)`}>
                    <path d="M0,-18 L7,8 L0,3 L-7,8 Z" fill="var(--ink)" />
                    <text x={0} y={24} textAnchor="middle" fontSize={10} className="smallcaps" style={{ fontWeight: 700 }} fill="var(--ink)">
                      N
                    </text>
                  </g>
                  <text x={16} y={size.height - 14} fontSize={9.5} className="font-mono" fill="var(--ink-3)">
                    contours: top of Jodhpur Sandstone, metres below ground, schematic
                  </text>
                </svg>
              )}
            </div>
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel title="Day">
            <div className="flex flex-col gap-3 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[18px] font-medium text-ink">{shortDate(asOf, day)}</span>
                <Button size="sm" onClick={() => { setDay(0); setPlaying((p) => !p); }} data-testid="play-map">
                  {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                  {playing ? "Pause" : "Play 90 days"}
                </Button>
              </div>
              <Slider
                min={0}
                max={dataset.meta.horizon_d - 1}
                step={1}
                value={[day]}
                onValueChange={([v]) => setDay(v!)}
                aria-label="Day"
                className="[&_[data-slot=slider-range]]:bg-ink [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-ink [&_[data-slot=slider-track]]:bg-ink/15"
              />
              <Segmented<Highlight>
                label="Highlight"
                value={highlight}
                onChange={setHighlight}
                testId="highlight"
                options={[
                  { value: "css", label: "19 CSS wells" },
                  { value: "all", label: "All wells" },
                ]}
              />
            </div>
          </Panel>
          <Panel title="Wells by phase">
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2 px-3.5 py-3">
              {(
                [
                  ["steam", "Steam", counts.steam],
                  ["soak", "Soak", counts.soak],
                  ["produce", "Producing", counts.produce],
                  ["down", "Down", counts.down],
                ] as const
              ).map(([key, label, n]) => (
                <li key={key} className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: PHASE_COLOR[key] }} />
                  <span className="text-[12.5px] text-ink">{label}</span>
                  <span className="ml-auto font-mono text-[12px] text-ink">{n}</span>
                </li>
              ))}
              <li className="col-span-2 flex items-center gap-2 border-t border-rule pt-2">
                <span className="size-3 rounded-full border border-ink-3 bg-sheet" />
                <span className="text-[12.5px] text-ink">Shut in or observation</span>
                <span className="ml-auto font-mono text-[12px] text-ink">{dataset.field.wellsDrilled - dataset.field.wellsProducing}</span>
              </li>
              <li className="col-span-2 text-[11px] leading-snug text-ink-3">
                Circle area is oil rate. A ring marks a CSS well. SOR is the current cycle&apos;s steam-oil ratio. Red tags are the upper end of the
                estimated 7-day risk window.
              </li>
            </ul>
          </Panel>
          <Panel title={sel.id} aside={sel.status === "css" ? `cyclic steam since ${sel.css!.cssStartYear}` : sel.status} className="min-h-0 flex-1" testId="map-well-card">
            <div className="flex flex-col gap-2 px-3.5 py-3">
              {selCell ? (
                <>
                  <div className="flex items-center gap-2">
                    <Chip tone={selCell.phase === "steam" ? "steam" : selCell.phase === "soak" ? "soak" : selCell.phase === "down" ? "down" : "produce"}>
                      {selCell.phase}
                    </Chip>
                    <span className="text-[12px] text-ink-2">
                      {selCell.cycleNumber ? `cycle ${selCell.cycleNumber}` : "cold production"} on {shortDate(asOf, day)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[
                      ["Oil", `${fmtFixed(selCell.oil_bbl_per_d, 1)} bbl/d`],
                      ["Oil, 90 days", `${fmtInt(timelines.get(sel.id)!.oil90_bbl)} bbl`],
                      ["Cycle SOR", sor.has(sel.id) ? fmtFixed(sor.get(sel.id)!, 2) : "n/a"],
                      ["Est. 7-day risk", selRisk ? (selRisk.risk.high < 0.01 ? "<1%" : `${fmtFixed(selRisk.risk.low * 100, 1)} to ${fmtFixed(selRisk.risk.high * 100, 0)}%`) : "n/a"],
                    ].map(([k2, v]) => (
                      <div key={k2} className="flex flex-col">
                        <dt className="smallcaps text-[8.5px] font-semibold text-ink-3">{k2}</dt>
                        <dd className="font-mono text-[12.5px] text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {sel.status === "css" && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="border-rule-strong bg-sheet" onClick={() => { setFocusWell(sel.id); router.push("/cycle-plan"); }}>
                        Cycle plan
                      </Button>
                      <Button size="sm" variant="outline" className="border-rule-strong bg-sheet" onClick={() => { setFocusWell(sel.id); router.push("/pump"); }}>
                        Pump twin
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className={cn("text-[12px] text-ink-2")}>Not producing. Drilled {sel.spudYear}.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
