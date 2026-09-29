"use client";

import { useSyncExternalStore } from "react";
import { StoryApp } from "./story-app";

const subscribeNothing = () => () => {};

/** The story renders only in the browser, like the twin: the engine's floating point would not hydrate cleanly. */
export function StoryMount() {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!mounted) return <div className="min-h-0 flex-1" aria-busy />;
  return <StoryApp />;
}
