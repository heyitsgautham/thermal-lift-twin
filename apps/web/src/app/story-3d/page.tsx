import type { Metadata } from "next";
import { StoryLoader } from "@/components/story-3d/story-loader";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.product} · BGW-14 before and after, 3D`,
  description: "The CSS and SRP twin on one well, today's practice against the twin, then the field. Working prototype on synthetic data.",
};

export default function Page() {
  return <StoryLoader />;
}
