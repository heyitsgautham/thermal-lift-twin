# Honesty note

This is a target product and a working prototype on synthetic data.
Nothing on its screens is OIL field data, and it is not deployed at OIL.

## What is real

The published field facts the model is pinned to, from OIL's field page and its April 2026 press release.
52 wells drilled, 33 operational, 19 on cyclic steam.
10,000 to 13,000 cP at 50 °C, 17 to 19° API, 46 to 48 °C reservoir, Jodhpur Sandstone at about 1,150 m.
A 200.26 km² field, a CSS pilot on BGW-8 in 2018, and 1,202 bopd in April 2026.
The model's field rate on the as-of date is within 5% of that figure.

## What is synthetic

The eight-year history, every cycle, every card, every failure and every well position.
They come from the simulator in `packages/simulate`, seeded, so every run gives the same field.
Because the history and the twin share the physics, the calibration plot on the Model screen checks the plumbing, not the physics.

## What we do not claim

**No calibrated failure warning.**
The reliability screen shows an estimated risk window for the next seven days under stated assumptions.
Its hazard shape and drift gains are set by hand and were only checked against the synthetic history.
Synthetic data cannot establish a lead time for rod parting or pump unseating, so the screen gives none.
That needs OIL's labelled failure records and dynamometer cards.

**No field uplift.**
The oil gains the calendar shows are what this model predicts for this synthetic field.
They demonstrate the calculation and the interface, not expected production in the field.

**Generator capacity is ours.**
Two units at 12 t/h is an assumption and a setting.

## What it would take

OIL's cycle histories, fluid properties, dynamometer cards, generator logs and failure records.
With those, the constants in [assumptions.md](assumptions.md) become fitted parameters, split by well and by later cycles for testing, with the physics-only model kept as the baseline.
