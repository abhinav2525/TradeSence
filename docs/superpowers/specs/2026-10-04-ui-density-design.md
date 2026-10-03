# UI density: compact by default, comfortable on request — design

**Date:** 2026-10-04 · **Status:** awaiting owner review · **Path:** architectural

## Intent (agreed)

- **Why:** the dashboard shows too little per screen. The owner wants it denser everywhere.
- **Owner's brief:** card padding 20 → 12 body / 16 header; gaps between cards and tiles
  16 → 12; page gutter from `lg` 32 → 20; `display` 64 → 48, `metric` 28 → 22, `body` 14 → 13,
  `body-sm` 13 → 12; table rows ~40 → 28 including the sticky header; on Breadth the four tiles
  in one row under the hero instead of a 2×2 beside it; chart heights −30%. A
  `data-density="compact|comfortable"` attribute on `<html>` swaps all of this, compact by
  default. Update `docs/design/system/README.md`. Colour, contrast, motion and voice unchanged.
- **Owner's choices (2026-10-04):** a sidebar toggle plus a key, remembered per browser and
  applied before first paint (like the theme); hero layout = hero full width, four tiles in one
  row beneath it (also on Advance/Decline, same pattern).
- **Success:** `compact` matches the brief's numbers; `comfortable` renders exactly as today;
  switching never jumps the page on load; no component keeps a raw px value for anything the
  switch controls.

## Approach

Each controlled value becomes a CSS custom property set per density in `globals.css`
(`:root` and `[data-density="compact"]` hold compact; `[data-density="comfortable"]` holds
today's values). Tailwind reads them through named theme tokens, so components use names
(`text-body-sm`, `px-card-x`, `gap-cards`) instead of pixels. Layout differences use a
`compact:` custom variant. Rejected: a React context with class swaps (a flash before
hydration, every component re-rendering); a second stylesheet (two sources of truth).

## Tokens

| Token (utility) | Compact | Comfortable (today) | Replaces |
|---|---|---|---|
| `text-display` | 48px / 1 | 64px / 1 | value change only |
| `text-metric` | 22px / 28px | 28px / 32px | value change only |
| `text-body` (new) | 13px / 20px | 14px / 20px | `text-sm`, the `<body>` default |
| `text-body-sm` (new) | 12px / 18px | 13px / 20px | every `text-[13px]` (70 uses) |
| `--spacing-card-x` (`px-card-x`) | 16px | 20px | card side inset (`px-5` in cards) |
| `--spacing-card` (`py-card`, `pb-card`) | 12px | 20px | card body vertical padding |
| `--spacing-cards` (`gap-cards`) | 12px | 16px | `gap-4` between cards and tiles |
| `--spacing-gutter` (`lg:px-gutter`) | 20px | 32px | `lg:px-8` in `AppShell` |
| `--spacing-row-head` (`h-row-head`) | 28px | 36px (amended while planning: `h-9`, what the tables use) | sticky table headers |
| `--spacing-cell-y` (`py-cell`) | 4px (amended while building: 5px gave 31px rows) | 10px | table cell `py-2.5` / `py-2` |
| `--chart-scale` | 0.7 | 1 | each chart's fixed height, as `h-[calc(Npx*var(--chart-scale))]` |

**Side inset (default chosen, owner can overrule):** the brief's "16 header / 12 body" is applied as vertical
padding with one shared side inset (16px compact), so header, body, table first column and
footer text stay on one vertical line. Applying 16/12 to the sides would misalign them by 4px.

`caption`, `label`, `eyebrow`, `table-head` and `badge` sizes are unchanged (the brief names
only the four). In compact, `body-sm` and `caption` are both 12px; the hierarchy then rests on
weight and colour, which those styles already carry.

**Amended while planning and building** (decision 0020 has the detail): the card header top
stays `pt-4` (no token); `px-card-x` also replaces `pl-5`/`pr-5`; stat tiles keep their padding;
heroes keep `sm:p-6` in comfortable; `<body>` keeps no text size; `body-sm` sits on a 1.5 line;
comfortable tables are ~1px per row taller, the three hand-built ones ~4px.

## Switching

- Server renders `<html data-density="compact">`. `PREPAINT_SCRIPT` sets it from
  `localStorage.density` (`compact` | `comfortable`) before first paint, as it does the theme.
- `DensityToggle` (sidebar, under `ThemeToggle`; compact icon-only form in the mobile top bar,
  like the theme): flips the attribute and stores it. Label shows the other choice, decided
  by the `compact:` variant (no React state, so server and client agree).
- Key **d** toggles it (`Hotkeys`, beside `t`), listed in the sidebar shortcuts.

## Layout

- **Breadth (`src/app/page.tsx`) and Advance/Decline:** compact → hero `xl:col-span-12`, tiles
  `xl:grid-cols-4` in one row beneath; comfortable → today's 7/5 split with a 2×2.
- Gaps between cards/tiles (`gap-4` in page grids and `Readout`) → `gap-cards`.

## Out of scope

Colours, contrast, motion durations, copy; the Claude Design project (re-sync offered after);
any new layout beyond the hero row.

## Tests (written first)

- `globals.css`: every density variable (`--spacing-card*`, `--spacing-cards`, `--spacing-gutter`, `--spacing-row-head`, `--spacing-cell-y`, `--chart-scale`, the four type sizes) is set in both the compact and comfortable blocks; the new sizes exist
  in `@theme`; `text-body`/`text-body-sm` are registered with tailwind-merge (`cn("text-body-sm
  text-foreground")` keeps both).
- `PREPAINT_SCRIPT` sets `compact` with nothing stored, `comfortable` when stored, and survives
  blocked storage; `toggleDensity()` flips the attribute and stores it.
- No `text-[13px]` and no `text-sm` left in `src/`; no fixed `h-[Npx]` on a `ChartContainer`
  in chart components; `AppShell` has no `lg:px-8`.
- Existing suites (motion, tailwind-v4, glossary, hotkeys) stay green.
- Visual: Breadth, Advance/Decline, Screener, a Report Card, in both densities × both themes,
  before/after screenshots.

## Documentation

`docs/design/system/README.md` (type scale, space, tables, charts, a "Density" section);
`docs/decisions/0020-ui-density.md` + README row; root `CLAUDE.md` "Theme and tokens" (density
attribute, new tokens, the tailwind-merge rule now covers `body`/`body-sm`).
