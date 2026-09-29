import type { Metadata } from "next";
import { EndCard } from "@/components/screens/end-card";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: BRAND.product };

export default function Page() {
  return <EndCard />;
}
