"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { frame } from "../frame";
import { GENERATOR_AT, PAD, STACK_TOP, WELL_XZ, type P3 } from "./layout";
import { hash, Particles, type Particle } from "./particles";
import { CARRIER_BOTTOM_Y, Pumpjack, STROKE_M, type PumpDrive } from "./pumpjack";
import { dotTexture } from "./textures";

// What stands on the pad: the thermal wellhead, the pumping unit, the steam
// generator and its insulated line, a flowline to the tank, and the well sign.

const [WX, WZ] = WELL_XZ;
/** The float gap is drawn larger than life so it reads on a 1080p frame. */
const GAP_DRAWN = 2.4;


function Pipe({ path, r, color }: { path: P3[]; r: number; color: string }) {
  const geo = useMemo(() => {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < path.length; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...path[i - 1]!), new THREE.Vector3(...path[i]!)));
    return new THREE.TubeGeometry(curve, path.length * 24, r, 12, false);
  }, [path, r]);
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.55} />
    </mesh>
  );
}

/** A point at fraction `u` of the way along a polyline. */
function along(path: P3[], u: number): P3 {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i]![0], p[1] - path[i]![1], p[2] - path[i]![2]));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = u * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i]! || i === lens.length - 1) {
      const k = Math.min(1, d / lens[i]!);
      const a = path[i]!;
      const b = path[i + 1]!;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    d -= lens[i]!;
  }
  return path.at(-1)!;
}

export const STEAM_LINE: P3[] = [
  [GENERATOR_AT[0] - 1.2, 0.95, GENERATOR_AT[2] + 1.2],
  [1.7, 0.55, GENERATOR_AT[2] + 1.2],
  [1.7, 0.55, -1.4],
  [WX, 0.95, WZ - 0.75],
  [WX, 0.95, WZ - 0.32],
];
const FLOW_LINE: P3[] = [
  [WX - 0.4, 0.95, WZ],
  [-1.0, 0.55, WZ + 0.7],
  [-1.6, 0.5, 3.4],
  [-7.4, 0.5, 7.6],
];
const TANK_AT: P3 = [-8.8, 0, 8.4];

function Wellhead() {
  const steel = "#8d9296";
  return (
    <group position={[WX, PAD, WZ]}>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.56, 0.56, 0.18, 28]} />
        <meshStandardMaterial color={steel} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.5, 24]} />
        <meshStandardMaterial color="#b0442a" roughness={0.45} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.44, 0.1, 24]} />
        <meshStandardMaterial color={steel} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.46, 0.34, 0.46]} />
        <meshStandardMaterial color="#b0442a" roughness={0.45} metalness={0.4} />
      </mesh>
      {/* side outlets: steam in, crude out, each with a valve wheel */}
      {[
        [0, -1],
        [-1, 0],
      ].map(([dx, dz]) => (
        <group key={`${dx}${dz}`}>
          <mesh position={[dx! * 0.36, 0.9, dz! * 0.36]} rotation={[dz ? Math.PI / 2 : 0, 0, dx ? Math.PI / 2 : 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.36, 14]} />
            <meshStandardMaterial color={steel} roughness={0.35} metalness={0.7} />
          </mesh>
          <mesh position={[dx! * 0.3, 1.18, dz! * 0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.13, 0.025, 8, 24]} />
            <meshStandardMaterial color="#b5301f" roughness={0.5} metalness={0.2} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.4, 20]} />
        <meshStandardMaterial color={steel} roughness={0.3} metalness={0.75} />
      </mesh>
    </group>
  );
}

