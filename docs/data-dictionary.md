# Data dictionary

`pnpm gen` writes three files to `data/demo/`.
All days are integers relative to the as-of date, 28 Sep 2026, which is day 0.
Every value is synthetic.

## field.json

| Key | Contents |
|---|---|
| `meta` | seed, as-of date, 90-day horizon, generator version |
| `field` | name, wells drilled (52), producing (33), on CSS (19) |
| `assumptions` | generator units and capacity, steam cost, minimum production leg, second viscosity anchor, reliability coefficients |
| `wells[]` | id, number, status (`css`, `cold`, `shut-in`, `observation`), completion, spud year, schematic location in km, fluid (reservoir °C, API, cP at 50 °C), and either `css` (cold rate, heated-zone exponent, base water cut, pump, design cycle, CSS start year) or `cold` (rate at as-of, decline per year, water cut, pump) |
| `cycles[]` | per CSS well and cycle: steam start day, injection days, soak days, t/h, injection °C, and a note when a cycle differs from design |
| `issuedPlan[]` | the plan in force: slot id `BGW-n#cycle`, well, cycle number, start day, injection and soak days, t/h, injection °C |
| `downtime[]` | planned workovers inside the window |
| `failures[]` | failures in the history: well, day, type (`rod parted`, `pump unseated`, `tubing leak`), precursor days, downtime days |
| `health[]` | per producing well: card drift for the last 60 days, cumulative impact loading, failure count, last failure day |
| `calibration[]` | logged and modelled daily oil for BGW-14 and BGW-8, last 420 days |
| `history` | daily-table date range, row count, columns, failure count, missing share, frozen-tag runs |
| `map` | field outline and a structure grid for the top of the Jodhpur Sandstone, both schematic |

## daily.parquet

One row per producing well per day, 1 Apr 2017 to 27 Sep 2026.

| Column | Unit | Notes |
|---|---|---|
| `date`, `day` | ISO date, days from as-of | |
| `well_id`, `phase`, `cycle` | | phase is `steam`, `soak`, `produce`, `down` or `cold` |
| `oil_bbl`, `water_bbl` | bbl/d | about 1% of days missing |
| `bht_C`, `wht_C` | °C | bottomhole and wellhead; wellhead has frozen-tag runs |
| `spm`, `stroke_in`, `runtime_frac`, `fillage_frac` | | current practice settings |
| `prl_max_kN`, `prl_min_kN` | kN | polished-rod load from the Mills factor and rod drag; below zero means the rods floated |
| `vfd_hz`, `motor_kWh` | Hz, kWh/d | |
| `card_drift` | 0 = own baseline | rises for 5 to 10 days before each failure |
| `failure` | 0 or 1 | |

Cards are not stored per day.
The pump twin synthesises any card on demand from the same physics, which keeps the data small and the card consistent with the day's state.

## tables.json

The Python API's scheduling inputs: each cycle's daily oil curve for 600 days, its re-steam leg, each well's opportunity rate, cold wells' 90-day oil, planned downtime, the issued plan, and `golden`, the TypeScript twin's answer to the demo edit that the API tests must match.
