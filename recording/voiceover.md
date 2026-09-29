# Voiceover

Script for `recording/out/calendar-take.mp4`, 1:50 long, 1920 by 1080 at 30 fps, no audio track.
Read each line inside its window.
The times are the MP4's own times; `record.ts` holds every scene to them and `take-log.json` records where each screen actually appeared.

| Start | End | On screen | Line to read |
|---|---|---|---|
| 0:00 | 0:07 | Steam calendar loaded: 33 producing wells over 90 days, the generator lane at 23.9 of 24.0 t/h. Lower third: Thermal Lift Twin, Oil India, Team 2 | Our 33 wells share two steam generators, and every late steam slot costs oil. |
| 0:07 | 0:13 | Zoom on the twin panel: BGW-14 due 28 Oct, planned 11 Nov, 14 d late, and why it is due. Ring on the BGW-14 row | BGW-14 is due for steam on 28 October. The plan waits until 11 November. |
| 0:13 | 0:20 | Drag BGW-14's steam block 14 days earlier. The lane goes red over 7 to 9 Nov at 26.9 t/h, the tile reads 3 d over, then the twin resolves it | So drag it forward. Three days in November now need 26.9 tonnes an hour, against 24. |
| 0:20 | 0:36 | Options tested: BGW-22, BGW-39, BGW-31, BGW-50. BGW-22 steams 3 days later; the twin panel says it gives up 60 bbl inside the 90 days and makes it back after day 90 | The twin tests each well on those days, finds four moves that clear it, and picks the cheapest. BGW-22 steams three days later. It gives up 60 barrels inside the window and makes them back after day 90. |
| 0:36 | 0:48 | Zoom on Wells in this change: oil 3,878 to 4,040 bbl, +162 bbl; steam-oil ratio 6.59 to 6.33. Click Adopt proposal | For the two wells in this change, ninety-day oil rises by 162 barrels, and their steam-oil ratio falls from 6.59 to 6.33. Adopt it. |
| 0:48 | 1:10 | Cycle plan for BGW-14 cycle 5: steam date 28 Oct, cooling curve, viscosity climbing, pump speed stepping down, the rod-float band, re-steam marker on 28 Oct | Now follow BGW-14. Until 28 October its reservoir keeps cooling and its crude keeps thickening. The twin sets the pump's speed and running time for every day to follow that curve, slowing the downstroke as the crude gets heavier, right down to the steam date. |
| 1:10 | 1:40 | Pump twin for BGW-14 on 27 Oct, its last day before steam: surface and downhole cards live, rod-float flag, then the twin profile with a slow downstroke | This is BGW-14's pump on 27 October, its last day before steam. At constant speed, the rods can't fall through crude this thick as fast as the unit lowers them. The string goes slack and slams at the bottom. That is rod float, and it breaks rods. The twin slows the downstroke and keeps the upstroke fast, so the rods stay loaded. |
| 1:40 | 1:50 | End card: Thermal Lift Twin, Oil India Limited, Team 2, working prototype on synthetic data built from published field numbers, generator capacity an assumption | Thermal Lift Twin. A working prototype on synthetic data, built from the field's published numbers. Generator capacity is our assumption. Team 2, Saveetha Engineering College. |

About 237 words.

## Pace per scene

Words per minute. Every scene sits between 120 and 145; if a line runs long, cut words rather than read faster.

| Scene | Words | Words per minute |
|---|---|---|
| calendar | 14 | 120 |
| due | 14 | 140 |
| drag | 16 | 137 |
| fix | 38 | 143 |
| change | 24 | 120 |
| cycle-plan | 45 | 123 |
| pump | 62 | 124 |
| end | 24 | 144 |

## Notes for the reader

One well and one flow: BGW-14 on the steam calendar, then its cycle plan, then its pump.
Every number in a line is on screen, digit for digit, while the line is read.
The gain is the two wells in the change, 162 barrels and a steam-oil ratio from 6.59 to 6.33.
Do not quote a field-wide percentage; the field moves by 0.2%.
"Against 24" reads the capacity shown as 24.0 t/h.
Say "BGW" as "B G W".
