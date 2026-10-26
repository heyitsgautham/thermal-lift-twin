/** The well the twin screens open on when a link names none, or names one they cannot show. */
export const DEFAULT_FOCUS_WELL = "BGW-14";

/**
 * The well a `?well=` link asks for, if the twin screens can show it.
 * The cycle plan, pump twin and what-if lab draw cyclic-steam wells only, so a
 * cold well, an unknown id or an empty value opens the default well instead of
 * crashing the page. Ids match without regard to case or surrounding spaces.
 */
export function resolveFocusWell(requested: string | null, cssWellIds: readonly string[]): string {
  const id = requested?.trim().toUpperCase();
  return id && cssWellIds.includes(id) ? id : DEFAULT_FOCUS_WELL;
}
