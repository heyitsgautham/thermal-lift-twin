import { apiToSpecificGravity, celsiusToKelvin } from "./units";

// ASTM D341 (Walther) viscosity-temperature relation for dead crude:
//   log10(log10(nu_cSt + 0.7)) = A - B * log10(T_K)
// fitted through two anchor points given as dynamic viscosity.
// Density is held at its 60 °F value, a stated simplification.

export interface ViscosityAnchor {
  temperature_C: number;
  viscosity_cP: number;
}

export interface WaltherCurve {
  A: number;
  B: number;
  specificGravity: number;
}

const WALTHER_OFFSET_cSt = 0.7;

function waltherZ(nu_cSt: number): number {
  return Math.log10(Math.log10(nu_cSt + WALTHER_OFFSET_cSt));
}

export function fitWalther(
  low: ViscosityAnchor,
  high: ViscosityAnchor,
  api_deg: number,
): WaltherCurve {
  const specificGravity = apiToSpecificGravity(api_deg);
  const z1 = waltherZ(low.viscosity_cP / specificGravity);
  const z2 = waltherZ(high.viscosity_cP / specificGravity);
  const x1 = Math.log10(celsiusToKelvin(low.temperature_C));
  const x2 = Math.log10(celsiusToKelvin(high.temperature_C));
  const B = (z1 - z2) / (x2 - x1);
  const A = z1 + B * x1;
  return { A, B, specificGravity };
}

export function viscosity_cP(curve: WaltherCurve, temperature_C: number): number {
  const z = curve.A - curve.B * Math.log10(celsiusToKelvin(temperature_C));
  const nu_cSt = Math.pow(10, Math.pow(10, z)) - WALTHER_OFFSET_cSt;
  return nu_cSt * curve.specificGravity;
}
