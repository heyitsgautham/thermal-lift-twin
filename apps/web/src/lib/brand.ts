// Display names the public repository leaves out, so a search for them does not
// find it. Set them in apps/web/.env.local, which git ignores, and the app and
// its takes show them; without them the app shows the neutral names below.
//
//   NEXT_PUBLIC_PRODUCT   product name          NEXT_PUBLIC_EVENT   event label
//   NEXT_PUBLIC_FIELD     oil field's name      NEXT_PUBLIC_PS      problem statement ID

export const BRAND = {
  product: process.env.NEXT_PUBLIC_PRODUCT || "Thermal Lift Twin",
  field: process.env.NEXT_PUBLIC_FIELD || "",
  event: process.env.NEXT_PUBLIC_EVENT || "",
  ps: process.env.NEXT_PUBLIC_PS || "",
};

/** The field's name, or "the field" mid-sentence. */
export const fieldName = BRAND.field || "the field";

/** "Oil India Limited", led by the problem statement ID when one is set. */
export function orgLine(org = "Oil India Limited"): string {
  return [BRAND.ps, org].filter(Boolean).join(" · ");
}

/** The event and problem statement, for the footer. Empty when neither is set. */
export const eventLine = [BRAND.event, BRAND.ps].filter(Boolean).join(" · ");
