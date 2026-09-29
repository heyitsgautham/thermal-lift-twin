"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// A conventional beam pumping unit built from primitives, with the real linkage:
// the horsehead's wire rope sets the polished rod on the arc, the walking beam
// pivots on the Samson post, and the pitman arms tie the beam's back end to the
// cranks. The rod position is the input, so the crank turns at whatever speed
// the stroke profile asks for, which is exactly what a VFD does.

export const STROKE_M = 3.66;
const SADDLE_Y = 6.7;
const BACK_ARM = 3.1;
const CRANK_R = 1.2;
const GEAR_OFFSET: [number, number] = [-3.35, -4.35];
const PITMAN = Math.hypot(GEAR_OFFSET[0] + BACK_ARM, GEAR_OFFSET[1]);
/** Carrier bar height at the bottom of the stroke. */
export const CARRIER_BOTTOM_Y = 1.75;

interface Linkage {
  thetaMin: number;
  thetaMax: number;
  horsehead: number;
  /** Crank angle table over one turn and the beam angle it gives. */
  phi: Float64Array;
  theta: Float64Array;
  iMin: number;
  iMax: number;
}

function solveLinkage(): Linkage {
  // Beam angle for a crank angle: circle(saddle, back arm) against circle(crank pin, pitman), back-end branch.
  const n = 1440;
  const phi = new Float64Array(n);
  const theta = new Float64Array(n);
  const [gx, gy] = GEAR_OFFSET;
  let iMin = 0;
  let iMax = 0;
  for (let i = 0; i < n; i++) {
    const f = (i / n) * Math.PI * 2;
    const kx = gx + CRANK_R * Math.cos(f);
    const ky = gy + CRANK_R * Math.sin(f);
    const d = Math.hypot(kx, ky);
    const a = (BACK_ARM * BACK_ARM - PITMAN * PITMAN + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, BACK_ARM * BACK_ARM - a * a));
    const mx = (a * kx) / d;
    const my = (a * ky) / d;
    const c1x = mx + (h * ky) / d;
    const c1y = my - (h * kx) / d;
    const c2x = mx - (h * ky) / d;
    const c2y = my + (h * kx) / d;
    const [bx, by] = c1x < c2x ? [c1x, c1y] : [c2x, c2y];
    phi[i] = f;
    theta[i] = Math.atan2(-by, -bx);
    if (theta[i]! < theta[iMin]!) iMin = i;
    if (theta[i]! > theta[iMax]!) iMax = i;
  }
  const thetaMin = theta[iMin]!;
  const thetaMax = theta[iMax]!;
  return { thetaMin, thetaMax, horsehead: STROKE_M / (thetaMax - thetaMin), phi, theta, iMin, iMax };
}

export const LINKAGE = solveLinkage();

/** Crank angle for a beam angle, on the upstroke or the downstroke half of the turn. */
function crankFor(theta: number, up: boolean): number {
  const L = LINKAGE;
  const n = L.phi.length;
  const start = up ? L.iMin : L.iMax;
  const end = up ? L.iMax : L.iMin;
  const len = (end - start + n) % n;
  let lo = 0;
  let hi = len;
  const at = (k: number) => L.theta[(start + k) % n]!;
  const rising = at(len) > at(0);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(mid) < theta === rising) lo = mid;
    else hi = mid;
  }
  return L.phi[(start + lo) % n]!;
}

export interface PumpDrive {
  /** Carrier bar position, 0 bottom to 1 top. */
  carrier: number;
  /** Rods above the carrier bar, stroke fractions. */
  gap: number;
  /** Upstroke when true. */
  rising: boolean;
}

// Materials: painted steel with a light clear coat, bare steel for pins, rods and wire rope.
function usePaint(color: string, rough = 0.5) {
  return useMemo(
    () => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0.35, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    [color, rough],
  );
}

const BODY = "#3d3531";
const BASE = "#4b423b";

/** A bevelled bar between two points, `size` across. */
function Bar({ from, to, size, material }: { from: [number, number, number]; to: [number, number, number]; size: [number, number]; material: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: a.add(b).multiplyScalar(0.5), quat, len };
  }, [from, to]);
  return (
    <RoundedBox args={[size[0], len, size[1]]} radius={Math.min(size[0], size[1]) * 0.18} smoothness={3} position={pos} quaternion={quat} material={material} castShadow receiveShadow />
  );
}

