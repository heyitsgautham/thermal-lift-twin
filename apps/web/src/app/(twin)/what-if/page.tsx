import type { Metadata } from "next";
import { WhatIfScreen } from "@/components/screens/what-if";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `What-if lab · ${BRAND.product}` };

export default function Page() {
  return <WhatIfScreen />;
}
