"use client";

import { ChevronDown } from "lucide-react";

export function WellPicker({
  value,
  wells,
  onChange,
  testId,
}: {
  value: string;
  wells: { id: string; note?: string }[];
  onChange(wellId: string): void;
  testId?: string;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Well</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="h-8 appearance-none rounded-[3px] border border-rule-strong bg-sheet pr-7 pl-2.5 text-[13px] font-semibold stretch-semi text-ink outline-none focus-visible:ring-2 focus-visible:ring-heat"
      >
        {wells.map((w) => (
          <option key={w.id} value={w.id}>
            {w.note ? `${w.id} · ${w.note}` : w.id}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-ink-2" />
    </label>
  );
}
