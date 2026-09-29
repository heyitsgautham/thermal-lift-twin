"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Soft round particles with their own size and opacity, placed every frame by
// a pure function of the particle index, so a frame never depends on the last.

export interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
}

const VERT = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.25, r) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export function Particles({
  count,
  color,
  place,
  additive = false,
}: {
  count: number;
  color: string;
  place: (i: number, out: Particle) => void;
  additive?: boolean;
}) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 1 } },
      }),
    [color, additive],
  );
  const out = useRef<Particle>({ x: 0, y: 0, z: 0, size: 0, alpha: 0 });
  useFrame(() => {
    // World size to pixels: half the drawing-buffer height over tan(fov / 2).
    mat.uniforms.uScale!.value = (size.height * dpr) / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const sz = geo.getAttribute("aSize") as THREE.BufferAttribute;
    const al = geo.getAttribute("aAlpha") as THREE.BufferAttribute;
    const o = out.current;
    for (let i = 0; i < count; i++) {
      o.alpha = 0;
      place(i, o);
      pos.setXYZ(i, o.x, o.y, o.z);
      sz.setX(i, o.size);
      al.setX(i, o.alpha);
    }
    pos.needsUpdate = sz.needsUpdate = al.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

/** A fixed pseudo-random number in [0, 1) for particle `i` and channel `k`. */
export function hash(i: number, k = 0): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
