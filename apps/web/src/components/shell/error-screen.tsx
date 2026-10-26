"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PumpjackMark } from "@/components/shell/app-header";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/report-error";

// What a screen shows when it throws while rendering: what failed, a retry, and
// a way back to the story. The error goes to the server log once on mount.

export function ErrorScreen({
  error,
  retry,
  report = reportClientError,
}: {
  error: unknown;
  retry: () => void;
  report?: typeof reportClientError;
}) {
  useEffect(() => {
    report(error, "render");
  }, [error, report]);

  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  const detail = error instanceof Error ? error.message : null;

  return (
    <main role="alert" className="flex min-h-0 flex-1 items-center justify-center p-10" data-testid="error-screen">
      <div className="flex w-[560px] max-w-full flex-col gap-5">
        <PumpjackMark size={1.6} />
        <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.01em] stretch-semi text-ink">
          This screen stopped on an error
        </h1>
        <p className="text-[16px] leading-snug text-ink-2">
          The twin computes in your browser, and something in this screen failed. The error went to the server log. Try again, or go back to
          the story.
        </p>
        {detail || digest ? (
          <p className="font-mono text-[13px] break-words text-ink-2" data-testid="error-detail">
            {detail}
            {digest ? ` (ref ${digest})` : null}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/story">Open the story</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
