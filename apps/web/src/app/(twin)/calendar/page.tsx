import type { Metadata } from "next";
import { SteamCalendar } from "@/components/calendar/steam-calendar";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Steam calendar · ${BRAND.product}` };

export default function CalendarPage() {
  return <SteamCalendar />;
}
