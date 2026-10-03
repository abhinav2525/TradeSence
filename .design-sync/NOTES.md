# design-sync notes (tradeSence → Claude Design)

tradeSence is a Next.js 16 **app**, not a published component package. Everything below
exists to make its `src/components` work as a design system outside Next.js.

## How the build is wired

- **No dist, no .d.ts.** The entry is the hand-kept barrel `.design-sync/entry.ts`
  (passed as `--entry`): the converter's synth mode uses `export *`, which drops default
  exports, and nearly every component is a default export. **Add a line there when a
  component is added or renamed**, plus its `componentSrcMap` and `docsMap` entries.
- **Props** come from `tsc`-generated declarations (`.design-sync/tsconfig.types.json` →
  `.design-sync/.cache/types`), read by the fork `.design-sync/overrides/dts.mjs`
  (`libOverrides`). The fork needs `ln -sfn ../.ds-sync/node_modules .design-sync/node_modules`
  on every fresh clone.
- **CSS** is the app's own `globals.css`, compiled by Tailwind v4 via
  `.design-sync/build-css.mjs` (entry `.design-sync/ds.css`), scanning the whole repo plus
  `.design-sync/previews`. **Re-run it after adding classes in previews** - a class used
  only in a preview is absent until the CSS is rebuilt.
- `buildCmd` runs both (CSS, then types). Full build:
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/entry.ts --out ./ds-bundle`
- **Playwright**: chromium-1161 is cached in `~/Library/Caches/ms-playwright`; it matches
  `playwright@1.51.1`, installed into `.ds-sync/` (not the app).

## Re-syncing (one command after setup)

```sh
S=<design-sync skill dir>; cp -r "$S"/package-build.mjs "$S"/package-validate.mjs "$S"/package-capture.mjs "$S"/resync.mjs "$S"/lib "$S"/storybook .ds-sync/
# fresh clone only: (cd .ds-sync && npm i esbuild ts-morph @types/react playwright@1.51.1); ln -sfn ../.ds-sync/node_modules .design-sync/node_modules
node .design-sync/build-css.mjs && rm -rf .design-sync/.cache/types && bunx tsc -p .design-sync/tsconfig.types.json
# fetch _ds_sync.json from the project into .design-sync/.cache/remote-sync.json, then:
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/entry.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```

Project: `tradeSence Design System` (`c759bac7-c44e-4385-8c80-83ca2589f730`). First sync 3 Oct 2026:
45 components; 21 with authored, graded previews; 12 on the floor card ("preview not yet
authored"): AdRecentTable, CrashTable, DateNav, DatePicker, DrawdownChart, ForwardReturns, Hotkeys,
RiskCalculator, ScreenerTable, SiteNav, StockChecks, StockPriceChart. The other 12 render without an
authored preview. All 45 are importable either way; floor cards are authorable on any re-sync.

## Fixes made for the bundle

- `process is not defined`: Next's client code reads `process.env.__NEXT_*`.
  `.design-sync/process-shim.ts` gives an empty env; imported first in `entry.ts`.
- `invariant expected app router to be mounted` (DatePicker, Hotkeys use `useRouter`):
  `ThemeRoot` (`.design-sync/theme-root.tsx`, the `cfg.provider`) supplies a no-op
  `AppRouterContext`. It also applies `dark` + `bg-background text-foreground font-sans`,
  the app's `<html class="dark">`/body setup.
- MaTabs imported `MA_LABELS` from `src/query/breadth.ts`, which opens the database:
  moved to `src/lib/ma.ts` (app commit, re-exported from breadth.ts).
- `Term`'s `id` (a 34-member glossary union) is flattened to `unknown` by the extractor:
  hand-written in `cfg.dtsPropsFor.Term`. **Regenerate that union when the glossary changes.**
- Geist: next/font self-hosts it only inside Next; `ds.css` loads it from Google Fonts and
  sets `--font-geist-sans` / `--font-geist-mono` (`[FONT_REMOTE]` is expected).
- Groups come from frontmatter-only stubs in `.design-sync/groups/*.md` via `docsMap`.

## Authoring previews (learned on LightDot, Readout, Card)

- Import from `"tradesence"`; the converter wraps every cell in `ThemeRoot` (dark).
- Give each cell a fixed-width wrapper (`style={{ width: 420, padding: 16 }}`), or the
  card stretches to the full grid width.
- Use realistic NSE/NIFTY 50 figures and the app's own copy style: dates "1 Oct 2026",
  true minus "−", signed values with arrows/words. Never copy mockup numbers.
- Page-specific components need data in the shape of their real types
  (`src/query/*`, `src/indicators/*`); read the page in `src/app/` that renders them.
- Floor cards that render blank with no data (CrossingsBars) count as `bad` - author them.

- Preview cells render about 760 px wide in the review sheet; keep wrappers at 760 px or less.
- Recharts is not exported from "tradesence". ChartContainer previews draw a small hand-written
  SVG child (ChartContainer's ResponsiveContainer passes it width/height); ChartLegendContent and
  ChartTooltipContent render standalone given `payload` (+ `active`).
- Only `--chart-1` and `--chart-muted` exist; a second series uses `var(--muted-foreground)`.
- Chart previews start with a small `window.matchMedia` override reporting reduced motion: the
  capture freezes the clock mid draw-in, and Recharts `LabelList` labels only appear after the
  animation. The app's `useChartAnimation` then skips animation. Preview cards only - designs
  still animate. Keep it at the top of every chart preview.
- Portalled overlays (Popover, Term's popover, DatePicker) render into <body>: `ThemeRoot`
  mirrors `dark` onto <html> so they match. Term has no `open` prop, so it can't be previewed open;
  the Popover card shows a Term-style explainer instead.
- ReturnBuckets needs >= 520 px or Recharts drops the first x-axis label.
- In the dark theme, mid-range dates in a selected Calendar range are low-contrast (component styling).

## Known render warns

- `[GRID_OVERFLOW]` resolved with `cardMode: "column"` on the 18 wide components (config).

## Re-sync risks

- `entry.ts`, `componentSrcMap`, `docsMap` are enumerations: a new component is silently
  missing until added to all three.
- `dtsPropsFor.Term` inlines the glossary id list; it goes stale when the glossary grows.
- Previews carry hand-written sample data shaped like `src/query/*` types; a type change
  breaks the preview compile (the component falls back to its floor card).
- `process-shim.ts` and the stand-in router depend on Next 16 internals
  (`next/dist/shared/lib/app-router-context.shared-runtime`); a Next upgrade may move them.
