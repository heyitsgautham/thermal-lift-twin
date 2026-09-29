"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Small SVG chart kit in the sheet style. Charts measure their box so text is
// never scaled, draw hairline grids and mono tick labels, and leave the series
// to the caller.

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  ticks(count?: number): number[];
  invert(px: number): number;
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm >= 7 ? 10 : norm >= 3 ? 5 : norm >= 1.5 ? 2 : 1;
  return step * mag;
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0 || 1);
  const s = ((v: number) => r0 + (v - d0) * k) as Scale;
  s.domain = domain;
  s.range = range;
  s.invert = (px) => d0 + (px - r0) / k;
  s.ticks = (count = 5) => {
    const lo = Math.min(d0, d1);
    const hi = Math.max(d0, d1);
    const step = niceStep(hi - lo, count);
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Number(v.toFixed(10)));
    return out;
  };
  return s;
}

export function logScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain.map(Math.log10) as [number, number];
  const lin = linearScale([d0, d1], range);
  const s = ((v: number) => lin(Math.log10(Math.max(v, 1e-9)))) as Scale;
  s.domain = domain;
  s.range = range;
  s.invert = (px) => Math.pow(10, lin.invert(px));
  s.ticks = () => {
    const out: number[] = [];
    for (let e = Math.floor(d0); e <= Math.ceil(d1); e++) {
      for (const m of [1, 3]) {
        const v = m * Math.pow(10, e);
        if (v >= domain[0] * 0.999 && v <= domain[1] * 1.001) out.push(v);
      }
    }
    return out;
  };
  return s;
}

export function useBoxSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((p) =>
        p.width === Math.floor(r.width) && p.height === Math.floor(r.height)
          ? p
          : { width: Math.floor(r.width), height: Math.floor(r.height) },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartBox {
  width: number;
  height: number;
  inner: { x0: number; x1: number; y0: number; y1: number };
}

/** Fills its parent, measures it, and renders an SVG sized in real pixels. */
export function ChartFrame({
  margin,
  children,
  className,
  testId,
  label,
}: {
  margin: Margin;
  children(box: ChartBox): React.ReactNode;
  className?: string;
  testId?: string;
  label: string;
}) {
  const [ref, size] = useBoxSize<HTMLDivElement>();
  const box: ChartBox = {
    width: size.width,
    height: size.height,
    inner: { x0: margin.left, x1: size.width - margin.right, y0: margin.top, y1: size.height - margin.bottom },
  };
  return (
    <div ref={ref} className={className ?? "absolute inset-0"} data-testid={testId}>
      {size.width > 0 && size.height > 0 && (
        <svg width={size.width} height={size.height} className="block overflow-visible" role="img" aria-label={label}>
          {children(box)}
        </svg>
      )}
    </div>
  );
}

export function GridY({ scale, x0, x1, ticks }: { scale: Scale; x0: number; x1: number; ticks: number[] }) {
  return (
    <g>
      {ticks.map((t) => (
        <line key={t} x1={x0} x2={x1} y1={Math.round(scale(t)) + 0.5} y2={Math.round(scale(t)) + 0.5} stroke="var(--ink)" strokeOpacity={0.08} />
      ))}
    </g>
  );
}

export function AxisY({
  scale,
  x,
  ticks,
  format,
  side = "left",
  label,
  color = "var(--ink-3)",
}: {
  scale: Scale;
  x: number;
  ticks: number[];
  format(v: number): string;
  side?: "left" | "right";
  label?: string;
  color?: string;
}) {
  const [top, bottom] = [Math.min(...scale.range), Math.max(...scale.range)];
  return (
    <g>
      {ticks.map((t) => (
        <text
          key={t}
          x={side === "left" ? x - 6 : x + 6}
          y={scale(t) + 3.5}
          textAnchor={side === "left" ? "end" : "start"}
          fontSize={9.5}
          fill={color}
          className="font-mono"
        >
          {format(t)}
        </text>
      ))}
      {label && (
        <text
          x={side === "left" ? x + 5 : x - 5}
          y={top - 6}
          textAnchor={side === "left" ? "start" : "end"}
          fontSize={9}
          fill={color}
          className="smallcaps"
          style={{ fontWeight: 600 }}
        >
          {label}
        </text>
      )}
      <line x1={x + 0.5} x2={x + 0.5} y1={top} y2={bottom} stroke="var(--ink)" strokeOpacity={0.25} />
    </g>
  );
}

export function AxisX({
  scale,
  y,
  ticks,
  format,
  label,
}: {
  scale: Scale;
  y: number;
  ticks: number[];
  format(v: number): string;
  label?: string;
}) {
  const [x0, x1] = [Math.min(...scale.range), Math.max(...scale.range)];
  return (
    <g>
      <line x1={x0} x2={x1} y1={y + 0.5} y2={y + 0.5} stroke="var(--ink)" strokeOpacity={0.35} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={Math.round(scale(t)) + 0.5} x2={Math.round(scale(t)) + 0.5} y1={y} y2={y + 4} stroke="var(--ink)" strokeOpacity={0.35} />
          <text x={scale(t)} y={y + 15} textAnchor="middle" fontSize={9.5} fill="var(--ink-3)" className="font-mono">
            {format(t)}
          </text>
        </g>
      ))}
      {label && (
        <text x={x1} y={y + 28} textAnchor="end" fontSize={9} fill="var(--ink-3)" className="smallcaps" style={{ fontWeight: 600 }}>
          {label}
        </text>
      )}
    </g>
  );
}

export function linePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

export function stepPath(points: [number, number][], xEnd: number): string {
  let d = "";
  points.forEach(([x, y], i) => {
    if (i === 0) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
    else d += `H${x.toFixed(1)}V${y.toFixed(1)}`;
  });
  const last = points.at(-1);
  if (last) d += `H${xEnd.toFixed(1)}`;
  return d;
}

export function areaPath(points: [number, number][], baseline: number): string {
  if (points.length === 0) return "";
  return `${linePath(points)}L${points.at(-1)![0].toFixed(1)},${baseline}L${points[0]![0].toFixed(1)},${baseline}Z`;
}
