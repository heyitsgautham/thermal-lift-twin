"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

// Calendar geometry. Day columns get a whole number of pixels so every grid
// line, block edge and lane bar lands on the same crisp pixel boundary.

export interface Geometry {
  width: number;
  height: number;
  horizon_d: number;
  padX: number;
  labelW: number;
  oilW: number;
  dayPx: number;
  gridW: number;
  /** Left edge of day 0. */
  x0: number;
  laneTop: number;
  laneH: number;
  axisTop: number;
  axisH: number;
  rowsTop: number;
  cssRowH: number;
  dividerH: number;
  coldRowH: number;
  /** Top of the cold-production block, below the divider. */
  coldTop: number;
  bottom: number;
  compact: boolean;
}

export function computeGeometry(
  width: number,
  height: number,
  horizon_d: number,
  cssCount: number,
  coldCount: number,
): Geometry {
  const compact = width < 1300;
  const padX = compact ? 10 : 14;
  const labelW = compact ? 150 : 164;
  const oilW = compact ? 62 : 80;
  const dayPx = Math.max(6, Math.floor((width - 2 * padX - labelW - oilW) / horizon_d));
  const gridW = dayPx * horizon_d;
  const spare = width - 2 * padX - labelW - oilW - gridW;
  const x0 = padX + labelW + Math.floor(spare / 2);

  const laneTop = 10;
  const laneH = Math.round(Math.min(124, Math.max(86, height * 0.135)));
  const axisTop = laneTop + laneH + 6;
  const axisH = 30;
  const rowsTop = axisTop + axisH;
  const dividerH = compact ? 20 : 22;
  const bottomPad = 8;
  const rowsH = height - rowsTop - dividerH - bottomPad;
  const weight = 2.0;
  const unit = rowsH / (cssCount * weight + coldCount);
  const cssRowH = Math.max(16, Math.floor(unit * weight));
  const coldRowH = Math.max(7, Math.floor((rowsH - cssRowH * cssCount) / coldCount));
  const coldTop = rowsTop + cssRowH * cssCount + dividerH;
  return {
    width,
    height,
    horizon_d,
    padX,
    labelW,
    oilW,
    dayPx,
    gridW,
    x0,
    laneTop,
    laneH,
    axisTop,
    axisH,
    rowsTop,
    cssRowH,
    dividerH,
    coldRowH,
    coldTop,
    bottom: coldTop + coldRowH * coldCount,
    compact,
  };
}

export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        prev && prev.width === Math.floor(r.width) && prev.height === Math.floor(r.height)
          ? prev
          : { width: Math.floor(r.width), height: Math.floor(r.height) },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
