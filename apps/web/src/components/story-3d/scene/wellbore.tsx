"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { frame } from "../frame";
import { PUMP_Y, RESERVOIR, WELL_XZ } from "./layout";
import { hash, Particles, type Particle } from "./particles";
import { bandTexture, dotTexture } from "./textures";

// The well in section: casing and vacuum-insulated tubing cut open toward the
// camera, the rod string down to the pump at 1,100 m, crude rising or steam
// going down the tubing, and steam driving out into the heated sandstone.

const [WX, WZ] = WELL_XZ;
const TOP = -0.3;
const BARREL = { bottom: PUMP_Y - 0.25, top: PUMP_Y + 3.4 };
/** Plunger travel drawn in the barrel, units. */
const DOWNHOLE_STROKE = 2.7;
const OPEN_START = (3 * Math.PI) / 4;
type LineRef = ComponentRef<typeof Line>;

function HalfShell({ r, from, to, color, metal = 0.55, opacity = 1 }: { r: number; from: number; to: number; color: string; metal?: number; opacity?: number }) {
  return (
    <mesh position={[WX, (from + to) / 2, WZ]} receiveShadow>
      <cylinderGeometry args={[r, r, to - from, 40, 1, true, OPEN_START, Math.PI]} />
      <meshStandardMaterial color={color} roughness={0.38} metalness={metal} side={THREE.DoubleSide} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** Lateral direction the rods bow toward: across the camera's view, so the bow reads. */
const BOW = new THREE.Vector3(1, 0, -1).normalize();
const N = 160;

export function Wellbore() {
  const bands = useMemo(() => {
    const t = bandTexture();
    t.repeat.set(1, 26);
    return t;
  }, []);
  const glow = useMemo(() => dotTexture(), []);
  const flowMat = useRef<THREE.MeshBasicMaterial>(null);
  const rods = useRef<LineRef>(null);
  const pulse = useRef<LineRef>(null);
  const plunger = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Sprite>(null);
  const bloom = useRef<THREE.Sprite>(null);
  const bloomMat = useRef<THREE.SpriteMaterial>(null);
  const flashMat = useRef<THREE.SpriteMaterial>(null);
  const pts = useMemo(() => new Float32Array((N + 1) * 3), []);
  const pulsePts = useMemo(() => new Float32Array(6), []);

  const oilColor = useMemo(() => new THREE.Color("#6b3510"), []);
  const steamColor = useMemo(() => new THREE.Color("#fff7f0"), []);

  useFrame(() => {
    const m = frame.moment;
    const r = frame.rod;
    // Crude or steam in the tubing.
    if (flowMat.current) {
      const steam = m.phase === "steam";
      flowMat.current.color.copy(steam ? steamColor : oilColor);
      flowMat.current.opacity = m.phase === "produce" ? 0.92 : steam ? 0.85 : 0.35;
      bands.offset.y = steam ? frame.steamFlow * 2.2 : -frame.oilFlow * 2.2;
    }
    // Rod string, bowed when the rods float.
    const bottom = BARREL.bottom + 0.55 + r.rods * DOWNHOLE_STROKE;
    // The lagging rods bow inside the tubing just above the pump, never past its wall.
    const bow = Math.min(0.17, r.gap * 3.2);
    for (let i = 0; i <= N; i++) {
      const s = i / N; // 0 at the pump, 1 at the wellhead
      const y = bottom + (TOP - bottom) * s;
      const env = s < 0.26 ? Math.sin((Math.PI * s) / 0.26) : 0;
      const off = bow * env * Math.sin(s * Math.PI * 38 + frame.strokes * 2.1);
      pts[i * 3] = WX + BOW.x * off;
      pts[i * 3 + 1] = y;
      pts[i * 3 + 2] = WZ + BOW.z * off;
    }
    const line = rods.current;
    if (line) {
      line.geometry.setPositions(pts);
      const mat = line.material;
      mat.color.setRGB(0.8 + 0.2 * r.jolt, 0.8 - 0.45 * r.jolt, 0.8 - 0.5 * r.jolt);
    }
    if (plunger.current) plunger.current.position.y = bottom - 0.3;
    // The shock: travels from the surface to the pump as the jolt decays.
    const j = r.jolt;
    const p = pulse.current;
    if (p) {
      const at = TOP + (bottom - TOP) * (1 - Math.pow(j, 0.55));
      pulsePts[0] = pulsePts[3] = WX;
      pulsePts[2] = pulsePts[5] = WZ;
      pulsePts[1] = at + 1.8;
      pulsePts[4] = at - 1.8;
      p.geometry.setPositions(pulsePts);
      p.visible = j > 0.04;
      p.material.opacity = Math.min(1, j * 1.6);
    }
    // A soft bloom where the steam heats the sandstone, sized by the heated zone.
    if (bloom.current && bloomMat.current) {
      const h = frame.heat;
      bloom.current.scale.set(3 + 13 * h, 2.2 + 4.5 * h, 1);
      bloomMat.current.opacity = 0.42 * h;
    }
    if (flash.current && flashMat.current) {
      const f = Math.max(0, Math.min(1, (0.62 - j) * 2.4)) * Math.min(1, j * 5);
      flash.current.position.set(WX, bottom, WZ);
      flash.current.scale.setScalar(1.6 + 4.2 * f);
      flashMat.current.opacity = f;
    }
  });

  // Steam pushing out through the heated sandstone, along the two cut faces.
  const band = [RESERVOIR.bottom + 0.35, RESERVOIR.top - 0.35] as const;
  const placeSteam = (i: number, o: Particle) => {
    const m = frame.moment;
    const face = i % 2;
    const u = (hash(i, 5) + frame.steamFlow * (0.09 + 0.05 * hash(i, 6))) % 1;
    const d = 0.7 + u * (1.5 + 9 * Math.pow(frame.heat, 0.7));
    const y = band[0] + (band[1] - band[0]) * hash(i, 7);
    o.x = face ? WX + d : 0.05;
    o.z = face ? 0.05 : WZ + d;
    o.y = y;
    o.size = 0.5 + 0.4 * hash(i, 8);
    o.alpha = m.phase === "steam" ? (1 - u) * 0.85 : 0;
  };

  return (
    <group>
      {/* casing, cut open to the camera */}
      <HalfShell r={0.46} from={RESERVOIR.bottom + 0.3} to={TOP} color="#8f969a" />
      {/* vacuum-insulated tubing: two walls */}
      <HalfShell r={0.27} from={BARREL.top} to={TOP} color="#c7ccd0" metal={0.7} />
      <HalfShell r={0.215} from={BARREL.top} to={TOP} color="#a9b0b5" metal={0.7} />
      {/* crude or steam moving in the tubing */}
      <mesh position={[WX, (BARREL.top + TOP) / 2, WZ]} renderOrder={2}>
        <cylinderGeometry args={[0.19, 0.19, TOP - BARREL.top, 24, 1, true, OPEN_START, Math.PI]} />
        <meshBasicMaterial ref={flowMat} map={bands} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* pump barrel and plunger */}
      <HalfShell r={0.3} from={BARREL.bottom} to={BARREL.top} color="#7c7068" metal={0.5} />
      <mesh ref={plunger} position={[WX, PUMP_Y, WZ]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.9, 20]} />
        <meshStandardMaterial color="#d9d4cc" roughness={0.25} metalness={0.85} />
      </mesh>
      <mesh position={[WX, BARREL.bottom + 0.12, WZ]}>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color="#56504b" roughness={0.3} metalness={0.8} />
      </mesh>
      <Line ref={rods} points={[[WX, TOP, WZ], [WX, PUMP_Y, WZ]]} color="#cfcfcf" lineWidth={3.2} />
      <Line ref={pulse} points={[[WX, -1, WZ], [WX, -2, WZ]]} color="#ff3a1f" lineWidth={7} transparent opacity={0} />
      <sprite ref={flash} position={[WX, PUMP_Y, WZ]} renderOrder={6}>
        <spriteMaterial ref={flashMat} map={glow} color="#ff3a1f" transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <Particles count={60} color="#fffaf2" place={placeSteam} additive />
      <sprite ref={bloom} position={[WX + 1.3, (RESERVOIR.top + RESERVOIR.bottom) / 2, WZ + 1.3]} renderOrder={4}>
        <spriteMaterial ref={bloomMat} map={glow} color="#ff9a3d" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}
