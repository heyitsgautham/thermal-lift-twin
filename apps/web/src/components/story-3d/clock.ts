"use client";

import { useSyncExternalStore } from "react";

// One clock for the whole story. Every animation, the camera, the HUD and the
// cursor read story time from here and nothing reads the wall clock, so a
// recorder can step it frame by frame and GPU speed never shows in the take.

type Listener = () => void;

export interface StoryClock {
  t: number;
  playing: boolean;
  set(t: number): void;
  subscribe(fn: Listener): () => void;
}

const listeners = new Set<Listener>();

export const clock: StoryClock = {
  t: 0,
  playing: false,
  set(t: number) {
    this.t = t;
    for (const fn of listeners) fn();
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

const subscribe = (fn: Listener) => clock.subscribe(fn);
const read = () => clock.t;

/** Story time in seconds, re-rendering the caller on every tick. */
export function useStoryTime(): number {
  return useSyncExternalStore(subscribe, read, read);
}
