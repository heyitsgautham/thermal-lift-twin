import { cn } from "@/lib/utils";

/** A drawing sheet: hairline border, paper surface, small caps title strip. */
export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
  testId,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[3px] border border-rule-strong bg-sheet shadow-[0_1px_0_rgb(59_42_30/0.06),0_12px_30px_-24px_rgb(59_42_30/0.5)]",
        className,
      )}
      data-testid={testId}
    >
      {title && (
        <header className="flex shrink-0 items-baseline justify-between gap-3 border-b border-rule px-3.5 pt-2.5 pb-2">
          <h2 className="smallcaps whitespace-nowrap text-[10px] font-bold text-ink">{title}</h2>
          {aside && <div className="min-w-0 truncate text-right font-mono text-[9.5px] text-ink-3">{aside}</div>}
        </header>
      )}
      <div className={cn("relative min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Title row shared by every screen: heading and one line of context on the left, readouts on the right. */
export function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-end justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[28px] leading-none font-bold tracking-[-0.01em] stretch-semi text-ink max-[1600px]:text-[24px]">
          {title}
        </h1>
        <p className="text-[12.5px] text-ink-2 max-[1600px]:text-[11.5px]">{subtitle}</p>
      </div>
      {children && <div className="grid shrink-0 auto-cols-max grid-flow-col gap-x-5 max-[1600px]:gap-x-3.5">{children}</div>}
    </header>
  );
}

export function Chip({
  tone = "ink",
  children,
  className,
}: {
  tone?: "ink" | "alert" | "produce" | "shift" | "steam" | "soak" | "down";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] px-1.5 py-[2px] smallcaps text-[8.5px] font-bold leading-none",
        tone === "ink" && "bg-ink/8 text-ink",
        tone === "alert" && "bg-alert/12 text-alert",
        tone === "produce" && "bg-produce/12 text-produce",
        tone === "shift" && "bg-shift/22 text-ink",
        tone === "steam" && "bg-steam/12 text-steam",
        tone === "soak" && "bg-soak/18 text-ink",
        tone === "down" && "bg-down/25 text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}
