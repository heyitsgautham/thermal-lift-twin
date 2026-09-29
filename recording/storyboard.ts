// The demo video: one well, one drag, three screens. BGW-14 is moved to its
// re-steam day on the calendar, the generators overload, the twin moves
// BGW-22, and the take follows BGW-14 into its cycle plan and its pump.
// Start and end are seconds of the final MP4. `record.ts` holds each scene to
// its window and `voiceover.md` is written from this table.
//
// Every number a line speaks is on screen, digit for digit, while it is spoken.

export interface Scene {
  id: string;
  start_s: number;
  end_s: number;
  screen: string;
  line: string;
}

export const SCENES: Scene[] = [
  {
    id: "calendar",
    start_s: 0,
    end_s: 7,
    screen: "Steam calendar loaded: 33 producing wells over 90 days, the generator lane at 23.9 of 24.0 t/h. Lower third: Thermal Lift Twin, Oil India, Team 2",
    line: "Our 33 wells share two steam generators, and every late steam slot costs oil.",
  },
  {
    id: "due",
    start_s: 7,
    end_s: 13,
    screen: "Zoom on the twin panel: BGW-14 due 28 Oct, planned 11 Nov, 14 d late, and why it is due. Ring on the BGW-14 row",
    line: "BGW-14 is due for steam on 28 October. The plan waits until 11 November.",
  },
  {
    id: "drag",
    start_s: 13,
    end_s: 20,
    screen: "Drag BGW-14's steam block 14 days earlier. The lane goes red over 7 to 9 Nov at 26.9 t/h, the tile reads 3 d over, then the twin resolves it",
    line: "So drag it forward. Three days in November now need 26.9 tonnes an hour, against 24.",
  },
  {
    id: "fix",
    start_s: 20,
    end_s: 36,
    screen: "Options tested: BGW-22, BGW-39, BGW-31, BGW-50. BGW-22 steams 3 days later; the twin panel says it gives up 60 bbl inside the 90 days and makes it back after day 90",
    line:
      "The twin tests each well on those days, finds four moves that clear it, and picks the cheapest. " +
      "BGW-22 steams three days later. It gives up 60 barrels inside the window and makes them back after day 90.",
  },
  {
    id: "change",
    start_s: 36,
    end_s: 48,
    screen: "Zoom on Wells in this change: oil 3,878 to 4,040 bbl, +162 bbl; steam-oil ratio 6.59 to 6.33. Click Adopt proposal",
    line: "For the two wells in this change, ninety-day oil rises by 162 barrels, and their steam-oil ratio falls from 6.59 to 6.33. Adopt it.",
  },
  {
    id: "cycle-plan",
    start_s: 48,
    end_s: 70,
    screen: "Cycle plan for BGW-14 cycle 5: steam date 28 Oct, cooling curve, viscosity climbing, pump speed stepping down, the rod-float band, re-steam marker on 28 Oct",
    line:
      "Now follow BGW-14. Until 28 October its reservoir keeps cooling and its crude keeps thickening. " +
      "The twin sets the pump's speed and running time for every day to follow that curve, slowing the downstroke as the crude gets heavier, right down to the steam date.",
  },
  {
    id: "pump",
    start_s: 70,
    end_s: 100,
    screen: "Pump twin for BGW-14 on 27 Oct, its last day before steam: surface and downhole cards live, rod-float flag, then the twin profile with a slow downstroke",
    line:
      "This is BGW-14's pump on 27 October, its last day before steam. At constant speed, the rods can't fall through crude this thick " +
      "as fast as the unit lowers them. The string goes slack and slams at the bottom. That is rod float, and it breaks rods. " +
      "The twin slows the downstroke and keeps the upstroke fast, so the rods stay loaded.",
  },
  {
    id: "end",
    start_s: 100,
    end_s: 110,
    screen: "End card: Thermal Lift Twin, Oil India Limited, Team 2, working prototype on synthetic data built from published field numbers, generator capacity an assumption",
    line:
      "Thermal Lift Twin. A working prototype on synthetic data, built from the field's published numbers. " +
      "Generator capacity is our assumption. Team 2, Saveetha Engineering College.",
  },
];

export const TOTAL_S = SCENES.at(-1)!.end_s;
