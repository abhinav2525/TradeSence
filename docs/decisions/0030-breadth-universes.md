# 0030 — Breadth beyond the NIFTY 50

**Date:** 2026-10-05 · **Status:** done · Spec: [breadth universes](../superpowers/specs/2026-10-05-breadth-universes-design.md) · Plan: [plan](../superpowers/plans/2026-10-05-breadth-universes.md) · Approved by Claude as technical lead under the owner's overnight delegation

## Problem

The Breadth page only covered the NIFTY 50. The owner asked for the same reading on other
indices, "like in volume". The catch: for the NIFTY 50 we keep a hand-made list of who was
in the index on every day since 2020; for every other index we only have *today's* list.
Drawing a 2021 chart from today's members would count companies that later grew into the
index and leave out ones that fell out — the past would look healthier than it was
(survivorship bias), with nothing on the chart to warn the reader.

## Options

| Option | For | Against |
|---|---|---|
| Today's lists, drawn back to 2016 | Long history for every index at once | Quietly biased; the owner explicitly preferred honest numbers |
| **Whole market chosen day by day** + **today's lists saved from now on** | Honest everywhere; long history where it can be honest | Index lists start with one day of history |
| Rebuild every index's membership history by hand | Honest long history | Thousands of changes; not feasible |

## Decision

- **Whole market:** every NSE company (ETFs out) whose median trading over the last 20
  sessions was at least ₹1 crore *on that day*, counted day by day since 2016 (the 200-day
  line starts in July 2017, once 200 sessions exist). About 1,300 companies today.
- **NSE index lists** (Nifty Total Market 750, Nifty 500, Midcap 150, Bank Nifty and 38
  more): today's members, one reading saved each night from 1 Oct 2026. Never drawn
  backwards. NSE's own NIFTY 50 file is left out — the point-in-time NIFTY 50 already exists.
- **Same averages as the NIFTY 50**, from one shared function (`adjustedAverages`).
- **Storage:** `breadth_daily` (universe, average, day, above, total), keyed by the page's
  read. **Written by "insert or update" only — nothing is ever deleted** (the owner's rule
  for this work). A backup was taken and verified before any change.
- **Page:** a "Breadth of" selector on the Breadth page; the NIFTY 50 view is unchanged.
  While an index's history is under 20 sessions, the page says "history building" instead
  of a percentile, so day one can't read as "rarer than every session".

## Checks

- The shared averages reproduce all 475,515 stored NIFTY 50 averages exactly (66 symbols).
- The new counting engine, pointed at the point-in-time NIFTY 50 membership, reproduces the
  existing Breadth page on all 5,034 daily readings (3 averages since 2020), zero differences.
- A test proves a row saved on an earlier night survives a rebuild.
- First run (18 s): on 1 Oct 2026, 46.9% of liquid companies were above their 200-day
  average; Nifty 500 37.9%, Midcap 150 33.1%, Bank Nifty 21.4%.

## Limits

- Index lists' history only grows from 1 Oct 2026. A percentile appears after 20 nights.
- If a past day ever stopped qualifying (data corrected), its old row would stay, since this
  feature never deletes. A clean-up, if ever needed, is the owner's call.

## Revisit when

NSE publishes index membership history in a form we can download, or the owner wants a
"today's members, drawn backwards" view clearly labelled as such.
