# Model

The twin is one chain of simple, stated physics.
Every screen reads from the same chain, so the calendar, the cycle plan, the pump twin, the reliability view and the what-if lab cannot disagree.
The code lives in `packages/physics` (state) and `packages/optimise` (decisions).

## 1. Heated zone

After injection and soak the heated zone cools toward the reservoir.

```
T(t) = Tr + (T0 - Tr) * exp(-t / tau)
T0   = Tr + (T_inj - Tr) * 0.58 * 0.94^(n - 1) * soak factor * large-slug factor
tau  = 60 d * (steam / 2,400 t) * soak factor
```

This is the lumped form of the Boberg-Lantz model.
Tr is 46 to 48 °C per well, the published range.
Later cycles keep less heat near the well.
Soak between 5 and 7 days changes nothing; shorter soaks flash steam back up the well, longer ones lose heat to cap and base rock.
Slugs above 2,800 t lose part of the extra heat, which is where the what-if lab shows the steam-oil ratio climbing.

## 2. Viscosity

ASTM D341 (Walther) through two anchors per well.

```
log10(log10(nu + 0.7)) = A - B * log10(T_K)
```

The first anchor is the well's viscosity at 50 °C, drawn inside the published 10,000 to 13,000 cP.
The second is 20 cP at 200 °C, an assumption for a 17 to 19° API crude.
Density is held at its 60 °F value from API gravity.

## 3. Inflow

```
q_oil = q_cold * (mu_cold / mu(T))^beta * 0.93^(n - 1)
```

q_cold is the rate the well made cold, 8 to 12 bbl/d.
beta, 0.40 to 0.46, stands for the share of drawdown taken in the heated zone.
Condensed steam gives an 80% water cut right after soak that cleans up over about ten days.

## 4. Pump and rods

Pump displacement follows API RP 11L, `0.1166 * S * N * D^2` bbl/d, times fillage.
Rod drag is laminar Couette flow between a 7/8 in rod and 2 7/8 in tubing.
The rods' terminal fall speed is

```
v_fall = w_b * ln(R / r) / (2 * pi * mu_tubing)
```

where w_b is the rods' buoyant weight per metre and mu_tubing is the crude's viscosity at the tubing's mean temperature.
When the polished rod comes down faster than v_fall the string goes slack and slams at the bottom.
That is rod float.

Cards come from Gibbs' damped wave equation on a 1,100 m string, solved with explicit finite differences.
The surface end follows the polished-rod motion, the pump end carries the plunger load with valve timing and incomplete fillage.
Polished-rod power is the surface card's area times strokes per second.

## 5. Decisions

**Re-steam day.**
A cycle should end the first day its oil rate falls below what a fresh cycle would average after paying for its steam, counting the days the well sits shut in.
This is the marginal-value rule from optimal replacement.
Steam is priced at 0.50 bbl of oil per tonne, a stated setting.

**Current practice.**
Each well gets a production leg worked out from its design cycle, and slots are booked first come, first served against the generators.
Practice never looks at the steam a cycle actually got, which is why BGW-14, whose last injection stopped early, is due two weeks before its slot.

**Generator repair.**
When a plan asks for more steam than the generators make, the twin tries every other slot that injects on an overloaded day, one day at a time up to 21 days either way.
It keeps the move that clears the overload for the least plan value.
Plan value is 90-day oil, less committed steam priced in oil, plus what each cycle carries past day 90 at the well's own opportunity rate.
The carried term stops the search from pulling cycles earlier just to get their oil inside the window.
The engineer's own edit is never moved.
The plan asked for an OR-Tools CP-SAT model with a greedy fallback; the prototype runs the exhaustive single-move search with a greedy multi-move fallback, which is exact for one conflict at this size.

**Cycle schedule.**
SPM follows what the well can deliver at 85% fillage in half-SPM steps.
Below the unit's slowest constant speed of 3 SPM the VFD holds the upstroke at that speed and stretches the downstroke up to twice as long.
Only below that does a pump-off timer take over.
The stroke length is set during soak and held for the cycle.

**Failure risk.**
Each day the rods float adds impact loading.
The hazard is Weibull in cumulative impact, shape 1.6 and scale 8, plus a base rate of 0.15 failures per well-year.
Card-shape drift scales the hazard up.
The screen shows an estimated risk window for the next seven days by moving the least certain assumptions, not a calibrated forecast.
See [honesty.md](honesty.md).
