"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { longDate } from "@/lib/dates";
import { dataset } from "@/lib/dataset";
import { cn } from "@/lib/utils";
import { BRAND, orgLine } from "@/lib/brand";

/** Screens in the order the storyboard walks them. */
export const SCREENS = [
  { href: "/calendar", code: "01", label: "Steam calendar" },
  { href: "/cycle-plan", code: "02", label: "Cycle plan" },
  { href: "/pump", code: "03", label: "Pump twin" },
  { href: "/reliability", code: "04", label: "Reliability" },
  { href: "/map", code: "05", label: "Field map" },
  { href: "/what-if", code: "06", label: "What-if lab" },
  { href: "/model", code: "07", label: "Model" },
] as const;

export function PumpjackMark({ size = 1 }: { size?: number }) {
  return (
    <svg width={30 * size} height={22 * size} viewBox="0 0 30 22" aria-hidden className="shrink-0 text-ink">
      <path d="M2 21 H28" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 21 L15 8 L19 21" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      <path d="M4 6.5 L26 9.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M26 9.5 C28.5 10 28.5 13 26.5 14" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M26.5 14 V21" stroke="currentColor" strokeWidth="1" />
      <circle cx="15" cy="8" r="1.6" fill="var(--steam)" />
      <path
        d="M5 11 C3.5 9 6 7.5 4.5 5.5 M8 12 C6.5 10 9 8.5 7.5 6.5"
        stroke="var(--steam)"
        strokeWidth="1.2"
        fill="none"
        opacity="0.8"
      />
    </svg>
  );
}

export function AppHeader() {
  const path = usePathname();
  const cells: [string, string][] = [
    ["Field", `${BRAND.field || "Heavy oil"}, Rajasthan`],
    ["As of", longDate(dataset.meta.asOf, 0)],
    ["Data", `Synthetic, seed ${dataset.meta.seed}`],
  ];
  return (
    <header className="flex h-[52px] shrink-0 items-stretch justify-between gap-4 border-b border-rule-strong px-5 max-[1600px]:px-4">
      <Link href="/calendar" className="flex items-center gap-3" aria-label={`${BRAND.product}, steam calendar`}>
        <PumpjackMark />
        <div className="flex flex-col leading-none">
          <span className="smallcaps whitespace-nowrap text-[13px] font-extrabold stretch-wide text-ink">{BRAND.product}</span>
          <span className="mt-1 whitespace-nowrap text-[11px] text-ink-2 max-[1600px]:hidden">
            CSS and SRP twin · {orgLine()}
          </span>
          <span className="mt-1 hidden whitespace-nowrap text-[11px] text-ink-2 max-[1600px]:block">{orgLine("Oil India")}</span>
        </div>
      </Link>
      <nav className="flex items-stretch" aria-label="Screens" data-testid="screen-nav">
        {SCREENS.map((s) => {
          const active = path?.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              data-testid={`nav-${s.href.slice(1)}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-1.5 px-3 text-[12.5px] whitespace-nowrap stretch-semi transition-colors max-[1600px]:px-2 max-[1600px]:text-[12px]",
                active ? "font-bold text-ink" : "font-medium text-ink-2 hover:text-ink",
              )}
            >
              <span className={cn("font-mono text-[9px]", active ? "text-steam" : "text-ink-3")}>{s.code}</span>
              {s.label}
              <span
                className={cn(
                  "absolute inset-x-2 bottom-[-1px] h-[2.5px] rounded-t-[1px] transition-colors",
                  active ? "bg-ink" : "bg-transparent group-hover:bg-ink/20",
                )}
              />
            </Link>
          );
        })}
      </nav>
      <dl className="flex items-stretch self-center border border-rule-strong">
        {cells.map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              "flex flex-col justify-center border-l border-rule-strong px-3 py-1 first:border-l-0",
              i === 0 && "max-[1600px]:hidden",
            )}
          >
            <dt className="smallcaps text-[8px] font-semibold text-ink-3">{k}</dt>
            <dd className="text-[11.5px] leading-tight font-medium whitespace-nowrap text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
