# 0028 — Money flow: which sectors money is moving into

**Date:** 2026-10-05 · **Status:** done · Spec: [money flow](../superpowers/specs/2026-10-05-money-flow-design.md) · Plan: [plan](../superpowers/plans/2026-10-05-money-flow.md)

## Problem

The owner wants to see where money is moving in the market. Top volume answers "which stocks
traded the most", but not "which parts of the market are suddenly busier or quieter than
usual". Banks always trade the most rupees, so a raw ₹ ranking says nothing about a change.

## Options and decisions

| Choice | Options | Decision | Why |
|---|---|---|---|
| Where | A tab in Top volume; a new page | **New page** "Money flow" (owner's pick) | Top volume answers "which stocks?", this "which sectors?"; apart, both read clearly |
| Compared with | Other sectors only; the sector's own past | **Its own normal**, plus its share of all trading | "2× normal" is a change; share shows money moving between sectors |
| Normal | Long average; the months just before | **63 sessions just before the window** | Never compares a busy week with itself; recent enough to mean "usual now" |
| New listings | Guess a normal; leave out | **Out of the ratio, in the share** (needs 40 of 63 sessions) | Their rupees are real, but they have no "usual" to compare with |
| Small sectors | Show; fold into "Other"; leave out | **Leave out under 5 stocks**, named in the footer | One stock is not a sector; "Other" would mix unrelated businesses |
| Direction | Average move; median move | **Median move of its stocks**, colouring the bar | One wild stock can't paint a sector green |
| Stored | Per sector; per stock | **Per stock** (`money_flow`), summed on the page | The drill-down needs the stocks anyway; one source for both views |
| Universe | Whole market; Nifty Total Market | **Nifty Total Market (~750)** | NSE publishes sectors only for index members; same as Top volume |

## What we built

`src/indicators/money-flow.ts` (pure, tested: windows, per-stock stats, sector sums, the
drill-down), `compute-money-flow.ts` (nightly, after Top volume, ~8 s), `money_flow` table,
`/money-flow` page with 1 day / 1 week / 1 month, sector bars against a 1× line, share now vs
usual, and a sector's stocks by extra rupees. Hotkey `m`. Glossary: money flow, trading vs
normal, share of trading. Top volume's move rule moved into a shared `windowMove`.

## Checks

Tests for every rule above, including a renamed stock whose normal reaches back into its old
symbol. Live check: Metals & Mining's week to 1 Oct 2026 recomputed by independent SQL,
0.9301× in both.

## Limits

- Sectors are today's NSE list; that's right for "now", but not for history.
- Heavy trading can be selling as much as buying; the page says so and never predicts.

## Revisit when

A history chart per sector is wanted (TODO), or NSE publishes sectors beyond index members.
