"use client";

import { ErrorScreen } from "@/components/shell/error-screen";
import "./globals.css";

// Catches an error in the root layout itself, so it renders its own document.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="grain flex h-screen min-h-0 flex-col overflow-hidden">
        <title>Error</title>
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
