"use client";

import { useEffect, useRef, useState } from "react";

/** Eases a displayed number toward its target, so changed readouts count rather than jump. */
export function useTween(target: number, duration_ms = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);

  useEffect(() => {
    from.current = current.current;
    if (from.current === target) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration_ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from.current + (target - from.current) * eased;
      current.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration_ms]);

  return value;
}
