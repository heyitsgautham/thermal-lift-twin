// Unit constants. Every quantity in this repo carries its unit in its name,
// for example `rate_t_per_h` or `oil_bbl_per_d`, and converts only through here.

export const BBL_PER_M3 = 6.289811;
export const HOURS_PER_DAY = 24;
export const KELVIN_OFFSET = 273.15;

/** One tonne of steam is one cubic metre of cold water equivalent (CWE). */
export function steamTonnesToCweBbl(steam_t: number): number {
  return steam_t * BBL_PER_M3;
}

export function celsiusToKelvin(t_C: number): number {
  return t_C + KELVIN_OFFSET;
}

/** Specific gravity at 60 °F from API gravity. */
export function apiToSpecificGravity(api_deg: number): number {
  return 141.5 / (131.5 + api_deg);
}
