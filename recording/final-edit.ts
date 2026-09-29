// The submission video's edit list. Four clips from the two story takes:
//
//   1. the 3D descent from the pumpjack to the pump at 1,100 m
//   2. the 2D console, from the moment Play is pressed to the end of the pump card
//   3. the 3D field of 19 wells and its year of results
//   4. the 2D sources and end card
//
// Each clip is a window of one take, in that take's own seconds. A clip
// dissolves in over the tail of the one before it, so the final time of every
// scene follows from the list, and the voiceover is timed to those final times.

export type Take = "2d" | "3d";

export interface Scene {
  n: number;
  title: string;
  /** Where the scene starts in its take, seconds. */
  at_s: number;
  /** What the viewer sees, for the voiceover reader. */
  screen: string;
  line: string;
}

export interface Clip {
  take: Take;
  from_s: number;
  to_s: number;
  /** Dissolve from the previous clip into this one. */
  fade_s: number;
  scenes: Scene[];
}

export const TAKES: Record<Take, string> = {
  "2d": "out/story-2d.mp4",
  "3d": "out/story-3d.mp4",
};

export const CLIPS: Clip[] = [
  {
    take: "3d",
    from_s: 0,
    to_s: 12.0,
    fade_s: 0,
    scenes: [
      {
        n: 1,
        title: "The well",
        at_s: 0,
        screen: "BGW-14's pad in the desert, cut open. The camera sinks down the well to the pump at 1,100 m. Lower third: Thermal Lift Twin, Oil India Limited, Team 2.",
        line: "This is well B G W fourteen, in Rajasthan. Its oil sits in sandstone, more than a kilometre down.",
      },
    ],
  },
  {
    take: "2d",
    from_s: 10.6,
    to_s: 135.6,
    fade_s: 0.3,
    scenes: [
      {
        n: 2,
        title: "The steam cycle",
        at_s: 10.7,
        screen: "Play. Steam goes down the well and the heated zone glows in the sandstone; injection stopped after 12 of 14 days, an SG-2 trip. Soak, then the pump starts.",
        line: "The crude is as thick as cold honey, so Oil India heats it. This time the steam ran twelve days, cut short by a generator trip. Then the well soaks, and the pump lifts the hot, thin oil.",
      },
      {
        n: 3,
        title: "How it runs today",
        at_s: 29.67,
        screen: "Today mode. The glow fades, the crude thickens, the pump stays at 3.0 strokes a minute. From 25 Oct the rods go slack and slam; the rod-float counter climbs to 17. Steam on 11 Nov.",
        line: "Here is how the cycle runs today. As the rock cools, the crude thickens again, but the pump keeps the same speed. On every downstroke, the rods must sink through that crude. From twenty-five October, they can't keep up. The string goes slack, and slams at the bottom. That's rod float, and it breaks rods. Today's plan waits until eleven November. Seventeen days of it.",
      },
      {
        n: 4,
        title: "Two decisions, made apart",
        at_s: 62.5,
        screen: "Two tags: steam date 11 Nov, from the plan; pump 3.0 strokes a minute, set by hand. The link between them is broken.",
        line: "Why does this happen? The steam date comes from the plan. The pump speed is set by hand. Nobody decides them together.",
      },
      {
        n: 5,
        title: "With the twin",
        at_s: 74.5,
        screen: "Back to 2 Aug, Twin mode. The pump slows to 2.0 strokes a minute, up 33 and down 67 of each stroke. Rods loaded, the counter stays at 0.",
        line: "Now, the same well with our twin. It knows how fast the rock is cooling, so it knows how thick the crude will be each day, and it sets the pump to match. When the crude gets thick, it reshapes every stroke. Fast up, slow down. The rods always have time to sink.",
      },
      {
        n: 6,
        title: "The steam date",
        at_s: 106.03,
        screen: "The twin steams on 28 Oct, 14 days before the plan's 11 Nov. Compare: rod-float days 17 to 0, pump electricity 1,756 to 1,300 kWh, -26%.",
        line: "It also picks the steam date. Twenty-eight October, two weeks before today's plan. Rod-float days drop from seventeen to zero, on twenty-six percent less electricity.",
      },
      {
        n: 7,
        title: "Proof on the card",
        at_s: 120.63,
        screen: "Surface card for 27 Oct. Today's loop dips below zero, to -1.8 kN. The twin's stays above.",
        line: "Engineers can check it on the pump's own card. Below zero, the rod string is slack. Today, it dips to minus one point eight kilonewtons. The twin never goes there.",
      },
    ],
  },
  {
    take: "3d",
    from_s: 137.1,
    to_s: 175.6,
    fade_s: 0.5,
    scenes: [
      {
        n: 8,
        title: "Nineteen wells, shared steam",
        at_s: 137.1,
        screen: "The field in 3D: 19 steam wells and the shared generators. BGW-14 is dragged to 28 Oct, three days, 7 to 9 Nov, go over capacity, and the twin moves BGW-22 by 3 days. It fits.",
        line: "Nineteen wells share the steam generators. Pull B G W fourteen forward, and three November days need more steam than the generators make. The twin moves B G W twenty-two by three days, and it fits.",
      },
      {
        n: 9,
        title: "A year on the field",
        at_s: 161.0,
        screen: "One year, 19 steam wells, today against the twin: rod-float days 250 to 0, expected failures 4.41 to 2.85 (-35%), electricity 1.88 to 1.75 kWh per barrel. Model result on synthetic data.",
        line: "Over a simulated year on nineteen wells, rod-float days fall from two hundred and fifty to zero, and expected failures drop thirty-five percent.",
      },
    ],
  },
  {
    take: "2d",
    from_s: 172.4,
    to_s: 202.1,
    fade_s: 0.5,
    scenes: [
      {
        n: 10,
        title: "How we built it",
        at_s: 172.4,
        screen: "Eight source cards: the problem statement, OIL's field page and April 2026 figures, BGW-8's first CSS, Boberg and Lantz, ASTM D341, Gibbs, API RP 11L. 74,044 synthetic daily records since 2017.",
        line: "We started from Oil India's published figures for the field, and the classic papers. Boberg and Lantz, on how a steamed well cools. Gibbs, on how a rod string moves. The history since twenty seventeen is synthetic, built from the same physics.",
      },
      {
        n: 11,
        title: "End card",
        at_s: 194.1,
        screen: "Thermal Lift Twin, Team 2, Saveetha Engineering College, working prototype on synthetic data.",
        line: "Thermal Lift Twin. A working prototype, by Team 2, Saveetha Engineering College.",
      },
    ],
  },
];

/** Where each clip starts in the final video. */
export function clipStarts(clips: Clip[] = CLIPS): number[] {
  const starts: number[] = [];
  let t = 0;
  clips.forEach((c, i) => {
    if (i > 0) t -= c.fade_s;
    starts.push(t);
    t += c.to_s - c.from_s;
  });
  return starts;
}

export function finalDuration(clips: Clip[] = CLIPS): number {
  const starts = clipStarts(clips);
  const last = clips.at(-1)!;
  return starts.at(-1)! + last.to_s - last.from_s;
}

export interface TimedScene extends Scene {
  start_s: number;
  end_s: number;
}

/** Every scene on the final video's clock. A scene ends where the next one starts. */
export function finalScenes(clips: Clip[] = CLIPS): TimedScene[] {
  const starts = clipStarts(clips);
  const flat = clips.flatMap((c, i) => c.scenes.map((s) => ({ ...s, start_s: starts[i]! + Math.max(0, s.at_s - c.from_s) })));
  return flat.map((s, i) => ({ ...s, end_s: flat[i + 1]?.start_s ?? finalDuration(clips) }));
}
