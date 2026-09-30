import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/*
 * Plex was designed for technical instrumentation, and pairing the sans with
 * its own mono lets every measured figure sit in aligned columns - which is
 * what actually makes a dense readout fast to scan.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "tradeSence — NIFTY 50 breadth",
  description: "How many NIFTY 50 constituents trade above their moving average.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${plexSans.variable} ${plexMono.variable}`}>
      {/* On a large screen the app is a fixed readout: the page itself does not
          scroll, its panels do. On small screens that would trap content, so
          normal document scrolling is kept below lg. */}
      <body className="lg:h-dvh lg:overflow-hidden">{children}</body>
    </html>
  );
}
