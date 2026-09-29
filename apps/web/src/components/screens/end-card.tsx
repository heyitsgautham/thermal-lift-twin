import { PumpjackMark } from "@/components/shell/app-header";
import { dataset } from "@/lib/dataset";
import { BRAND, orgLine } from "@/lib/brand";

// Closing card for the video: product, problem statement, team, and what the data is.

export function EndCard() {
  const { assumptions } = dataset;
  return (
    <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" data-testid="end-card">
      <div className="pointer-events-none absolute inset-10 rounded-[3px] border border-rule-strong" />
      <div className="pointer-events-none absolute inset-12 border border-rule" />
      <div className="rise-in flex w-[940px] max-w-[86vw] flex-col gap-10">
        <div className="flex items-center gap-6">
          <PumpjackMark size={2.8} />
          <div className="flex flex-col gap-2">
            <span className="smallcaps text-[15px] font-bold text-steam">{orgLine()}</span>
            <h1 className="text-[80px] leading-[0.95] font-extrabold tracking-[-0.02em] stretch-semi text-ink max-[1700px]:text-[66px]">
              {BRAND.product}
            </h1>
          </div>
        </div>
        <p className="max-w-[820px] text-[27px] leading-[1.3] text-ink max-[1700px]:text-[23px]">
          Steam the right well on the right day, and run its pump to the cooling curve.
        </p>
        <div className="flex items-end justify-between gap-8 border-t border-rule-strong pt-6">
          <div className="flex flex-col gap-2">
            <span className="smallcaps text-[14px] font-bold text-ink">Working prototype on synthetic data</span>
            <span className="max-w-[560px] text-[15px] leading-snug text-ink-2">
              Built from {BRAND.field ? `${BRAND.field}'s` : "OIL's"} published field numbers. Generator capacity, {assumptions.generatorUnits} ×{" "}
              {assumptions.generatorUnitCapacity_t_per_h.toFixed(1)} t/h, is an assumption.
            </span>
          </div>
          <span className="text-right text-[20px] leading-tight font-semibold stretch-semi text-ink">
            Team 2
            <br />
            <span className="text-[16px] font-medium text-ink-2">Saveetha Engineering College</span>
          </span>
        </div>
      </div>
    </main>
  );
}
