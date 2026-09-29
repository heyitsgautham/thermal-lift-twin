import { cn } from "@/lib/utils";

/** A labelled instrument reading: small caps label, mono value, one line of context. */
export function Readout({
  label,
  value,
  unit,
  note,
  tone = "ink",
  size = "lg",
  testId,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: React.ReactNode;
  tone?: "ink" | "alert" | "produce" | "steam";
  size?: "lg" | "md";
  testId?: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 border-l border-rule-strong pl-4 first:border-l-0 first:pl-0 max-[1600px]:pl-3"
      data-testid={testId}
    >
      <span className="smallcaps whitespace-nowrap text-[9.5px] font-semibold text-ink-2">{label}</span>
      <span
        className={cn(
          "flex items-baseline gap-1 whitespace-nowrap",
          tone === "alert" && "text-alert",
          tone === "produce" && "text-produce",
          tone === "steam" && "text-steam",
          tone === "ink" && "text-ink",
        )}
      >
        <span
          className={cn(
            "font-mono font-medium leading-none tracking-[-0.03em]",
            size === "lg" ? "text-[24px] max-[1600px]:text-[21px]" : "text-[18px] max-[1600px]:text-[16px]",
          )}
        >
          {value}
        </span>
        {unit && <span className="font-mono text-[11px] text-ink-2">{unit}</span>}
      </span>
      {note && <span className="whitespace-nowrap text-[11px] leading-none text-ink-2">{note}</span>}
    </div>
  );
}
