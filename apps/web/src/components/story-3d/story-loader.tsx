"use client";

import dynamic from "next/dynamic";

// three.js needs the browser, and the twin's floating-point physics would not
// hydrate cleanly anyway, so the story renders on the client only.
const StoryApp = dynamic(() => import("./story-app"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 bg-[#f3eadc]" aria-busy />,
});

export function StoryLoader() {
  return <StoryApp />;
}
