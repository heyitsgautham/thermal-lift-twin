import type { Metadata } from "next";
import { ModelScreen } from "@/components/screens/model";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Model · ${BRAND.product}` };

export default function Page() {
  return <ModelScreen />;
}
