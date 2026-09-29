"use client";

import type { SteamSlot } from "@bgw/optimise";
import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import type { StoryData } from "../data";
import { frame } from "../frame";
import { FIELD_DAY, fieldStageAt, type FieldStage as Stage } from "../script";
import { fieldXZ, STATION } from "./layout";
import { hash, Particles, type Particle } from "./particles";
import { Pumpjack, type PumpDrive } from "./pumpjack";
import { carrierAt } from "../stroke";
import { sandTexture } from "./textures";

// The field at 26 units to the kilometre: every producing well at its schematic
// position, the steam station, and a steam line to each well injecting on
// 7 Nov under the plan on screen. Lines turn red while the generators are over.


function planAt(data: StoryData, stage: Stage): readonly SteamSlot[] {
  const f = data.fieldBeat;
  return stage === "issued" || stage === "dragging" ? f.issued : stage === "resolved" ? f.proposal : f.edited;
}

function injecting(plan: readonly SteamSlot[], day: number): Set<string> {
  return new Set(plan.filter((s) => s.start_d <= day && day < s.start_d + s.injection_d).map((s) => s.wellId));
}

type LineRef = ComponentRef<typeof Line>;

function SteamLine({ to, data, wellId }: { to: [number, number]; data: StoryData; wellId: string }) {
  const ref = useRef<LineRef>(null);
  const red = useMemo(() => new THREE.Color("#e0402a"), []);
  const white = useMemo(() => new THREE.Color("#fffaf2"), []);
  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    const stage = fieldStageAt(frame.t);
    const on = injecting(planAt(data, stage), FIELD_DAY).has(wellId);
    l.visible = on;
    const over = stage === "overload" || stage === "resolving";
    l.material.color.copy(over ? red : white);
    l.material.dashOffset = -frame.t * 3;
  });
  return (
    <Line
      ref={ref}
      points={[
        [STATION[0], 0.5, STATION[1]],
        [to[0], 0.5, to[1]],
      ]}
      color="#fffaf2"
      lineWidth={5}
      dashed
      dashSize={1.6}
      gapSize={0.9}
    />
  );
}

function Generators() {
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(() => {
    const s = fieldStageAt(frame.t);
    const over = s === "overload" || s === "resolving";
    const pulse = over ? 0.5 + 0.5 * Math.sin(frame.t * 7) : 0;
    for (const m of mats.current) m?.emissive.setRGB(0.75 * pulse, 0.08 * pulse, 0.04 * pulse);
  });
  return (
    <group position={[STATION[0], 0, STATION[1]]}>
      {[-1.6, 1.6].map((dz, i) => (
        <group key={dz} position={[0, 0, dz]}>
          <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
            <boxGeometry args={[4.8, 2.3, 2.2]} />
            <meshStandardMaterial ref={(m) => void (mats.current[i] = m!)} color="#efe8dc" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.95, 1.105]}>
            <boxGeometry args={[4.8, 0.24, 0.02]} />
            <meshStandardMaterial color="#b5301f" />
          </mesh>
          <mesh position={[1.9, 3.5, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.34, 4.5, 16]} />
            <meshStandardMaterial color="#7c746c" roughness={0.5} metalness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FieldWell({ id, at, css, spin, data }: { id: string; at: [number, number]; css: boolean; spin: number; data: StoryData }) {
  const offset = hash(spin, 3);
  const rate = 1 / (2.3 + 1.4 * hash(spin, 4));
  const drive = useMemo<() => PumpDrive>(() => {
    const out: PumpDrive = { carrier: 0, gap: 0, rising: true };
    return () => {
      const plan = planAt(data, fieldStageAt(frame.t));
      const idle = css && plan.some((s) => s.wellId === id && s.start_d <= FIELD_DAY && FIELD_DAY < s.start_d + s.injection_d + s.soak_d);
      const p = idle ? offset : offset + frame.t * rate;
      const ph = p - Math.floor(p);
      out.carrier = carrierAt(ph, 0.5);
      out.rising = ph < 0.5;
      return out;
    };
  }, [css, data, id, offset, rate]);
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, spin, 0]} scale={0.82}>
      <Pumpjack drive={drive} simple accent={css ? "#a8391f" : "#8a7d70"} />
    </group>
  );
}

function Ring({ at, color, from = "issued" }: { at: [number, number]; color: string; from?: Stage }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const order: Stage[] = ["issued", "dragging", "overload", "resolving", "resolved"];
    if (ref.current) ref.current.visible = order.indexOf(fieldStageAt(frame.t)) >= order.indexOf(from);
  });
  return (
    <mesh ref={ref} position={[at[0], 0.08, at[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[5.2, 6.1, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}

export function FieldStage({ data }: { data: StoryData }) {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.Fog("#f1e7d7", 170, 520), []);
  useFrame(() => {
    scene.fog = frame.stage === "field" ? fog : null;
  });
  const ground = useMemo(() => {
    const t = sandTexture(21, 0.45);
    t.repeat.set(28, 28);
    return t;
  }, []);
  const wells = data.field.producing.map((w, i) => ({
    id: w.id,
    at: fieldXZ(w.location.x_km, w.location.y_km),
    css: w.status === "css",
    spin: -Math.PI / 2 + (hash(i, 9) - 0.5) * 0.9,
  }));
  const outline = useMemo(() => data.field.dataset.map.outline_km.map(([x, y]) => {
    const [wx, wz] = fieldXZ(x, y);
    return [wx, 0.12, wz] as [number, number, number];
  }), [data]);
  const f = data.fieldBeat;
  const at = (id: string) => wells.find((w) => w.id === id)!.at;
  const move = f.moves[0];
  const moved = move?.wellId;

  const plumes = wells.filter((w) => w.css);
  const placePlume = (i: number, o: Particle) => {
    const w = plumes[i % plumes.length]!;
    const on = injecting(planAt(data, fieldStageAt(frame.t)), FIELD_DAY).has(w.id);
    const age = (hash(i, 2) + frame.t * 0.3) % 1;
    o.x = w.at[0] + (hash(i, 5) - 0.5) + age * 3;
    o.y = 1.5 + age * 9;
    o.z = w.at[1] + (hash(i, 6) - 0.5) + age * 1.5;
    o.size = 2.2 + age * 5;
    o.alpha = on ? 0.55 * (1 - age) * Math.min(1, age * 6) : 0;
  };

  return (
    <group>
      <directionalLight
        position={[-90, 110, 70]}
        intensity={2.3}
        color="#ffe1b8"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
        shadow-radius={3}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial map={ground} roughness={1} />
      </mesh>
      <Line points={outline.concat([outline[0]!])} color="#9a7a55" lineWidth={2} dashed dashSize={4} gapSize={3} />
      {wells.map((w) => (
        <FieldWell key={w.id} id={w.id} at={w.at} css={w.css} spin={w.spin} data={data} />
      ))}
      <Generators />
      {wells
        .filter((w) => w.css)
        .map((w) => (
          <SteamLine key={w.id} to={w.at} data={data} wellId={w.id} />
        ))}
      <Ring at={at(f.wellId)} color="#c2410c" />
      {moved && <Ring at={at(moved)} color="#f59e0b" from="resolved" />}
      <Particles count={120} color="#e9e3da" place={placePlume} />
    </group>
  );
}
