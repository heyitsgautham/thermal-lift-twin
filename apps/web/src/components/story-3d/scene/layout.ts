// Where things stand in the 3D world, shared by the meshes and the HUD labels
// pinned to them. The well stage is a cutaway block with the surface at full
// scale and depth compressed to 30 m a unit; the field stage is 26 units a km.

export type P3 = [number, number, number];

export const HALF = 16;
export const M_PER_UNIT = 30;
export const depthY = (m: number) => -m / M_PER_UNIT;
/** The well stands just inside the cut corner. */
export const WELL_XZ: [number, number] = [0.62, 0.62];
export const RESERVOIR = { top: depthY(1104), bottom: depthY(1212) };
export const PUMP_Y = depthY(1100);
/** Top of the concrete well pad. */
export const PAD = 0.08;

export const GENERATOR_AT: P3 = [7.6, 0, -7.2];
export const STACK_TOP: P3 = [GENERATOR_AT[0] + 1.95, 5.7, GENERATOR_AT[2]];

const K = 26;
const ORIGIN: [number, number] = [7.4, 5.6];
export const fieldXZ = (x_km: number, y_km: number): [number, number] => [(x_km - ORIGIN[0]) * K, -(y_km - ORIGIN[1]) * K];
export const STATION = fieldXZ(7.0, 5.1);
