"use client";

import { ErrorScreen } from "@/components/shell/error-screen";

// Catches a render error in any page and keeps the root layout around it.
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
