"use client";

import * as THREE from "three";
import { cn } from "@/lib/utils";
import type { StoryData } from "../data";
import { depthY, fieldXZ, GENERATOR_AT, HALF, PUMP_Y, RESERVOIR, STATION, WELL_XZ, type P3 } from "../scene/layout";
import { momentAt } from "../data";
import { cameraAt, dayAt, fieldStageAt, modeAt, stageAt, windowAlpha, type FieldStage } from "../script";

// Labels pinned to points in the 3D world, drawn in the HUD. Each point is
// projected through the same scripted camera the scene renders with, so a
// label sits on its part in every frame without waiting for the renderer.

const cam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

function project(t: number, p: P3): [number, number] | null {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const view = cameraAt(t);
  cam.fov = view.fov;
  cam.aspect = w / h;
  cam.near = 0.1;
  cam.far = 2000;
  cam.position.set(...view.pos);
  cam.lookAt(...view.target);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  v.set(...p).project(cam);
  if (v.z < -1 || v.z > 1) return null;
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
}

const [WX, WZ] = WELL_XZ;

interface Callout {
  text: string;
  at: P3;
  from: number;
  to: number;
  side?: "left" | "right";
}

const CALLOUTS: Callout[] = [
  { text: "Thermal wellhead", at: [WX + 0.3, 1.2, WZ + 0.3], from: 3.2, to: 8.9 },
  { text: "Steam generator", at: [GENERATOR_AT[0], 3.1, GENERATOR_AT[2]], from: 3.6, to: 8.4, side: "left" },
  { text: "Pumping unit", at: [-4.2, 7.4, WZ], from: 4.2, to: 8.9, side: "left" },
  { text: "VIT tubing", at: [WX + 0.25, -13.2, WZ + 0.25], from: 8.9, to: 10.9 },
  { text: "Rod string", at: [WX - 0.1, -14.5, WZ - 0.1], from: 9.3, to: 11.0, side: "left" },
  { text: "Pump · 1,100 m", at: [WX + 0.3, PUMP_Y + 1.6, WZ + 0.3], from: 10.4, to: 13.6 },
  { text: "Jodhpur Sandstone · about 1,150 m", at: [6.5, (RESERVOIR.top + RESERVOIR.bottom) / 2, 0.05], from: 10.8, to: 16.4 },
];

function Pin({ at, text, side, alpha, tone = "ink" }: { at: [number, number]; text: string; side?: "left" | "right"; alpha: number; tone?: "ink" | "alert" | "produce" }) {
  const left = side === "left";
  return (
    <div
      className="absolute top-0 left-0 flex items-center gap-2 whitespace-nowrap"
      style={{ opacity: alpha, transform: `translate(${at[0]}px, ${at[1]}px) translate(${left ? "-100%" : "0"}, -50%) translateX(${left ? 6 : -6}px)`, flexDirection: left ? "row-reverse" : "row" }}
    >
      <span className="block size-3 rounded-full border-2 border-[#fbf7f0] bg-ink shadow" />
      <span className="block h-px w-8 bg-ink/70" />
      <span
        className={cn(
          "rounded-[3px] border px-2.5 py-1 text-[15px] font-semibold shadow-[0_2px_10px_rgba(59,42,30,0.18)]",
          tone === "alert" ? "border-alert bg-alert text-white" : tone === "produce" ? "border-produce bg-produce text-white" : "border-ink/20 bg-sheet text-ink",
        )}
      >
        {text}
      </span>
    </div>
  );
}

/** The rods' state, tagged on the tubing in the two pump-level shots. */
function RodTag({ t, data }: { t: number; data: StoryData }) {
  const today = windowAlpha(t, 55.6, 61.4, 0.4);
  const twin = windowAlpha(t, 96.0, 102.4, 0.4);
  const a = Math.max(today, twin);
  if (a <= 0.001) return null;
  const m = momentAt(data.well, modeAt(t), dayAt(t));
  const slack = m.phase === "produce" && m.floatRatio >= 1;
  const p = project(t, [WX + 0.35, -32.2, WZ + 0.35]);
  if (!p) return null;
  return <Pin at={p} text={slack ? "Rods slack" : "Rods loaded"} alpha={a} tone={slack ? "alert" : "produce"} />;
}

