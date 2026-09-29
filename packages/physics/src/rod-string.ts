// Rod string and sucker-rod pump.
//
// Rod float: on the downstroke the rods fall through the crude in the tubing.
// Laminar Couette drag between rod and tubing wall resists that fall, so the
// rods have a terminal fall speed set by their buoyant weight and the crude's
// viscosity. If the pumping unit lowers the polished rod faster than that, the
// string goes slack at the top, and it slams when the unit catches up.
//
// Cards: the rod string is solved as Gibbs' 1-D damped wave equation with
// explicit finite differences. The surface end follows the polished-rod motion,
// the pump end carries the plunger load. The surface card is polished-rod load
// against position, the downhole card is plunger load against plunger position.

export const ROD_STRING = {
  pumpDepth_m: 1100,
  /** 7/8 in steel rods. */
  rodDiameter_m: 0.0222,
  /** 2 7/8 in tubing. */
  tubingInnerDiameter_m: 0.062,
  steelDensity_kg_per_m3: 7850,
  youngsModulus_Pa: 2.06e11,
  /** Net lift the plunger works against: pump depth less fluid submergence. */
  netLift_m: 900,
  /** Mechanical friction along the string, on top of fluid drag. */
  baseDamping_N_s_per_m2: 1.2,
  gravity_m_per_s2: 9.81,
  /** Slowest the unit runs, a stated assumption for the prototype. */
  minSpm: 3,
  maxSpm: 6,
} as const;

const IN_TO_M = 0.0254;

function rodArea_m2(): number {
  return (Math.PI * ROD_STRING.rodDiameter_m ** 2) / 4;
}

/** Laminar drag per metre of rod per unit velocity, N*s/m^2. */
export function couetteDrag_N_s_per_m2(viscosity_cP: number): number {
  const mu_Pa_s = viscosity_cP / 1000;
  return (2 * Math.PI * mu_Pa_s) / Math.log(ROD_STRING.tubingInnerDiameter_m / ROD_STRING.rodDiameter_m);
}

export function rodBuoyantWeight_N_per_m(fluidDensity_kg_per_m3: number): number {
  return (ROD_STRING.steelDensity_kg_per_m3 - fluidDensity_kg_per_m3) * ROD_STRING.gravity_m_per_s2 * rodArea_m2();
}

/** Speed at which buoyant weight equals Couette drag: the fastest the rods can fall. */
export function rodFallSpeed_m_per_s(viscosity_cP: number, fluidDensity_kg_per_m3: number): number {
  return rodBuoyantWeight_N_per_m(fluidDensity_kg_per_m3) / couetteDrag_N_s_per_m2(viscosity_cP);
}

/**
 * Peak polished-rod speed on the downstroke. The unit follows a half-cosine in
 * each half of the stroke, and a VFD can give the upstroke a smaller share of
 * the cycle time than the downstroke.
 */
export function peakDownstrokeSpeed_m_per_s(stroke_in: number, spm: number, upstrokeFraction: number): number {
  const period_s = 60 / spm;
  const down_s = (1 - upstrokeFraction) * period_s;
  return (Math.PI * stroke_in * IN_TO_M) / (2 * down_s);
}

/** Downstroke speed over rod fall speed. Above 1 the rods float. */
export function rodFloatRatio(
  viscosity_cP: number,
  fluidDensity_kg_per_m3: number,
  stroke_in: number,
  spm: number,
  upstrokeFraction = 0.5,
): number {
  return (
    peakDownstrokeSpeed_m_per_s(stroke_in, spm, upstrokeFraction) /
    rodFallSpeed_m_per_s(viscosity_cP, fluidDensity_kg_per_m3)
  );
}

/** Highest SPM that keeps the float ratio at or under `margin`. Not clamped. */
export function floatFreeSpm(
  viscosity_cP: number,
  fluidDensity_kg_per_m3: number,
  stroke_in: number,
  upstrokeFraction = 0.5,
  margin = 0.9,
): number {
  const v = margin * rodFallSpeed_m_per_s(viscosity_cP, fluidDensity_kg_per_m3);
  return (60 * 2 * (1 - upstrokeFraction) * v) / (Math.PI * stroke_in * IN_TO_M);
}

export function plungerArea_m2(plungerDiameter_in: number): number {
  return (Math.PI * (plungerDiameter_in * IN_TO_M) ** 2) / 4;
}

/** Fluid load on the plunger during the upstroke, N. */
export function fluidLoad_N(plungerDiameter_in: number, fluidDensity_kg_per_m3: number): number {
  return fluidDensity_kg_per_m3 * ROD_STRING.gravity_m_per_s2 * ROD_STRING.netLift_m * plungerArea_m2(plungerDiameter_in);
}

