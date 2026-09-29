import type { FailureType, FieldDataset } from "@bgw/optimise";
import { BRAND } from "@/lib/brand";

// What the twin is built from, for the "How we built it" scene. Field figures
// are dated to their source; OIL's page has since moved on (56 drilled and 34
// producing), so the April 2026 counts are never called current.

export interface Source {
  label: string;
  title: string;
  detail: string;
}

export const FIELD_SOURCES: Source[] = [
  {
    label: "Problem statement",
    title: [BRAND.ps, "Oil India Limited"].filter(Boolean).join(", "),
    detail: "17 to 19° API crude, reservoir at 46 to 48 °C",
  },
  {
    label: "OIL, Rajasthan fields page",
    title: "oil-india.com/rajasthan-fields",
    detail: "Jodhpur Sandstone at 1,150 m average depth, 10,000 to 13,000 cP at 50 °C, thermal wellheads, VIT tubing, SRP lift",
  },
  {
    label: "OIL figures, 5 Apr 2026",
    title: "Reported by Business Today",
    detail: "1,202 bbl/d, up from 705 a year before · 52 wells drilled, 33 operational · CSS in 19 wells · 200.26 km², discovered 1991",
  },
  {
    label: "Oil & Gas Journal, 4 Dec 2018",
    title: "India's first CSS",
    detail: "Cyclic steam on well BGW-8",
  },
];

export const MODEL_SOURCES: Source[] = [
  {
    label: "Boberg and Lantz, JPT 1966",
    title: "Calculation of the Production Rate of a Thermally Stimulated Well",
    detail: "How a steamed well cools",
  },
  {
    label: "ASTM D341",
    title: "Viscosity-temperature relation for petroleum liquids",
    detail: "How the crude thickens as it cools",
  },
  {
    label: "Gibbs, JPT 1963",
    title: "Predicting the Behavior of Sucker-Rod Pumping Systems",
    detail: "The wave equation for the rod string",
  },
  {
    label: "API RP 11L",
    title: "Design calculations for sucker-rod pumping systems",
    detail: "Pump displacement",
  },
];

/** The synthetic history the twin generated for itself, counted from the shipped dataset. */
export function historyFacts(dataset: FieldDataset) {
  const byType = (type: FailureType) => dataset.failures.filter((f) => f.type === type).length;
  return {
    dailyRecords: dataset.history.dailyRows,
    from: dataset.history.from,
    to: dataset.history.to,
    failures: dataset.history.failures,
    rodsParted: byType("rod parted"),
    pumpsUnseated: byType("pump unseated"),
    tubingLeaks: byType("tubing leak"),
  };
}