export function WellLabels({ t, data }: { t: number; data: StoryData }) {
  if (stageAt(t) !== "well") return null;
  const rulerA = 0.95 * Math.max(windowAlpha(t, 13.2, 64.8, 0.5), windowAlpha(t, 78.2, 83.6, 0.5), windowAlpha(t, 94.4, 136.6, 0.5));
  return (
    <>
      {rulerA > 0.001 &&
        [300, 600, 900, 1150].map((m) => {
          const p = project(t, [0.03, depthY(m), HALF - 0.7]);
          if (!p) return null;
          return (
            <div key={m} className="absolute top-0 left-0 flex items-center gap-2" style={{ opacity: rulerA, transform: `translate(${p[0] - 9}px, ${p[1]}px) translateY(-50%)` }}>
              <span className="block h-[2px] w-[18px] bg-[#fbf7f0] shadow-[0_1px_2px_rgba(40,25,15,0.6)]" />
              <span className="font-mono text-[14px] font-semibold whitespace-nowrap text-[#fbf7f0]" style={{ textShadow: "0 1px 3px rgba(40,25,15,0.85)" }}>
                {m.toLocaleString("en-US")} m
              </span>
            </div>
          );
        })}
      <RodTag t={t} data={data} />
      {CALLOUTS.map((c) => {
        const a = windowAlpha(t, c.from, c.to, 0.4);
        if (a <= 0.001) return null;
        const p = project(t, c.at);
        return p ? <Pin key={c.text} at={p} text={c.text} side={c.side} alpha={a} /> : null;
      })}
    </>
  );
}

const ORDER: FieldStage[] = ["issued", "dragging", "overload", "resolving", "resolved"];

export function FieldLabels({ t, data }: { t: number; data: StoryData }) {
  const a = windowAlpha(t, 138.2, 161.2, 0.5);
  if (a <= 0.001) return null;
  const f = data.fieldBeat;
  const stage = fieldStageAt(t);
  const at = (id: string): P3 => {
    const w = data.field.producing.find((x) => x.id === id)!;
    const [x, z] = fieldXZ(w.location.x_km, w.location.y_km);
    return [x, 9.6, z];
  };
  const move = f.moves[0];
  const over = stage === "overload" || stage === "resolving";
  const a2 = data.field.assumptions;
  const tags: { key: string; p: P3; text: string; tone: string; on: boolean }[] = [
    { key: "story", p: at(f.wellId), text: f.wellId, tone: "#c2410c", on: true },
    ...(move
      ? [{ key: "move", p: at(move.wellId), text: `${move.wellId} · ${Math.abs(move.delta_d)} days ${move.delta_d > 0 ? "later" : "sooner"}`, tone: "#b86e04", on: ORDER.indexOf(stage) >= ORDER.indexOf("resolved") }]
      : []),
  ];
  const station = project(t, [STATION[0], 6.6, STATION[1]]);
  return (
    <div style={{ opacity: a }}>
      {tags.map((g) => {
        const p = project(t, g.p);
        if (!p || !g.on) return null;
        return (
          <div key={g.key} className="absolute top-0 left-0" style={{ transform: `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%)` }}>
            <span className="block rounded-[3px] px-2.5 py-1 text-[15px] font-bold whitespace-nowrap text-white shadow-[0_2px_8px_rgba(59,42,30,0.3)]" style={{ background: g.tone }}>
              {g.text}
            </span>
          </div>
        );
      })}
      {station && (
        <div className="absolute top-0 left-0" style={{ transform: `translate(${station[0]}px, ${station[1]}px) translate(-50%, -100%)` }}>
          <span className={cn("block rounded-[3px] border px-2.5 py-1 text-[15px] font-semibold whitespace-nowrap shadow-[0_2px_8px_rgba(59,42,30,0.25)]", over ? "border-alert bg-alert text-white" : "border-rule-strong bg-sheet text-ink")}>
            Steam generators · {a2.generatorUnits} × {a2.generatorUnitCapacity_t_per_h.toFixed(0)} t/h, assumed
          </span>
        </div>
      )}
    </div>
  );
}
