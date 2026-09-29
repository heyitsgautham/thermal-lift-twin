"use client";

import type { FieldDataset } from "@bgw/optimise";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { dataset } from "@/lib/dataset";
import { useTwin, type Twin } from "./use-twin";

// One twin for the whole app. The calendar's proposal, the capacity setting and
// the well in focus carry across every screen, so the cycle plan and the pump
// twin always show the cycle the calendar just planned.

interface TwinContextValue {
  twin: Twin;
  dataset: FieldDataset;
  focusWell: string;
  setFocusWell(wellId: string): void;
  holdOverload: boolean;
}

const TwinContext = createContext<TwinContextValue | null>(null);

const subscribeNothing = () => () => {};

function TwinState({ children }: { children: React.ReactNode }) {
  const [holdOverload] = useState(() => new URLSearchParams(window.location.search).get("hold") === "overload");
  const twin = useTwin(dataset, { holdOverload });
  const [focusWell, setFocusWell] = useState(
    () => new URLSearchParams(window.location.search).get("well") ?? "BGW-14",
  );
  return (
    <TwinContext.Provider value={{ twin, dataset, focusWell, setFocusWell, holdOverload }}>{children}</TwinContext.Provider>
  );
}

/**
 * The twin renders only in the browser. Its physics runs in floating point and
 * Node and the browser can disagree in the last digit, so a server render
 * would never hydrate cleanly. The server sends the page frame instead.
 */
export function TwinProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!mounted) return <>{fallback}</>;
  return <TwinState>{children}</TwinState>;
}

export function useTwinContext(): TwinContextValue {
  const value = useContext(TwinContext);
  if (!value) throw new Error("useTwinContext needs a TwinProvider");
  return value;
}
