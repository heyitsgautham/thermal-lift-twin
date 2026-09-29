"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Hides labels that would touch another label. Every element under `root`
 * with a `data-label` attribute takes part. Lower `data-label` numbers win,
 * then earlier elements. Hidden labels keep their layout box, so nothing moves.
 */
export function useNoOverlap(root: RefObject<HTMLElement | null>, deps: unknown[], gap_px = 4) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const run = () => {
      const labels = [...el.querySelectorAll<HTMLElement>("[data-label]")];
      for (const l of labels) l.style.visibility = "";
      const ranked = labels
        .map((node, i) => ({ node, i, p: Number(node.dataset.label), r: node.getBoundingClientRect() }))
        .sort((a, b) => a.p - b.p || a.i - b.i);
      const kept: DOMRect[] = [];
      for (const { node, r } of ranked) {
        const hit = kept.some(
          (k) => r.left < k.right + gap_px && r.right + gap_px > k.left && r.top < k.bottom && r.bottom > k.top,
        );
        if (hit) node.style.visibility = "hidden";
        else kept.push(r);
      }
    };
    run();
    // Fonts can land after first paint and change widths.
    void document.fonts?.ready.then(run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
