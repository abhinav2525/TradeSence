import * as React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

// Components that navigate (DatePicker, Hotkeys) call next/navigation's
// useRouter, which throws outside a Next.js app. Outside the app there is no
// page to go to, so navigation is a no-op.
const noop = () => {};
const STAND_IN_ROUTER = { back: noop, forward: noop, refresh: noop, hmrRefresh: noop, push: noop, replace: noop, prefetch: noop };

/**
 * The app's root setup, for anything rendered outside Next.js (Claude Design
 * previews and designs). In the app, layout.tsx puts `dark` on <html> and the
 * body takes the page colours; tokens switch under `.dark`, so without this
 * wrapper components render in the light palette on a white page.
 * `theme="light"` gives the light palette. It also supplies a stand-in router,
 * so components that navigate render instead of throwing, and mirrors the theme
 * onto <html> so portalled overlays (popovers, the date picker) match.
 */
export function ThemeRoot({
  theme = "dark",
  className,
  style,
  children,
}: {
  theme?: "dark" | "light";
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  // Popovers and the date picker render through a portal into <body>, outside
  // this wrapper; the app has `dark` on <html>, so mirror that here or every
  // overlay shows the light palette on a dark page.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    return () => {
      if (had) root.classList.add("dark");
      else root.classList.remove("dark");
    };
  }, [theme]);

  return (
    <AppRouterContext.Provider value={STAND_IN_ROUTER as unknown as React.ContextType<typeof AppRouterContext>}>
      <div className={theme === "dark" ? "dark" : undefined}>
        <div className={`bg-background text-foreground font-sans antialiased${className ? ` ${className}` : ""}`} style={style}>
          {children}
        </div>
      </div>
    </AppRouterContext.Provider>
  );
}