export interface StrokeInput {
  stroke_in: number;
  spm: number;
  upstrokeFraction: number;
  viscosity_cP: number;
  fluidDensity_kg_per_m3: number;
  plungerDiameter_in: number;
  /** Share of the pump barrel that fills with liquid each stroke, 0 to 1. */
  fillage_frac: number;
}

export interface CardPoint {
  t_s: number;
  position_m: number;
  load_kN: number;
}

export interface StrokeResult {
  surface: CardPoint[];
  downhole: CardPoint[];
  /** Polished-rod velocity over the stroke, positive up. */
  velocity_m_per_s: number[];
  peakLoad_kN: number;
  minLoad_kN: number;
  /** True when the computed polished-rod load drops below zero: the string goes slack. */
  floats: boolean;
  /** Share of the stroke with the string slack. */
  slackFraction: number;
  /** Polished-rod power from the surface card area. */
  polishedRodPower_kW: number;
  rodWeightInFluid_kN: number;
  fluidLoad_kN: number;
}

/** Polished-rod position over one cycle, 0 at the bottom of the stroke, metres. */
export function polishedRodPosition_m(stroke_m: number, upstrokeFraction: number, phase: number): number {
  const p = phase - Math.floor(phase);
  if (p < upstrokeFraction) return (stroke_m / 2) * (1 - Math.cos((Math.PI * p) / upstrokeFraction));
  return (stroke_m / 2) * (1 + Math.cos((Math.PI * (p - upstrokeFraction)) / (1 - upstrokeFraction)));
}

const SEGMENTS = 40;
const SAMPLES = 180;
const WARMUP_CYCLES = 3;

