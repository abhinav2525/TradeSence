import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge has to be told about the custom type scale in globals.css.
 * Left alone it reads `text-heading` as a colour and drops it whenever a
 * colour such as `text-foreground` follows it in the same cn() call.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "metric", "title", "heading", "eyebrow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
