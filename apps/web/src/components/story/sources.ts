import { BRAND } from "@/lib/brand";
// What the story's "How we built it" screen cites. Field facts are dated as
// the source reported them; OIL's field page has since moved on, so the well
// counts are "April 2026", never "current". Edit this file, not the screen.

export interface Source {
  kind: string;
  title: string;
  facts: string[];
  cite: string;
}

export const SOURCES: Source[] = [
  {
    kind: "Problem statement",
    title: [BRAND.ps, "Oil India Limited"].filter(Boolean).join(", "),
    facts: ["Heavy crude, 17 to 19° API", "Reservoir at 46 to 48 °C"],
    cite: BRAND.event || "Oil India Limited",
  },
  {
    kind: "Field",
    title: "OIL, Rajasthan fields",
    facts: ["Jodhpur Sandstone, average depth 1,150 m", "10,000 to 13,000 cP at 50 °C", "Thermal wellheads and VIT, SRP lift"],
    cite: "oil-india.com/rajasthan-fields",
  },
  {
    kind: "Field, April 2026",
    title: "OIL figures, April 2026",
    facts: ["1,202 bbl/d, up from 705 a year before", "52 wells drilled, 33 operational", "CSS in 19 wells during the year", "Discovered 1991, 200.26 km²"],
    cite: "Business Today, 5 Apr 2026",
  },
  {
    kind: "Field history",
    title: "India's first CSS",
    facts: ["Cyclic steam on well BGW-8", `Where ${BRAND.field ? `${BRAND.field}'s` : "the field's"} steam began`],
    cite: "Oil & Gas Journal, 4 Dec 2018",
  },
  {
    kind: "Heat",
    title: "How a steamed well cools",
    facts: ["Heated zone cools back to the reservoir", "Sets the oil rate day by day"],
    cite: "Boberg and Lantz, JPT 1966",
  },
  {
    kind: "Crude",
    title: "How the oil thickens",
    facts: ["Viscosity against temperature", "Pinned at 50 °C to OIL's range"],
    cite: "ASTM D341",
  },
  {
    kind: "Rods",
    title: "The rod string as a wave",
    facts: ["1,100 m of rods, solved each stroke", "Surface and downhole cards"],
    cite: "Gibbs, JPT 1963",
  },
  {
    kind: "Pump",
    title: "Sucker-rod pump design",
    facts: ["Displacement from stroke, speed, plunger", "Loads on the polished rod"],
    cite: "API RP 11L",
  },
];
