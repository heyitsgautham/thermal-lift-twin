"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clock } from "../clock";
import type { StoryData } from "../data";
import { frame, updateFrame, type StoryTables } from "../frame";
import { cameraAt, DURATION, FPS } from "../script";
import { Diorama } from "./diorama";
import { RESERVOIR, WELL_XZ } from "./layout";
import { FieldStage } from "./field";
import { Surface } from "./surface";
import { Wellbore } from "./wellbore";

// The 3D world: a warm studio backdrop, a low desert sun, the cutaway well and
// the field. The driver turns story time into the frame state before any mesh
// reads it, and the camera follows the script.

const SKY = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.7, h)) : mix(uMid, uLow, smoothstep(0.0, 0.5, -h));
  gl_FragColor = vec4(c, 1.0);
}`;

function Backdrop() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color("#e9dcc8") },
          uMid: { value: new THREE.Color("#f6eee2") },
          uLow: { value: new THREE.Color("#e3d3bc") },
        },
      }),
    [],
  );
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[900, 32, 16]} />
    </mesh>
  );
}

function CameraRig() {
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const v = cameraAt(frame.t);
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...v.pos);
    target.set(...v.target);
    cam.lookAt(target);
    if (Math.abs(cam.fov - v.fov) > 1e-3) {
      cam.fov = v.fov;
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

function Driver({ data, tables, rec }: { data: StoryData; tables: StoryTables; rec: boolean }) {
  useFrame((_, delta) => {
    if (!rec && clock.playing) {
      const next = Math.min(DURATION, clock.t + Math.min(delta, 0.1));
      if (next >= DURATION) clock.playing = false;
      clock.set(next);
    }
    updateFrame(clock.t, data.well, tables);
  }, -1);
  return null;
}

function RecorderApi({ data, tables }: { data: StoryData; tables: StoryTables }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    const w = window as unknown as { __story?: unknown };
    w.__story = {
      ready: true,
      duration: DURATION,
      fps: FPS,
      async setTime(t: number) {
        clock.set(t);
        updateFrame(t, data.well, tables);
        await new Promise((r) => setTimeout(r, 0));
        advance(performance.now());
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      },
    };
  }, [advance, data, tables]);
  return null;
}

function WellLights() {
  const heatLight = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (heatLight.current) heatLight.current.intensity = 60 * frame.heat * frame.heat;
  });
  return (
    <>
      <pointLight ref={heatLight} position={[WELL_XZ[0] + 2.4, (RESERVOIR.top + RESERVOIR.bottom) / 2, WELL_XZ[1] + 2.4]} color="#ff8a3d" distance={16} decay={1.6} />
      <directionalLight position={[24, -8, 30]} intensity={0.45} color="#eef0f2" />
    </>
  );
}

export function World({ data, tables, rec }: { data: StoryData; tables: StoryTables; rec: boolean }) {
  const well = useRef<THREE.Group>(null);
  const field = useRef<THREE.Group>(null);
  useFrame(() => {
    if (well.current) well.current.visible = frame.stage === "well";
    if (field.current) field.current.visible = frame.stage === "field";
  });
  return (
    <>
      <Driver data={data} tables={tables} rec={rec} />
      {rec && <RecorderApi data={data} tables={tables} />}
      <CameraRig />
      <Backdrop />
      {/* Sky fill and reflections from a small studio sky, rendered once on the GPU, no files fetched. */}
      <Environment frames={1} resolution={256} environmentIntensity={0.55}>
        <color attach="background" args={["#efe2cf"]} />
        <Lightformer form="rect" intensity={2.2} color="#fff1dc" position={[0, 40, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[120, 120, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffd29a" position={[-60, 18, 30]} rotation={[0, Math.PI / 2.6, 0]} scale={[80, 30, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#c9a57c" position={[0, -30, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[120, 120, 1]} />
      </Environment>
      <hemisphereLight args={["#fff5e6", "#a57b52", 0.55]} />
      <ambientLight intensity={0.1} />

      <group ref={well}>
        <directionalLight
          position={[-26, 32, 20]}
          intensity={2.4}
          color="#ffe1b8"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-24}
          shadow-camera-right={24}
          shadow-camera-top={24}
          shadow-camera-bottom={-24}
          shadow-camera-near={1}
          shadow-camera-far={110}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        shadow-radius={4}
        />
        <WellLights />
        <Diorama />
        <Surface />
        <Wellbore />
      </group>
      <group ref={field} visible={false}>
        <FieldStage data={data} />
      </group>
    </>
  );
}
