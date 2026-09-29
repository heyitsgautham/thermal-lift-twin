"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { frame } from "../frame";
import { HALF, RESERVOIR, WELL_XZ } from "./layout";
import { rockTexture, sandTexture } from "./textures";

// The ground at BGW-14 as a cutaway block. One corner is cut out down to the
// basement so the wellbore stands in section, from the thermal wellhead to the
// pump and the Jodhpur Sandstone. Depth is compressed, 30 m to a unit, and the
// ruler on the cut face says so; the surface is at full scale.


export interface Layer {
  top: number;
  bottom: number;
  base: string;
  grain: string[];
  bedding?: number;
}


const LAYERS: Layer[] = [
  { top: 0, bottom: -1.3, base: "#d6b68a", grain: ["#bf9c6c", "#ecd6b0", "#a9855a"] },
  { top: -1.3, bottom: -9, base: "#c49a6c", grain: ["#a97f55", "#d9b58a", "#8f6b48"] },
  { top: -9, bottom: -18.5, base: "#a98567", grain: ["#8d6d52", "#bf9d7f", "#76593f"], bedding: 0.24 },
  { top: -18.5, bottom: -27.5, base: "#8f786a", grain: ["#76615a", "#a88f80", "#63524a"], bedding: 0.3 },
  { top: -27.5, bottom: -33.6, base: "#b4a99b", grain: ["#998e82", "#cdc4b8", "#8a7f74"], bedding: 0.2 },
  { top: -33.6, bottom: RESERVOIR.top, base: "#6e6158", grain: ["#5a4f47", "#85776c"], bedding: 0.26 },
  { top: RESERVOIR.top, bottom: RESERVOIR.bottom, base: "#cf8a4f", grain: ["#b36f38", "#e6a66b", "#9c5c2c", "#f0c08e"], bedding: 0.12 },
  { top: RESERVOIR.bottom, bottom: -45, base: "#5b4a41", grain: ["#4a3c35", "#6e5c51"], bedding: 0.2 },
];

/** Shared heat uniforms: every rock face glows around the well from the same numbers. */
export const heatUniforms = {
  uHeat: { value: 0 },
  uRadius: { value: 3 },
  uHeight: { value: 2 },
  uCenterY: { value: (RESERVOIR.top + RESERVOIR.bottom) / 2 },
  uWell: { value: new THREE.Vector2(WELL_XZ[0], WELL_XZ[1]) },
  uHot: { value: new THREE.Color("#ffb14a") },
  uWarm: { value: new THREE.Color("#c2410c") },
  /** Crude seeping in (sign +1) or steam driving out (sign -1): bands that move through the heated sandstone. */
  uFlow: { value: 0 },
  uFlowSign: { value: 1 },
  uFlowAmt: { value: 0 },
  uFlowColor: { value: new THREE.Color("#3a1a08") },
};

function heatMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, heatUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHeatPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvHeatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vHeatPos;
uniform float uHeat; uniform float uRadius; uniform float uHeight; uniform float uCenterY;
uniform vec2 uWell; uniform vec3 uHot; uniform vec3 uWarm;
uniform float uFlow; uniform float uFlowSign; uniform float uFlowAmt; uniform vec3 uFlowColor;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
float hr = distance(vHeatPos.xz, uWell) / uRadius;
float hy = (vHeatPos.y - uCenterY) / uHeight;
float heatG = uHeat * exp(-hr * hr) * exp(-hy * hy * hy * hy);
vec3 heatC = mix(uWarm, uHot, clamp(uHeat * 1.15 - hr * 0.35, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, heatC, clamp(heatG * 0.85, 0.0, 0.85));
totalEmissiveRadiance += heatC * heatG * 0.95;
float fr = distance(vHeatPos.xz, uWell) + 0.22 * sin(vHeatPos.y * 4.0 + vHeatPos.x * 0.7 + vHeatPos.z * 0.7);
float inSand = step(${RESERVOIR.bottom.toFixed(3)}, vHeatPos.y) * step(vHeatPos.y, ${RESERVOIR.top.toFixed(3)});
float wave = fract(fr * 0.62 + uFlow * uFlowSign);
float band = smoothstep(0.0, 0.16, wave) * smoothstep(0.62, 0.22, wave);
float reach = exp(-pow(fr / (uRadius * 1.15 + 0.8), 2.0)) * smoothstep(0.45, 0.9, fr);
diffuseColor.rgb = mix(diffuseColor.rgb, uFlowColor, clamp(inSand * reach * band * uFlowAmt, 0.0, 1.0) * 0.62);`,
      );
  };
  return m;
}

function LayerBlock({ layer, index, sand }: { layer: Layer; index: number; sand: THREE.Texture }) {
  const h = layer.top - layer.bottom;
  const mat = useMemo(() => {
    const tex = rockTexture(layer.base, layer.grain, 11 + index * 17, layer.bedding ?? 0.16);
    tex.repeat.set(HALF / 9, h / 9);
    return heatMaterial(tex);
  }, [layer, index, h]);
  const top = useMemo(() => {
    if (index !== 0) return null;
    const t = sand.clone();
    t.repeat.set(HALF / 14, HALF / 14);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0 });
  }, [index, sand]);
  const mats = useMemo(() => (top ? [mat, mat, top, mat, mat, mat] : mat), [mat, top]);
  const y = (layer.top + layer.bottom) / 2;
  const quads: [number, number][] = [
    [-HALF / 2, -HALF / 2],
    [HALF / 2, -HALF / 2],
    [-HALF / 2, HALF / 2],
  ];
  return (
    <>
      {quads.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, y, z]} material={mats} receiveShadow castShadow={index === 0}>
          <boxGeometry args={[HALF, h, HALF]} />
        </mesh>
      ))}
    </>
  );
}

export function Diorama() {
  const sand = useMemo(() => sandTexture(), []);
  useFrame(() => {
    const k = frame.heat;
    heatUniforms.uHeat.value = Math.pow(k, 0.8);
    heatUniforms.uRadius.value = 1.6 + 10.5 * Math.pow(k, 0.75);
    heatUniforms.uHeight.value = 1.9 + 1.1 * k;
    const m = frame.moment;
    if (m.phase === "steam") {
      heatUniforms.uFlow.value = frame.steamFlow * 0.9;
      heatUniforms.uFlowSign.value = -1;
      heatUniforms.uFlowAmt.value = 0.85;
      heatUniforms.uFlowColor.value.set("#fff1e0");
    } else {
      heatUniforms.uFlow.value = frame.oilFlow * 0.9;
      heatUniforms.uFlowSign.value = 1;
      heatUniforms.uFlowAmt.value = m.phase === "produce" ? Math.min(1, 0.35 + m.oil_bbl_per_d / 45) : 0;
      heatUniforms.uFlowColor.value.set("#3a1a08");
    }
  });
  return (
    <group>
      {LAYERS.map((l, i) => (
        <LayerBlock key={i} layer={l} index={i} sand={sand} />
      ))}
      {/* concrete well pad over the cut corner */}
      <mesh position={[0.35, -0.2, 0.35]} castShadow receiveShadow>
        <boxGeometry args={[3.3, 0.56, 3.3]} />
        <meshStandardMaterial color="#c9bdab" roughness={0.9} />
      </mesh>
      {/* gravel pad under the pumping unit and the steam generator */}
      <mesh position={[-6.4, 0.02, -2.2]} receiveShadow>
        <boxGeometry args={[12.4, 0.05, 11]} />
        <meshStandardMaterial color="#cdb593" roughness={1} />
      </mesh>
    </group>
  );
}
