import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDataset, DatasetError, type FieldDataset } from "../src";

const shipped = JSON.parse(readFileSync(new URL("../../../data/demo/field.json", import.meta.url), "utf8")) as FieldDataset;

/** A copy of the shipped dataset with one thing broken. */
function broken(edit: (d: FieldDataset) => void): FieldDataset {
  const d = structuredClone(shipped);
  edit(d);
  return d;
}

function problemsOf(raw: unknown): string[] {
  try {
    checkDataset(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(DatasetError);
    return (e as DatasetError).problems;
  }
  throw new Error("checkDataset accepted a broken dataset");
}

describe("checkDataset", () => {
  it("accepts the dataset the app ships and returns it unchanged", () => {
    expect(checkDataset(shipped)).toBe(shipped);
  });

  it("rejects something that is not an object", () => {
    expect(problemsOf(null)).toEqual(["not a JSON object"]);
    expect(problemsOf([shipped])).toEqual(["not a JSON object"]);
  });

  it("names every missing section at once", () => {
    const d = broken((x) => {
      delete (x as Partial<FieldDataset>).meta;
      (x as unknown as Record<string, unknown>).wells = {};
    });
    expect(problemsOf(d)).toEqual(["meta is missing", "wells is not a list"]);
  });

  it("checks the meta block", () => {
    const d = broken((x) => {
      x.meta.seed = 1.5;
      x.meta.asOf = "28 Sep 2026";
      x.meta.horizon_d = 0;
      x.meta.generatorVersion = "";
    });
    expect(problemsOf(d)).toEqual([
      "meta.seed is not an integer",
      'meta.asOf "28 Sep 2026" is not a YYYY-MM-DD date',
      "meta.horizon_d is not a positive whole number of days",
      "meta.generatorVersion is missing",
    ]);
  });

  it("rejects an impossible calendar date", () => {
    expect(problemsOf(broken((x) => (x.meta.asOf = "2026-13-40")))).toEqual(['meta.asOf "2026-13-40" is not a YYYY-MM-DD date']);
  });

  it("catches a duplicated well, which also breaks the field counts", () => {
    const problems = problemsOf(broken((x) => x.wells.push(x.wells[0]!)));
    expect(problems).toContain(`well ${shipped.wells[0]!.id} appears twice`);
    expect(problems).toContain(`field.wellsDrilled is ${shipped.wells.length} but ${shipped.wells.length + 1} wells are listed`);
  });

  it("catches a steam well without its cyclic-steam properties", () => {
    const d = broken((x) => delete x.wells.find((w) => w.id === "BGW-14")!.css);
    expect(problemsOf(d)).toEqual(["well BGW-14 is on cyclic steam but has no css block"]);
  });

  it("catches a well whose status changed without the field counts", () => {
    const d = broken((x) => {
      const w = x.wells.find((w) => w.id === "BGW-14")!;
      w.status = "observation";
    });
    const problems = problemsOf(d);
    expect(problems).toContain(`field.wellsOnCss is ${shipped.field.wellsOnCss} but ${shipped.field.wellsOnCss - 1} wells are on cyclic steam`);
    expect(problems.some((p) => p.includes("which is not a cyclic-steam well"))).toBe(true);
  });

  it("names a well entry that has no id", () => {
    const d = broken((x) => delete (x.wells[3] as Partial<FieldDataset["wells"][number]>).id);
    expect(problemsOf(d)).toContain("wells[3] has no id");
  });

  it("catches a cold well without its cold-production properties", () => {
    const cold = shipped.wells.find((w) => w.status === "cold")!.id;
    const d = broken((x) => delete x.wells.find((w) => w.id === cold)!.cold);
    expect(problemsOf(d)).toEqual([`well ${cold} is cold but has no cold block`]);
  });

  it("catches an unknown status", () => {
    const d = broken((x) => ((x.wells[0] as { status: string }).status = "drilling"));
    expect(problemsOf(d)).toContain(`well ${shipped.wells[0]!.id} has unknown status "drilling"`);
  });

  it("catches a plan slot issued twice or on a well that is not on steam", () => {
    const cold = shipped.wells.find((w) => w.status === "cold")!.id;
    const d = broken((x) => {
      x.issuedPlan.push({ ...x.issuedPlan[0]! });
      x.issuedPlan[1] = { ...x.issuedPlan[1]!, wellId: cold };
    });
    const problems = problemsOf(d);
    expect(problems).toContain(`slot ${shipped.issuedPlan[0]!.id} is issued twice`);
    expect(problems).toContain(`slot ${shipped.issuedPlan[1]!.id} is for ${cold}, which is not a cyclic-steam well`);
  });

  it("catches a cycle that names a well the field does not have", () => {
    const d = broken((x) => (x.cycles[0] = { ...x.cycles[0]!, wellId: "BGW-99" }));
    expect(problemsOf(d)).toEqual([`cycle ${shipped.cycles[0]!.cycleNumber} names unknown well BGW-99`]);
  });

  it("summarises a long list in the error message", () => {
    const d = broken((x) => x.wells.forEach((w) => ((w as { status: string }).status = "drilling")));
    const err = (() => {
      try {
        checkDataset(d);
      } catch (e) {
        return e as DatasetError;
      }
    })()!;
    expect(err.problems.length).toBeGreaterThan(5);
    expect(err.message).toMatch(/and \d+ more$/);
  });
});
