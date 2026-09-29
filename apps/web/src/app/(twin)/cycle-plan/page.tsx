import type { Metadata } from "next";
import { CyclePlanScreen } from "@/components/screens/cycle-plan";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Cycle plan · ${BRAND.product}` };

export default function Page() {
  return <CyclePlanScreen />;
}
