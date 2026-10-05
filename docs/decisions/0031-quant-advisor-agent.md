# 0031 — A quant hedge-fund advisor as a separate agent

**Date:** 2026-10-05 · **Status:** done

## Problem

Ideas for what to measure and study next came from one place: the technical lead (Claude)
in the middle of building. That mixes "what's worth testing" with "what's easy to build",
and it puts the person proposing a signal and the person testing it in the same head. The
owner asked for a separate voice: a quant hedge-fund expert with 15 years' experience who
suggests indicators, research worth doing, and what information the app should show.

## Options

| Option | For | Against |
|---|---|---|
| Keep asking the main session | Nothing to set up | Same blind spots; build bias |
| **A dedicated agent with a fixed brief** | Separate perspective on demand; reviews every spec; house rules baked in | One more thing to maintain |
| A human advisor | Real experience | Cost and availability |

## Decisions (owner's answers, 5 Oct 2026)

| Question | Decision |
|---|---|
| Role | **Advise and write proposals**: suggests, drafts study proposals with rules fixed before results; never writes code or changes data |
| Stance | **Both tracking and predictive ideas, with honest testing**: predictive claims go through a study; tracking ideas ship as facts |
| Data scope | **Only data we already hold** (no new sources, no paid data) |
| When | **On demand, plus a review of every new spec before the owner approves it** |

Mechanics: `.claude/agents/quant-advisor.md` (strongest model; tools limited to reading the
repo, read-only database queries through the `claude_ro` MCP user, and writing under
`docs/proposals/` only). The technical lead asks it to review each spec before presenting
the spec to the owner, and records "quant review: proceed / changes / don't" in the spec.

## Why

A proposer who cannot build has no reason to prefer easy ideas, and a brief that carries the
project's traps (survivorship, look-ahead, multiple testing, the t ≥ 3 bar) makes it a
second line of defence against a flattering study. Read-only access means it can estimate
sample sizes from real data but can't change anything.

## Revisit when

Its proposals turn out consistently unusable (too academic, too vague), or the owner widens
the data scope.
