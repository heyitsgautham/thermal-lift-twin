"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** A two-to-four way switch in the sheet style, built on the shadcn toggle group. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  testId,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
  label: string;
  testId?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      spacing={0}
      className="rounded-[3px] border border-rule-strong bg-sand/60 p-[2px]"
      data-testid={testId}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          className="h-7 rounded-[2px]! border-0 px-2.5 text-[11.5px] font-semibold stretch-semi text-ink-2 hover:bg-ink/5 hover:text-ink data-[state=on]:bg-ink data-[state=on]:text-sheet"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
