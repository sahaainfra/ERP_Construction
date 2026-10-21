import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { PwaControls } from "@/design/ui/pwa";
import { PRE_PAINT_SCRIPT } from "@/design/preferences";
import "@/design/tokens.css";
import "@/design/fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Construction",
  description: "Integrated construction and EPC ERP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Applies saved theme and density before first paint so the page does not flash. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <PwaControls />
      </body>
    </html>
  );
}
