// Searches fixture seeds and story-well anchors for a field that tells the demo
// story on its own physics: BGW-14 due about two weeks before its planned slot,
// a move to its re-steam day overloading the generators for three days, and the
// repair picking one other well. Prints candidates; the chosen values go into
// fixture.ts by hand. Run with `pnpm tsx packages/simulate/src/tune.ts [mode]`.
import { FieldModel } from "@bgw/optimise";
import { FIXTURE, type FixtureConfig } from "./fixture";
import { generateField } from "./generate";
import { analyseHero, HERO_WELL } from "./hero";

function fieldStats(config: FixtureConfig) {
  const dataset = generateField(config);
  const field = new FieldModel(dataset);
  const capacity = {
    units: config.assumptions.generatorUnits,
    unitCapacity_t_per_h: config.assumptions.generatorUnitCapacity_t_per_h,
  };
  const ev = field.evaluate(dataset.issuedPlan, capacity);
  const lateness = field.producing
    .filter((w) => w.status === "css")
    .map((w) => {
      const slot = dataset.issuedPlan.find((s) => s.wellId === w.id);
      const re = field.currentResteam(w.id);
      return { wellId: w.id, late: slot ? slot.start_d - re.day_d : null };
    });
  return { dataset, field, ev, lateness };
}

const mode = process.argv[2] ?? "seeds";

if (mode === "seeds") {
  for (let seed = 1; seed <= 1200; seed++) {
    const config = { ...FIXTURE, seed };
    const { ev, lateness, dataset } = fieldStats(config);
    const others = lateness.filter((l) => l.wellId !== HERO_WELL && l.late !== null);
    const lateOthers = others.filter((l) => (l.late ?? 0) > 5).length;
    const hero = lateness.find((l) => l.wellId === HERO_WELL)!;
    const inProgressLoad = ev.load[0]!.total_t_per_h;
    const rate = ev.totals.fieldOil90_bbl / config.horizon_d;
    if (lateOthers <= 1 && rate > 1050 && rate < 1300 && ev.totals.peakLoad_t_per_h <= 24) {
      console.log(
        `seed ${seed} rate ${rate.toFixed(0)} sor ${ev.totals.sor90?.toFixed(2)} peak ${ev.totals.peakLoad_t_per_h.toFixed(1)} lateOthers ${lateOthers} hero ${hero.late} day0 ${inProgressLoad.toFixed(1)} slots ${dataset.issuedPlan.length}`,
      );
    }
  }
}

if (mode === "anchors") {
  const seeds = (process.argv[3] ?? String(FIXTURE.seed)).split(",").map(Number);
  const limit = Number(process.argv[4] ?? 8);
  for (const seed of seeds) {
    let found = 0;
    const drops: Record<string, number> = {};
    const drop = (k: string) => {
      drops[k] = (drops[k] ?? 0) + 1;
    };
    // The lateness of the story well depends on how short its injection was, not
    // on when it started, so pick that first with one probe per value.
    const lateness = (inj: number) => {
      const probe: FixtureConfig = {
        ...FIXTURE,
        seed,
        currentCycleOverrides: {
          ...FIXTURE.currentCycleOverrides,
          "BGW-14": { ...FIXTURE.currentCycleOverrides["BGW-14"]!, steamStart_d: -60, actualInjection_d: inj },
        },
      };
      const ds = generateField(probe);
      const f = new FieldModel(ds);
      const slot = ds.issuedPlan.find((x) => x.wellId === HERO_WELL);
      return slot ? slot.start_d - f.currentResteam(HERO_WELL).day_d : 99;
    };
    const injOptions = [9, 10, 11, 12, 13, 14].filter((inj) => Math.abs(lateness(inj) - 14) <= 2);
    search: for (const inj of injOptions) {
      for (let s14 = -80; s14 <= -20; s14++) {
        for (let s22 = -110; s22 <= -20; s22++) {
          const config: FixtureConfig = {
            ...FIXTURE,
            seed,
            currentCycleOverrides: {
              ...FIXTURE.currentCycleOverrides,
              "BGW-14": { ...FIXTURE.currentCycleOverrides["BGW-14"]!, steamStart_d: s14, actualInjection_d: inj },
              "BGW-22": { steamStart_d: s22 },
            },
          };
          const dataset = generateField(config);
          const field = new FieldModel(dataset);
          const capacity = {
            units: config.assumptions.generatorUnits,
            unitCapacity_t_per_h: config.assumptions.generatorUnitCapacity_t_per_h,
          };
          const slot = dataset.issuedPlan.find((x) => x.wellId === HERO_WELL);
          if (!slot || slot.start_d < 28 || slot.start_d > 60) {
            drop("slot window");
            continue;
          }
          const re = field.currentResteam(HERO_WELL);
          const delta = re.day_d - slot.start_d;
          if (delta > -12 || delta < -16) {
            drop(`delta ${delta}`.slice(0, 9));
            continue;
          }
          const issued = field.evaluate(dataset.issuedPlan, capacity);
          if (issued.overloadDays.length > 0) {
            drop("issued overload");
            continue;
          }
          const bounds = field.slotBounds(dataset.issuedPlan, slot.id);
          if (re.day_d < bounds.min_d) {
            drop("bounds");
            continue;
          }
          const edited = field.evaluate(
            dataset.issuedPlan.map((x) => (x.id === slot.id ? { ...x, start_d: re.day_d } : x)),
            capacity,
          );
          if (edited.overloadDays.length !== 3) {
            drop(`over ${Math.min(edited.overloadDays.length, 6)}`);
            continue;
          }
          const segWells = new Set(edited.load[edited.overloadDays[0]!]!.segments.map((g) => g.wellId));
          if (!segWells.has("BGW-22")) {
            drop("22 not in overload");
            continue;
          }
          const hero = analyseHero(dataset).summary;
          const m = hero.moves;
          if (m.length !== 1 || m[0]!.wellId !== "BGW-22" || m[0]!.delta_d <= 0 || m[0]!.delta_d > 6) {
            drop(`move ${m.map((x) => x.wellId + ":" + x.delta_d).join(",")}`.slice(0, 22));
            continue;
          }
          if (!(hero.proposalOil90_bbl > hero.issuedOil90_bbl)) {
            drop("no oil gain");
            continue;
          }
          found++;
          console.log(
            `seed ${seed} inj ${inj} s14 ${s14} s22 ${s22} planned ${hero.plannedStart_d} delta ${hero.delta_d} over ${hero.overloadDays.join(",")} peak ${hero.peakEdited_t_per_h.toFixed(1)} move ${m[0]!.delta_d} value ${m[0]!.valueChange_bbl} oil ${m[0]!.oilChange_bbl} field ${hero.issuedOil90_bbl}->${hero.proposalOil90_bbl} sor ${hero.issuedSor90?.toFixed(2)}->${hero.proposalSor90?.toFixed(2)}`,
          );
          if (found >= limit) break search;
        }
      }
    }
    console.log(`seed ${seed} found ${found}`, JSON.stringify(drops));
  }
}
