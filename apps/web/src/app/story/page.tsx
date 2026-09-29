import type { Metadata } from "next";
import { StoryMount } from "@/components/story/story-mount";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `${BRAND.product} · BGW-14, today and with the twin` };

export default function Page() {
  return <StoryMount />;
}
