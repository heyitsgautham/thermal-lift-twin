"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { clock } from "./clock";
import { storyData } from "./data";
import type { StoryTables } from "./frame";
import { Hud } from "./hud/hud";
import { World } from "./scene/world";
import { DURATION } from "./script";
import { flowTable, strokeTable } from "./stroke";

// The story page: the 3D twin under a light HUD, both driven by one clock.
// `?rec` hands the clock to the recorder, `?t=` opens at a moment, Space plays.

export default function StoryApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const rec = params.has("rec");
  const data = useMemo(() => storyData(), []);
  const tables = useMemo<StoryTables>(() => ({ strokes: strokeTable(data.well), ...flowTable(data.well) }), [data]);

  useEffect(() => {
    const t0 = Number(params.get("t") ?? 0);
    clock.set(Math.min(DURATION, Math.max(0, Number.isFinite(t0) ? t0 : 0)));
    if (rec) return;
    clock.playing = params.has("play");
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (clock.t >= DURATION) clock.set(0);
      clock.playing = !clock.playing;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [params, rec]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#f3eadc]">
      <Canvas
        className="absolute inset-0"
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        frameloop={rec ? "never" : "always"}
        gl={{ antialias: true, preserveDrawingBuffer: rec, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.02 }}
        camera={{ fov: 34, near: 0.1, far: 2000, position: [30, 15, 38] }}
      >
        <World data={data} tables={tables} rec={rec} />
      </Canvas>
      <Hud data={data} />
    </div>
  );
}
