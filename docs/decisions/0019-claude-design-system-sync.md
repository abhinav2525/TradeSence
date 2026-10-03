# 0019 — The tradeSence design system in Claude Design

**Date:** 2026-10-03 · **Status:** done

## Problem

The owner wanted Claude's design tool (claude.ai/design) to design new screens with
tradeSence's real components, colours and fonts instead of generic ones. The sync tool
(`/design-sync`) expects a published component **package**: a library with its own build,
type files and usually a Storybook. tradeSence is a Next.js **app** with none of those, and
several of its components only work inside Next.js.

## Decisions

1. **Sync all 45 components; write graded previews for 21.** The owner picked "everything"
   for the import and the core ~20 for hand-written, visually graded preview cards (the
   `ui/` primitives, readouts, charts and tables). The other 24 are fully usable by the design
   agent; 12 page sections show a plain "preview not yet authored" card that a later sync
   can fill in.
2. **A fresh Claude Design project**, "tradeSence Design System". The existing "Design
   System" projects were left untouched.
3. **Make the app's components work outside Next.js without changing them**, all in
   `.design-sync/` (details in `.design-sync/NOTES.md`):
   - an explicit entry file, because the tool's fallback skipped every default export;
   - type files generated with `tsc` and read by a small, declared copy of the tool's type
     reader, so the design agent sees each component's real props;
   - the app's own `globals.css` compiled by Tailwind into the shipped stylesheet, with
     Geist loaded from Google Fonts (inside the app, Next.js self-hosts it);
   - a `ThemeRoot` wrapper that does what the app's `<html class="dark">` does, plus a
     stand-in router so components that navigate don't crash;
   - an empty `process.env`, because Next's link and router code expects one.
4. **One small app change:** `MaTabs` imported its labels from `src/query/breadth.ts`, which
   opens the database, so it could never run in a browser. The labels moved to the pure
   `src/lib/ma.ts`; `breadth.ts` re-exports them, so nothing else changed (owner's choice
   over leaving MaTabs out).
5. **Chart preview cards draw without animation.** The tool screenshots with a frozen
   clock, catching charts half-drawn. The chart previews report "reduced motion" to their
   own card, which the app's motion code already respects. Designs still animate.

## Problems met while building it

- `process is not defined` broke every export; fixed by the empty env shim.
- `invariant expected app router to be mounted` (DatePicker, Hotkeys); fixed by the
  stand-in router in `ThemeRoot`.
- Popovers rendered in the light theme because they attach to `<body>`, outside the dark
  wrapper; `ThemeRoot` now mirrors `dark` onto `<html>`, as the app does.
- The type reader dropped `| null` from props (e.g. `LightDot`'s `light`); fixed by turning
  on null checks in the copied reader.
- `Term`'s glossary id list was too long for the type extractor; written by hand in the
  config and must be updated when the glossary grows.
- Classes used only in a preview are missing until the stylesheet is rebuilt.

## Result

45 components, 21 graded previews (every cell graded good), 0 broken in the render check,
uploaded with a sync record so re-syncs only re-check what changed. A short guide for the
design agent (`.design-sync/conventions.md`) heads the uploaded README.

## Revisit when

- A component is added or renamed: add it to `entry.ts`, `componentSrcMap` and `docsMap`.
- Next.js is upgraded: the env shim and stand-in router depend on Next internals.
- The glossary grows: regenerate `dtsPropsFor.Term`.
