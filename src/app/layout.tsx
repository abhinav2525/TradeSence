import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tradeSence — NIFTY 50 breadth",
  description: "How many NIFTY 50 constituents trade above their moving average.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
