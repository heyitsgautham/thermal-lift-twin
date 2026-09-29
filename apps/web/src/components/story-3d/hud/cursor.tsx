"use client";

import { useLayoutEffect, useRef } from "react";
import { CURSOR, CURSOR_WINDOWS, smooth, windowAlpha, type CursorKey } from "../script";

// The drawn cursor. Headless Chrome paints no system cursor, so the take draws
// one and moves it between the controls the script names, pressing them on cue.

function pointOf(at: CursorKey["at"]): [number, number] {
  if (typeof at !== "string") return at;
  const el = document.querySelector(`[data-cursor="${at}"]`);
  if (!el) return [800, 450];
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/** The control the cursor is holding down at `t`, if any. */
export function pressedAt(t: number): string | null {
  let key: CursorKey | null = null;
  for (const k of CURSOR) if (k.t <= t) key = k;
  return key?.press && typeof key.at === "string" ? key.at : null;
}

export function Cursor({ t }: { t: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const alpha = Math.max(...CURSOR_WINDOWS.map(([a, b]) => windowAlpha(t, a, b, 0.3)));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || alpha <= 0.001) return;
    let i = CURSOR.findIndex((k) => k.t > t);
    if (i === -1) i = CURSOR.length;
    const prev = CURSOR[Math.max(0, i - 1)]!;
    const next = CURSOR[Math.min(CURSOR.length - 1, i)]!;
    const p0 = pointOf(prev.at);
    const p1 = pointOf(next.at);
    const span = next.t - prev.t;
    const k = span > 0 ? smooth((t - prev.t) / span) : 1;
    const x = p0[0] + (p1[0] - p0[0]) * k;
    const y = p0[1] + (p1[1] - p0[1]) * k;
    el.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
    // A ring spreads from the tip for 0.4 s after each press begins.
    const start = CURSOR.find((c, j) => c.press && c.t <= t && t - c.t < 0.4 && !(CURSOR[j - 1]?.press && CURSOR[j - 1]?.at === c.at));
    if (ring.current) {
      if (start) {
        const age = (t - start.t) / 0.4;
        const [rx, ry] = pointOf(start.at);
        ring.current.style.opacity = String(0.9 * (1 - age));
        ring.current.style.transform = `translate(${rx - 17}px, ${ry - 17}px) scale(${0.35 + 0.75 * age})`;
      } else ring.current.style.opacity = "0";
    }
  });

  if (alpha <= 0.001) return null;
  return (
    <>
      <div ref={ring} className="pointer-events-none absolute top-0 left-0 size-[34px] rounded-full border-[2.5px] border-heat" style={{ opacity: 0 }} />
      <div ref={ref} className="pointer-events-none absolute top-0 left-0" style={{ opacity: alpha, filter: "drop-shadow(0 2px 3px rgba(59,42,30,0.35))" }}>
        <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden>
          <path d="M4 2 L4 21 L9 16.5 L12.6 24.5 L15.8 23.1 L12.2 15.4 L19.5 15.4 Z" fill="#2a1d14" stroke="#fbf7f0" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
}
