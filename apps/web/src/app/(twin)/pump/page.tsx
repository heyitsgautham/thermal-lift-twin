import type { Metadata } from "next";
import { PumpTwinScreen } from "@/components/screens/pump-twin";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Pump twin · ${BRAND.product}` };

export default function Page() {
  return <PumpTwinScreen />;
}