function SteamGenerator() {
  const [gx, , gz] = GENERATOR_AT;
  return (
    <group>
      <mesh position={[gx, 1.3, gz]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 2.3, 2.2]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh position={[gx, 1.95, gz + 1.105]}>
        <boxGeometry args={[4.8, 0.24, 0.02]} />
        <meshStandardMaterial color="#b5301f" roughness={0.6} />
      </mesh>
      <mesh position={[gx, 1.95, gz - 1.105]}>
        <boxGeometry args={[4.8, 0.24, 0.02]} />
        <meshStandardMaterial color="#b5301f" roughness={0.6} />
      </mesh>
      <mesh position={[gx - 2.9, 1.0, gz]} castShadow>
        <boxGeometry args={[1.2, 1.7, 1.9]} />
        <meshStandardMaterial color="#d9d0c1" roughness={0.6} />
      </mesh>
      <mesh position={[STACK_TOP[0], 3.45, STACK_TOP[2]]} castShadow>
        <cylinderGeometry args={[0.28, 0.34, 4.5, 20]} />
        <meshStandardMaterial color="#7c746c" roughness={0.5} metalness={0.5} />
      </mesh>
      {[-1.7, 1.7].map((dx) => (
        <mesh key={dx} position={[gx + dx, 0.12, gz]} castShadow>
          <boxGeometry args={[0.7, 0.24, 2.3]} />
          <meshStandardMaterial color="#51453b" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Tank() {
  return (
    <group position={TANK_AT}>
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.55, 1.55, 3.2, 36]} />
        <meshStandardMaterial color="#e6ddcf" roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[0, 3.25, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.58, 0.2, 36]} />
        <meshStandardMaterial color="#d3c8b8" roughness={0.55} metalness={0.2} />
      </mesh>
    </group>
  );
}

function WellSign() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fbf7f0";
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = "#3b2a1e";
    g.lineWidth = 10;
    g.strokeRect(5, 5, 502, 246);
    g.fillStyle = "#3b2a1e";
    g.font = "700 120px Archivo, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("BGW-14", 256, 138);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  return (
    <group position={[4.2, 0, -3.6]} rotation={[0, Math.PI / 4, 0]}>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.46, -0.09]} castShadow>
          <boxGeometry args={[0.08, 0.92, 0.08]} />
          <meshStandardMaterial color="#51453b" />
        </mesh>
      ))}
      <mesh position={[0, 1.28, 0]} castShadow>
        <planeGeometry args={[1.6, 0.8]} />
        <meshStandardMaterial map={tex} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function heroDrive(): PumpDrive {
  const m = frame.moment;
  const p = frame.strokes - Math.floor(frame.strokes);
  return { carrier: frame.rod.carrier, gap: frame.rod.gap * GAP_DRAWN, rising: p < (m.upstrokeFraction ?? 0.5) };
}

/** A red flash at the carrier bar when it catches the floating rods. */
function ClampFlash() {
  const glow = useMemo(() => dotTexture(), []);
  const ref = useRef<THREE.Sprite>(null);
  const mat = useRef<THREE.SpriteMaterial>(null);
  useFrame(() => {
    const j = frame.rod.jolt;
    if (!ref.current || !mat.current) return;
    ref.current.position.set(WX, PAD + CARRIER_BOTTOM_Y + frame.rod.carrier * STROKE_M + 0.1, WZ);
    ref.current.scale.setScalar(0.6 + 1.6 * j);
    mat.current.opacity = Math.min(1, j * 1.3);
  });
  return (
    <sprite ref={ref} renderOrder={6}>
      <spriteMaterial ref={mat} map={glow} color="#ff3a1f" transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

export function Surface() {
  const placeSteamLine = (i: number, o: Particle) => {
    const on = frame.moment.phase === "steam";
    const u = (hash(i, 1) + frame.steamFlow * 0.5) % 1;
    const [x, y, z] = along(STEAM_LINE, u);
    o.x = x;
    o.y = y + 0.28;
    o.z = z;
    o.size = 0.34;
    o.alpha = on ? 0.55 * Math.sin(Math.PI * u) : 0;
  };
  const placePlume = (i: number, o: Particle) => {
    const on = frame.moment.phase === "steam";
    const age = (hash(i, 2) + frame.t * 0.22) % 1;
    o.x = STACK_TOP[0] + (hash(i, 3) - 0.5) * 0.5 + age * 2.2;
    o.y = STACK_TOP[1] + age * 5.5;
    o.z = STACK_TOP[2] + (hash(i, 4) - 0.5) * 0.5 + age * 1.1;
    o.size = 1.1 + age * 3.4;
    o.alpha = on ? 0.42 * (1 - age) * Math.min(1, age * 8) : 0;
  };
  return (
    <group>
      <group position={[WX, PAD, WZ]}>
        <Pumpjack drive={heroDrive} />
      </group>
      <Wellhead />
      <SteamGenerator />
      <ClampFlash />
      <Pipe path={STEAM_LINE} r={0.17} color="#d9d4cb" />
      <Pipe path={FLOW_LINE} r={0.1} color="#5b4d42" />
      <Tank />
      <WellSign />
      <Particles count={40} color="#ffffff" place={placeSteamLine} />
      <Particles count={40} color="#c9c1b6" place={placePlume} />
    </group>
  );
}
