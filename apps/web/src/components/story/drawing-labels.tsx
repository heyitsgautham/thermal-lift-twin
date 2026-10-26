// Labels drawn inside the well cross-section: a one-line pill, and a tag with
// a title, a value and a coloured note.

export function Pill({ x, y, text, anchor = "start", tone = "ink", opacity = 1, size = 14 }: {
  x: number;
  y: number;
  text: string;
  anchor?: "start" | "end";
  tone?: "ink" | "alert" | "produce";
  opacity?: number;
  size?: number;
}) {
  const w = text.length * size * 0.56 + 18;
  const x0 = anchor === "end" ? x - w : x;
  const fg = tone === "alert" ? "#fbf4e8" : tone === "produce" ? "#fbf4e8" : "var(--ink)";
  const bg = tone === "alert" ? "var(--alert)" : tone === "produce" ? "var(--produce)" : "rgb(251 247 240 / 0.92)";
  return (
    <g opacity={opacity}>
      <rect x={x0} y={y - size + 1} width={w} height={size + 12} rx={3} fill={bg} stroke={tone === "ink" ? "var(--rule-strong)" : "none"} />
      <text x={x0 + 9} y={y + 5} fontSize={size} fill={fg} fontWeight={600} style={{ fontFamily: "var(--font-archivo)" }}>
        {text}
      </text>
    </g>
  );
}

export function Tag({ x, y, w, title, value, sub, tone, opacity }: {
  x: number;
  y: number;
  w: number;
  title: string;
  value: string;
  sub: string;
  tone: "alert" | "produce";
  opacity: number;
}) {
  const accent = tone === "alert" ? "var(--alert)" : "var(--produce)";
  return (
    <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={52} rx={4} fill="rgb(251 247 240 / 0.96)" stroke="var(--rule-strong)" />
      <rect x={x} y={y} width={4} height={52} rx={2} fill={accent} />
      <text x={x + 16} y={y + 22} fontSize={13} fontWeight={700} letterSpacing="0.1em" fill="var(--ink-2)" style={{ fontFamily: "var(--font-archivo)" }}>
        {title.toUpperCase()}
      </text>
      <text x={x + w - 14} y={y + 23} textAnchor="end" fontSize={18} fontWeight={700} fill="var(--ink)" style={{ fontFamily: "var(--font-archivo)" }}>
        {value}
      </text>
      <text x={x + 16} y={y + 43} fontSize={14} fill={accent} fontWeight={600} style={{ fontFamily: "var(--font-archivo)" }}>
        {sub}
      </text>
    </g>
  );
}
