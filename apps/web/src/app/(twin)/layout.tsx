import { AppHeader } from "@/components/shell/app-header";
import { TwinProvider } from "@/components/twin/twin-provider";

export default function TwinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      <main className="min-h-0 flex-1">
        <TwinProvider fallback={<div className="h-full" aria-busy />}>{children}</TwinProvider>
      </main>
    </>
  );
}
