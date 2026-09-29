import type { Metadata } from "next";
import { FieldMapScreen } from "@/components/screens/field-map";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Field map · ${BRAND.product}` };

export default function Page() {
  return <FieldMapScreen />;
}
