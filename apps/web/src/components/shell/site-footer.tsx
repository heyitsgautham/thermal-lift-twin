import { eventLine } from "@/lib/brand";
export function SiteFooter() {
  return (
    <footer className="flex h-[26px] shrink-0 items-center justify-between border-t border-rule-strong px-5 max-[1600px]:px-4">
      <span className="smallcaps text-[9.5px] font-semibold text-ink-2" data-testid="footer-status">
        Target product · working prototype · synthetic data
      </span>
      <span className="font-mono text-[9.5px] text-ink-3">{eventLine}</span>
    </footer>
  );
}
