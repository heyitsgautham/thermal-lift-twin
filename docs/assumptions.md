# Assumptions

Every number below is ours, not OIL's.
Each is a setting in the code or the fixture, and each is shown on the Model screen.

| Assumption | Value | Where it lives | Why |
|---|---|---|---|
| Steam generators | 2 units at 12.0 t/h each | `packages/simulate/src/fixture.ts`, a setting on the calendar | OIL has not published generator capacity. The voiceover says "two steam generators" without a number. |
| Second viscosity anchor | 20 cP at 200 °C | fixture | Heavy-crude slope for a 17 to 19° API oil. The 50 °C anchor is published. |
| Cooling time | 60 days at 2,400 t | `packages/physics/src/well-state.ts` | Sets cycle length and steam-oil ratio in a plausible band, 3 in cycle 1 to 5 by cycle 5. |
| Heat retention | 58% in cycle 1, times 0.94 per later cycle | same | Later cycles keep less heat near the well. |
| Soak effect | none between 5 and 7 days | same | Outside that window, short soaks flash steam back and long ones lose heat. |
| Large slugs | heat retention falls above 2,800 t | same | Diminishing returns on very large injections. |
| Heated-zone exponent | 0.40 to 0.46 | fixture | Share of drawdown in the heated zone. |
| Steam cost | 0.50 bbl oil per tonne | fixture, a setting in the what-if lab | Prices steam in the re-steam rule and plan value. |
| Rod string | 7/8 in rods, 2 7/8 in tubing, pump at 1,100 m | `packages/physics/src/rod-string.ts` | Pump depth follows the published 1,150 m Jodhpur Sandstone. |
| Pump limits | 3 to 6 SPM constant speed, downstroke up to 2× the upstroke with a VFD | same | Slowest speed of a typical unit and a conservative VFD profile. |
| Pump-off timer | runs in steps of 5% of a day, at least 10% | `packages/optimise/src/operating.ts` | Timers are set in minutes. A coarser step leaves the barrel part empty, which is fluid pound. |
| Wellhead temperature | 30 °C ground plus 55% of the bottomhole rise | `well-state.ts` | Rod drag uses the tubing's mean temperature. |
| Failure hazard | Weibull, shape 1.6, scale 8 impact units; base 0.15 per well-year | `packages/optimise/src/reliability.ts` | Tuned so the eight-year history has 60 to 80 failures. |
| Drift gains | 18 per unit of drift over 0.12, 90 per unit of daily slope | same | Hand-set. Only checked against synthetic history. |
| Crew reaction | 8 to 20 days of pounding before a unit is slowed by hand | `packages/simulate/src/history.ts` | Current practice in the synthetic history. |
| Oil price, workover | ₹6,000 per bbl, ₹14 lakh per workover, 4 days down | `reliability.ts` | For the cost of a failure against the cost of slowing down. |
| Well positions | schematic, inside a 200.26 km² outline | `packages/simulate/src/map.ts` | OIL does not publish well coordinates. |

## Fixture design

The demo story runs on the fixture's own physics, and two things in it were placed on purpose.

1. BGW-14's last injection stopped after 12 of 14 design days, recorded as an SG-2 trip, and its cycle start and BGW-22's were chosen so that moving BGW-14 to its re-steam day overloads the generators for three days.
The twin's choice of BGW-22 is computed live and is tested, not scripted.
2. Two failures are placed four and seven days after the as-of date, on BGW-29 and BGW-45, so that their precursor drift is visible today.
The estimator never sees those records.

`packages/simulate/src/tune.ts` is the search that found the seed and those starts.
