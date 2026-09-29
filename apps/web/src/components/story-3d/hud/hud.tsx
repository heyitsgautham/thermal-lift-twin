"use client";

import { useStoryTime } from "../clock";
import type { StoryData } from "../data";
import { EndCard, Fade, Footer, SourcesPanel, YearPanel } from "./closing";
import { Cursor, pressedAt } from "./cursor";
import { FieldHud } from "./field-hud";
import { FieldLabels, WellLabels } from "./labels";
import { Apart, BeforeAfter, CardPanel } from "./panels";
import { Brand, FloatCounter, LowerThird, ModeToggle, Readouts, Timeline } from "./well-hud";

// Everything drawn over the 3D, read from story time on every tick.

export function Hud({ data }: { data: StoryData }) {
  const t = useStoryTime();
  const pressed = pressedAt(t);
  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <WellLabels t={t} data={data} />
      <FieldLabels t={t} data={data} />
      <Brand t={t} />
      <ModeToggle t={t} pressed={pressed} />
      <Readouts t={t} data={data} />
      <FloatCounter t={t} data={data} />
      <Timeline t={t} data={data} />
      <LowerThird t={t} />
      <Apart t={t} />
      <BeforeAfter t={t} data={data} />
      <CardPanel t={t} data={data} />
      <FieldHud t={t} data={data} pressed={pressed} />
      <YearPanel t={t} data={data} />
      <SourcesPanel t={t} />
      <Fade t={t} />
      <EndCard t={t} />
      <Footer t={t} />
      <Cursor t={t} />
    </div>
  );
}