export function simulateStroke(input: StrokeInput): StrokeResult {
  const L = ROD_STRING.pumpDepth_m;
  const A = rodArea_m2();
  const E = ROD_STRING.youngsModulus_Pa;
  const rhoA = ROD_STRING.steelDensity_kg_per_m3 * A;
  const EA = E * A;
  const wave = Math.sqrt(E / ROD_STRING.steelDensity_kg_per_m3);
  const dx = L / SEGMENTS;
  const dt = (0.8 * dx) / wave;
  const damping = couetteDrag_N_s_per_m2(input.viscosity_cP) + ROD_STRING.baseDamping_N_s_per_m2;
  const r2 = ((wave * dt) / dx) ** 2;
  const k = (damping * dt) / rhoA;

  const stroke_m = input.stroke_in * IN_TO_M;
  const period_s = 60 / input.spm;
  const steps = Math.ceil(period_s / dt);
  const Fo = fluidLoad_N(input.plungerDiameter_in, input.fluidDensity_kg_per_m3);
  const Wrf = rodBuoyantWeight_N_per_m(input.fluidDensity_kg_per_m3) * L;

  let u = new Float64Array(SEGMENTS + 1);
  let uOld = new Float64Array(SEGMENTS + 1);
  let uNew = new Float64Array(SEGMENTS + 1);

  let pumpUp = true;
  let topPos = 0;
  let pumpForce = 0;
  const lag = Math.min(1, dt / 0.04);
  const smooth = Math.min(1, dt / 0.2);
  const eps = 0.02;
  let vPlunger = 0;
  let lastSwitch_s = -Infinity;

  const surface: CardPoint[] = [];
  const downhole: CardPoint[] = [];
  const velocity: number[] = [];
  let slackSteps = 0;
  let workJ = 0;
  let lastSurfaceLoad = 0;
  let lastPos = 0;
  let plungerMin = Infinity;
  let plungerMax = -Infinity;
  const sampleEvery = steps / SAMPLES;
  let nextSample = 0;

  const total = steps * WARMUP_CYCLES;
  for (let n = 0; n <= total; n++) {
    const t = n * dt;
    const recording = n >= steps * (WARMUP_CYCLES - 1);
    const pos = polishedRodPosition_m(stroke_m, input.upstrokeFraction, t / period_s);

    // Valve state follows a smoothed plunger velocity, with a dwell time, so
    // ringing at the free end of the string cannot chatter the valves.
    vPlunger += ((u[SEGMENTS]! - uOld[SEGMENTS]!) / dt - vPlunger) * smooth;
    const dwell = t - lastSwitch_s > 0.2 * period_s;
    if (pumpUp && dwell && vPlunger < -eps) {
      pumpUp = false;
      topPos = u[SEGMENTS]!;
      lastSwitch_s = t;
    } else if (!pumpUp && dwell && vPlunger > eps) {
      pumpUp = true;
      lastSwitch_s = t;
    }
    const plungerTravel = plungerMax - plungerMin;
    const unfilled = (1 - input.fillage_frac) * (Number.isFinite(plungerTravel) && plungerTravel > 0 ? plungerTravel : stroke_m);
    const target = pumpUp ? Fo : topPos - u[SEGMENTS]! < unfilled ? Fo : 0;
    pumpForce += (target - pumpForce) * lag;

    uNew[0] = pos;
    for (let i = 1; i < SEGMENTS; i++) {
      uNew[i] = 2 * u[i]! - uOld[i]! + r2 * (u[i + 1]! - 2 * u[i]! + u[i - 1]!) - k * (u[i]! - uOld[i]!);
    }
    const ghost = u[SEGMENTS - 1]! - (2 * dx * pumpForce) / EA;
    uNew[SEGMENTS] = 2 * u[SEGMENTS]! - uOld[SEGMENTS]! + r2 * (ghost - 2 * u[SEGMENTS]! + u[SEGMENTS - 1]!) - k * (u[SEGMENTS]! - uOld[SEGMENTS]!);

    const surfaceLoad = Wrf + (EA * (uNew[0]! - uNew[1]!)) / dx;
    if (recording) {
      if (surfaceLoad < 0) slackSteps++;
      workJ += 0.5 * (surfaceLoad + lastSurfaceLoad) * (pos - lastPos);
      plungerMin = Math.min(plungerMin, uNew[SEGMENTS]!);
      plungerMax = Math.max(plungerMax, uNew[SEGMENTS]!);
      const local = n - steps * (WARMUP_CYCLES - 1);
      if (local >= nextSample && surface.length < SAMPLES) {
        nextSample += sampleEvery;
        surface.push({ t_s: local * dt, position_m: pos, load_kN: surfaceLoad / 1000 });
        downhole.push({ t_s: local * dt, position_m: uNew[SEGMENTS]!, load_kN: pumpForce / 1000 });
        velocity.push((pos - lastPos) / dt);
      }
    } else if (n >= steps * (WARMUP_CYCLES - 2)) {
      plungerMin = Math.min(plungerMin, uNew[SEGMENTS]!);
      plungerMax = Math.max(plungerMax, uNew[SEGMENTS]!);
    }
    lastSurfaceLoad = surfaceLoad;
    lastPos = pos;

    const tmp = uOld;
    uOld = u;
    u = uNew;
    uNew = tmp;
  }

  const minPlunger = Math.min(...downhole.map((p) => p.position_m));
  for (const p of downhole) p.position_m -= minPlunger;
  const loads = surface.map((p) => p.load_kN);
  const minLoad = Math.min(...loads);
  return {
    surface,
    downhole,
    velocity_m_per_s: velocity,
    peakLoad_kN: Math.max(...loads),
    minLoad_kN: minLoad,
    floats: minLoad < 0,
    slackFraction: slackSteps / steps,
    polishedRodPower_kW: (workJ / period_s) / 1000,
    rodWeightInFluid_kN: Wrf / 1000,
    fluidLoad_kN: Fo / 1000,
  };
}

/**
 * Daily lift energy without running the wave equation, for screens that need it
 * every day of a cycle: useful hydraulic work plus rod drag, over the surface
 * drive efficiency.
 */
export const DRIVE_EFFICIENCY = 0.55;

export function liftEnergy_kWh_per_d(input: {
  liquid_bbl_per_d: number;
  fluidDensity_kg_per_m3: number;
  viscosity_cP: number;
  stroke_in: number;
  spm: number;
  runtime_frac: number;
}): number {
  const liquid_m3_per_s = (input.liquid_bbl_per_d / 6.289811) / 86400;
  const hydraulic_W = input.fluidDensity_kg_per_m3 * ROD_STRING.gravity_m_per_s2 * ROD_STRING.pumpDepth_m * liquid_m3_per_s;
  const stroke_m = input.stroke_in * IN_TO_M;
  const vRms = ((Math.PI * stroke_m * input.spm) / 60) / Math.SQRT2;
  const drag_W =
    (couetteDrag_N_s_per_m2(input.viscosity_cP) + ROD_STRING.baseDamping_N_s_per_m2) * ROD_STRING.pumpDepth_m * vRms ** 2;
  return ((hydraulic_W + drag_W * input.runtime_frac) / DRIVE_EFFICIENCY) * 24 / 1000;
}
