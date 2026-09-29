// Prints a readable summary of the generated field, for checking the physics
// against the published anchors. Run with `pnpm tsx packages/simulate/src/inspect.ts`.
import { steamTonnesToCweBbl } from "@bgw/physics";
import { FieldModel, slotSteam_t } from "@bgw/optimise";
import { generateField } from "./generate";
import { analyseHero } from "./hero";

const dataset = generateField();
const field = new FieldModel(dataset);
const capacity = {
  units: dataset.assumptions.generatorUnits,
  unitCapacity_t_per_h: dataset.assumptions.generatorUnitCapacity_t_per_h,
};
const issued = field.evaluate(dataset.issuedPlan, capacity);

console.log("CSS wells, current cycle");
console.log("well     cyc  start  inj soak  steam_t  peak  leg  cycleOil  SOR  resteam  planned  late  today");
for (const well of field.producing.filter((w) => w.status === "css")) {
  const anchor = field.anchorCycle(well.id);
  const steam = slotSteam_t(anchor);
  const curve = field.model(well.id).cycleCurve({
    cycleNumber: anchor.cycleNumber,
    steam_t: steam,
    injectionTemperature_C: anchor.injectionTemperature_C,
    soak_d: anchor.soak_d,
  });
  const re = field.currentResteam(well.id);
  let peak = 0;
  for (let t = 0; t < 60; t++) peak = Math.max(peak, curve.oil(t));
  const cycleOil = curve.cumulativeOil(re.productionLeg_d - 1);
  const planned = dataset.issuedPlan.find((s) => s.wellId === well.id);
  const timeline = issued.timelines.find((t) => t.wellId === well.id)!;
  console.log(
    [
      well.id.padEnd(8),
      String(anchor.cycleNumber).padStart(3),
      String(anchor.steamStart_d).padStart(6),
      String(anchor.injection_d).padStart(4),
      String(anchor.soak_d).padStart(4),
      steam.toFixed(0).padStart(8),
      peak.toFixed(0).padStart(5),
      String(re.productionLeg_d).padStart(4),
      cycleOil.toFixed(0).padStart(9),
      (steamTonnesToCweBbl(steam) / cycleOil).toFixed(2).padStart(4),
      String(re.day_d).padStart(8),
      String(planned?.start_d ?? "-").padStart(8),
      String(planned ? planned.start_d - re.day_d : "-").padStart(5),
      timeline.oilToday_bbl_per_d.toFixed(1).padStart(6),
    ].join(" "),
  );
}

const t = issued.totals;
console.log("\nIssued plan totals");
console.log({
  slots: dataset.issuedPlan.length,
  fieldOil90_bbl: Math.round(t.fieldOil90_bbl),
  fieldRate_bbl_per_d: Math.round(t.fieldOil90_bbl / dataset.meta.horizon_d),
  cssOil90_bbl: Math.round(t.cssOil90_bbl),
  steam90_t: Math.round(t.steam90_t),
  sor90: t.sor90?.toFixed(2),
  peakLoad: t.peakLoad_t_per_h.toFixed(1),
  overloadDays: issued.overloadDays,
});
console.log(
  "load by day",
  issued.load.map((d) => d.total_t_per_h.toFixed(0)).join(" "),
);

const hero = analyseHero(dataset);
console.log("\nHero", JSON.stringify(hero.summary, null, 1));
