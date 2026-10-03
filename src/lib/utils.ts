import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge has to be told about the custom type scale in globals.css.
 * Left alone it reads `text-heading` as a colour and drops it whenever a
 * colour such as `text-foreground` follows it in the same cn() call.
 * The density spacing tokens (decision 0020) likewise: unregistered, a caller's
 * `p-0` or `h-9` would sit beside `px-card-x` / `h-row-head` and lose to it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: { spacing: ["card-x", "card", "cards", "gutter", "row-head", "cell"] },
    classGroups: {
      "font-size": [{ text: ["display", "metric", "title", "heading", "eyebrow", "body", "body-sm"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
