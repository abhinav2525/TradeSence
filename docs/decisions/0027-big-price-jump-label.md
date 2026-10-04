# 0027 — A "Big price jump" label on Unusual activity

**Date:** 2026-10-05 · **Status:** done · Research: [0005](../research/0005-volume-or-jump.md)

## Problem

Unusual activity flags stocks with huge volume. A reader naturally takes huge volume on a
rising stock as a sign, either "danger, it will fall" (study 0004 found those days lagged)
or "strong, buy". Study 0005 showed both readings are wrong: same-size jumps on ordinary
volume lagged at least as much, so the volume isn't what goes with the weaker month. The
size of the price jump is. The page gave no hint of that.

## Options

| Option | For | Against |
|---|---|---|
| A caution line on every "Huge volume" row | Visible | Blames the wrong thing (study 0005) |
| Nothing | No risk of over-claiming | Leaves the misreading in place |
| **Label big jumps, explain once in the glossary** | Points at what the research supports; facts, not a prediction | One more badge |

## Decision

- Rows whose price rose **8% or more** that day carry an outlined **"Big price jump"**
  badge, on the page and on each stock's "Unusual days" card. 8% is the edge of study
  0005's big-jump bands; it is a display label, not a tuned signal.
- A **"Big price jumps only"** filter (`?move=big`, checked with strict comparisons like
  every other parameter) with its count.
- One sentence under the page heading, and a glossary entry (`big-price-jump`) with the
  study's numbers: after a +10% day the next month ran about 1.6 points behind a similar
  stock that hadn't jumped in 2016–22, about 0.9 since 2023. The "Huge volume" entry gains
  the matching "common mistake".

## Why

It corrects a likely misreading using only what the study supports, and it says plainly
that the give-back has shrunk since 2023 and is an average, not a forecast for one stock.
Falls aren't labelled: the study only looked at up days.

## Revisit when

Re-running study 0005 changes the jump numbers (update the glossary text), or a follow-up
study fixes a different threshold.
