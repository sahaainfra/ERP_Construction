import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { PRE_PAINT_SCRIPT } from "@/design/preferences";
import "@/design/tokens.css";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ERP Construction",
  description: "Integrated construction and EPC ERP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Applies saved theme and density before first paint so the page does not flash. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body className={`${plexSans.variable} ${plexMono.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