/** Horsehead side profile: the curved face, tapering back to where it bolts onto the beam. */
function horseheadShape(r: number, a0: number, a1: number): THREE.Shape {
  const s = new THREE.Shape();
  const neck = r - 1.05;
  s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
  s.absarc(0, 0, r, a0, a1, false);
  s.lineTo(Math.cos(a1) * (r - 0.34), Math.sin(a1) * (r - 0.34));
  s.lineTo(neck, 0.34);
  s.lineTo(neck, -0.3);
  s.lineTo(Math.cos(a0) * (r - 0.34), Math.sin(a0) * (r - 0.34));
  s.closePath();
  return s;
}

/** Crank arm outline: wide at the shaft, tapering toward the crank pin. */
function crankShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.32, -0.3);
  s.lineTo(CRANK_R + 0.18, -0.17);
  s.absarc(CRANK_R + 0.18, 0, 0.17, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-0.32, 0.3);
  s.absarc(-0.32, 0, 0.3, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

/**
 * The unit sits with its polished rod over the local origin and its beam along -x.
 * `drive` is read every frame.
 */
export function Pumpjack({ drive, accent = "#9c3320", simple = false }: { drive: () => PumpDrive; accent?: string; simple?: boolean }) {
  const A = LINKAGE.horsehead;
  const Sx = -A;
  const Sy = SADDLE_Y;
  const Gx = Sx + GEAR_OFFSET[0];
  const Gy = Sy + GEAR_OFFSET[1];
  const body = usePaint(BODY);
  const base = usePaint(BASE, 0.62);
  const red = usePaint(accent, 0.45);
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: "#a4a7a8", roughness: 0.3, metalness: 0.85 }), []);
  const rope = useMemo(() => new THREE.MeshStandardMaterial({ color: "#26221f", roughness: 0.55, metalness: 0.6 }), []);
  const rodMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e4e2dd", roughness: 0.15, metalness: 0.95 }), []);
  const guard = usePaintless(accent);

  const beam = useRef<THREE.Group>(null);
  const cranks = useRef<THREE.Group>(null);
  const pitmans = useRef<(THREE.Object3D | null)[]>([]);
  const carrier = useRef<THREE.Group>(null);
  const clamp = useRef<THREE.Mesh>(null);
  const rod = useRef<THREE.Mesh>(null);
  const bridles = useRef<(THREE.Mesh | null)[]>([]);
  // The painted head stops short of the face radius; a steel face plate carries the wire rope at radius A.
  const head = useMemo(() => horseheadShape(A - 0.14, -0.5, 0.5), [A]);
  const face = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(Math.cos(-0.5) * (A + 0.01), Math.sin(-0.5) * (A + 0.01));
    s.absarc(0, 0, A + 0.01, -0.5, 0.5, false);
    s.lineTo(Math.cos(0.5) * (A - 0.07), Math.sin(0.5) * (A - 0.07));
    s.absarc(0, 0, A - 0.07, 0.5, -0.5, true);
    return s;
  }, [A]);
  const crank = useMemo(() => crankShape(), []);
  const tmp = useMemo(() => ({ b: new THREE.Vector3(), k: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(() => {
    const d = drive();
    const theta = LINKAGE.thetaMin + d.carrier * (LINKAGE.thetaMax - LINKAGE.thetaMin);
    const phi = crankFor(theta, d.rising);
    if (beam.current) beam.current.rotation.z = theta;
    if (cranks.current) cranks.current.rotation.z = phi;
    tmp.b.set(Sx - BACK_ARM * Math.cos(theta), Sy - BACK_ARM * Math.sin(theta), 0);
    tmp.k.set(Gx + CRANK_R * Math.cos(phi), Gy + CRANK_R * Math.sin(phi), 0);
    tmp.d.set(tmp.k.x - tmp.b.x, tmp.k.y - tmp.b.y, 0);
    const len = tmp.d.length();
    tmp.d.normalize();
    for (const [i, m] of pitmans.current.entries()) {
      if (!m) continue;
      m.position.set((tmp.b.x + tmp.k.x) / 2, (tmp.b.y + tmp.k.y) / 2, i === 0 ? 1.18 : -1.18);
      m.quaternion.setFromUnitVectors(tmp.up, tmp.d);
      m.scale.set(1, len, 1);
    }
    const yc = CARRIER_BOTTOM_Y + d.carrier * STROKE_M;
    const yr = yc + d.gap * STROKE_M;
    if (carrier.current) carrier.current.position.y = yc;
    if (clamp.current) clamp.current.position.y = yr + 0.17;
    if (rod.current) {
      const top = yr + 0.6;
      rod.current.position.y = (top + 0.95) / 2;
      rod.current.scale.y = top - 0.95;
    }
    for (const b of bridles.current) {
      if (!b) continue;
      b.position.y = (Sy + yc + 0.1) / 2;
      b.scale.y = Sy - yc - 0.1;
    }
  });

  const skidTop = 0.36;
  return (
    <group>
      {/* skid on its concrete plinth */}
      <RoundedBox args={[8.2, 0.3, 2.6]} radius={0.05} smoothness={2} position={[Sx - 1.85, 0.15, 0]} material={base} castShadow receiveShadow />
      {[-0.95, 0.95].map((z) => (
        <RoundedBox key={z} args={[8.0, 0.18, 0.26]} radius={0.04} smoothness={2} position={[Sx - 1.85, skidTop - 0.04, z]} material={body} castShadow receiveShadow />
      ))}

      {/* Samson post: four legs meeting under the saddle, braced */}
      <Bar from={[Sx + 1.25, skidTop, 0.92]} to={[Sx + 0.05, Sy - 0.32, 0.22]} size={[0.24, 0.24]} material={body} />
      <Bar from={[Sx + 1.25, skidTop, -0.92]} to={[Sx + 0.05, Sy - 0.32, -0.22]} size={[0.24, 0.24]} material={body} />
      <Bar from={[Sx - 1.45, skidTop, 0.92]} to={[Sx - 0.05, Sy - 0.32, 0.22]} size={[0.2, 0.2]} material={body} />
      <Bar from={[Sx - 1.45, skidTop, -0.92]} to={[Sx - 0.05, Sy - 0.32, -0.22]} size={[0.2, 0.2]} material={body} />
      <Bar from={[Sx + 0.78, Sy * 0.42, 0.66]} to={[Sx + 0.78, Sy * 0.42, -0.66]} size={[0.13, 0.13]} material={body} />
      <Bar from={[Sx - 0.92, Sy * 0.42, 0.66]} to={[Sx - 0.92, Sy * 0.42, -0.66]} size={[0.12, 0.12]} material={body} />
      <Bar from={[Sx + 0.78, Sy * 0.42, 0]} to={[Sx - 0.92, Sy * 0.42, 0]} size={[0.12, 0.12]} material={body} />
      {/* saddle bearing */}
      <RoundedBox args={[0.9, 0.34, 0.9]} radius={0.05} smoothness={2} position={[Sx, Sy - 0.3, 0]} material={body} castShadow />
      <mesh position={[Sx, Sy - 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel} castShadow>
        <cylinderGeometry args={[0.17, 0.17, 1.0, 20]} />
      </mesh>

      {/* walking beam, horsehead and equalizer */}
      <group ref={beam} position={[Sx, Sy, 0]}>
        {[0.32, -0.16].map((y) => (
          <RoundedBox key={y} args={[A + BACK_ARM - 0.25, 0.09, 0.52]} radius={0.03} smoothness={2} position={[(A - BACK_ARM - 0.95) / 2, y, 0]} material={body} castShadow />
        ))}
        <mesh position={[(A - BACK_ARM - 0.95) / 2, 0.08, 0]} material={body} castShadow>
          <boxGeometry args={[A + BACK_ARM - 0.3, 0.4, 0.1]} />
        </mesh>
        <mesh position={[0, 0, -0.44]} material={red} castShadow>
          <extrudeGeometry args={[head, { depth: 0.88, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 48 }]} />
        </mesh>
        <mesh position={[0, 0, -0.3]} material={steel} castShadow>
          <extrudeGeometry args={[face, { depth: 0.6, bevelEnabled: false, curveSegments: 48 }]} />
        </mesh>
        <RoundedBox args={[0.42, 0.34, 2.64]} radius={0.05} smoothness={2} position={[-BACK_ARM, -0.08, 0]} material={body} castShadow />
        <mesh position={[-BACK_ARM, -0.3, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.12, 0.12, 2.8, 16]} />
        </mesh>
      </group>

      {/* pitman arms, placed every frame */}
      {[0, 1].map((i) => (
        <group key={i} ref={(m) => void (pitmans.current[i] = m)}>
          <RoundedBox args={[0.2, 1, 0.14]} radius={0.04} smoothness={2} material={body} castShadow />
        </group>
      ))}

      {/* gear reducer on its pedestal, cranks and counterweights */}
      <RoundedBox args={[1.3, Gy - 1.05 - skidTop, 1.1]} radius={0.05} smoothness={2} position={[Gx + 0.1, (Gy - 1.05 + skidTop) / 2, 0]} material={base} castShadow receiveShadow />
      <RoundedBox args={[1.9, 1.15, 1.25]} radius={0.12} smoothness={3} position={[Gx, Gy - 0.55, 0]} material={body} castShadow receiveShadow />
      <mesh position={[Gx, Gy - 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={body} castShadow>
        <cylinderGeometry args={[0.72, 0.72, 1.25, 32]} />
      </mesh>
      <group ref={cranks} position={[Gx, Gy, 0]}>
        {[0.82, -0.82].map((z) => (
          <group key={z}>
            <mesh position={[0, 0, z - 0.08]} material={body} castShadow>
              <extrudeGeometry args={[crank, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }]} />
            </mesh>
            <RoundedBox args={[0.7, 1.12, 0.28]} radius={0.06} smoothness={2} position={[CRANK_R * 0.62, 0, z > 0 ? 1.03 : -1.03]} material={red} castShadow />
            <mesh position={[CRANK_R, 0, z > 0 ? 1.07 : -1.07]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
              <cylinderGeometry args={[0.08, 0.08, 0.34, 14]} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={steel}>
          <cylinderGeometry args={[0.15, 0.15, 2.3, 18]} />
        </mesh>
      </group>
      {!simple && (
        <>
          {/* prime mover and belt guard */}
          <RoundedBox args={[1.4, 0.3, 1.1]} radius={0.04} smoothness={2} position={[Gx - 1.95, skidTop + 0.15, 0]} material={base} castShadow receiveShadow />
          <mesh position={[Gx - 1.95, skidTop + 0.78, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.46, 0.46, 1.0, 28]} />
            <meshPhysicalMaterial color="#5f6d66" roughness={0.45} metalness={0.4} clearcoat={0.3} />
          </mesh>
          <Bar from={[Gx - 1.95, skidTop + 0.78, 0.72]} to={[Gx - 0.05, Gy - 0.1, 0.72]} size={[0.62, 0.16]} material={guard} />
        </>
      )}

      {/* wire rope, carrier bar, clamp and polished rod */}
      {[0.13, -0.13].map((z, i) => (
        <mesh key={z} ref={(m) => void (bridles.current[i] = m)} position={[0.02, 3, z]} material={rope}>
          <cylinderGeometry args={[0.03, 0.03, 1, 8]} />
        </mesh>
      ))}
      <group ref={carrier} position={[0, CARRIER_BOTTOM_Y, 0]}>
        <RoundedBox args={[0.3, 0.16, 0.66]} radius={0.04} smoothness={2} material={steel} castShadow />
      </group>
      <mesh ref={clamp} position={[0, CARRIER_BOTTOM_Y + 0.17, 0]} material={body} castShadow>
        <cylinderGeometry args={[0.13, 0.13, 0.2, 16]} />
      </mesh>
      <mesh ref={rod} position={[0, 2, 0]} material={rodMat} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 1, 12]} />
      </mesh>
    </group>
  );
}

/** Belt guards are sheet metal in the accent colour, matte. */
function usePaintless(color: string) {
  return useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2 }), [color]);
}
