import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/shell/site-footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// Archivo for the interface and Martian Mono for numbers, both variable fonts with
// a width axis, self-hosted from src/fonts (SIL Open Font License).
const archivo = localFont({
  src: "../fonts/archivo-latin-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "block",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});
const martian = localFont({
  src: "../fonts/martian-mono-latin-variable.woff2",
  variable: "--font-martian",
  weight: "100 800",
  style: "normal",
  display: "block",
  declarations: [{ prop: "font-stretch", value: "75% 112.5%" }],
});

export const metadata: Metadata = {
  title: BRAND.product,
  description: "Steam cycles and rod-pump settings, planned together for heavy-oil wells. Working prototype on synthetic data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${martian.variable}`}>
      <body className="grain flex h-screen min-h-0 flex-col overflow-hidden">
        <TooltipProvider delayDuration={250}>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <SiteFooter />
        </TooltipProvider>
      </body>
    </html>
  );
}
