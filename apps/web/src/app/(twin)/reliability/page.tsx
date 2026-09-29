import type { Metadata } from "next";
import { ReliabilityScreen } from "@/components/screens/reliability";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Reliability · ${BRAND.product}` };

export default function Page() {
  return <ReliabilityScreen />;
}
