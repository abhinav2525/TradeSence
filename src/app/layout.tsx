import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
 * Dark is the default and is what the server renders. A stored "light" choice
 * is applied by this script while the HTML is still parsing, before the first
 * paint, so a light-mode reader never sees a dark flash. suppressHydrationWarning
 * on <html> lets React accept the class the script changed.
 */
const THEME_SCRIPT = `(function(){try{if(localStorage.getItem("theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
