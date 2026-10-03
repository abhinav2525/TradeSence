import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PREPAINT_SCRIPT } from "@/lib/prepaint";

/*
 * Geist carries the whole interface, numbers included; its tabular figures
 * keep table columns aligned. Geist Mono is reserved for dates, keys and code.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "tradeSence — NIFTY 50 breadth",
  description: "How many NIFTY 50 constituents trade above their moving average.",
};

/*
 * Dark is the default and is what the server renders. PREPAINT_SCRIPT applies a
 * stored light theme and marks motion before the first paint;
 * suppressHydrationWarning on <html> lets React accept what it changed.
 */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      data-density="compact"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
