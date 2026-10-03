# 0016 — The chart tooltip's colour square used Tailwind v3 syntax

**Date:** 2026-10-03 · **Status:** done

## Problem

The small coloured square next to each value in a chart tooltip (`src/components/ui/chart.tsx`)
used the classes `border-[--color-border] bg-[--color-bg]`. That is **Tailwind v3** syntax.
Tailwind v4 (which this project uses) silently ignores it, so the square was drawn with
no colour. It's the same trap as the date picker in decision 0010. It was found by the
`/folder-claude-md` run, which read every UI component.

## Options

| Option | Good | Bad |
|---|---|---|
| **Rewrite to v4 syntax `border-(--color-border) bg-(--color-bg)`, plus a test** ✅ | The square gets its colour; the test catches the next one | None |
| Fix the one line only | Quick | The next `bunx shadcn add` can bring the bug back unnoticed |

## Decision

Rewrite the line. Add `tests/tailwind-v4.test.ts`, which fails on any `utility-[--var]` class
anywhere in `src`. Setting a variable, as in `[--cell-size:2rem]`, is valid v4 and stays allowed.

## Why

Tailwind gives no warning for this mistake: the class just does nothing. Only a test that
reads the source can catch it. It fails first on exactly `chart.tsx:213`.

## Revisit when

A new shadcn component is added: the test will name any v3 leftovers it brings.
