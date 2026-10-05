# 0031 — Project agents: quant advisor, lead engineer, technical lead

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

## Added the same day: `lead-engineer`

The owner asked "where is my lead software engineer agent?" The engineering side had the same
gap: architecture and system-design judgement lived only in the builder's head. A second
advisor, `.claude/agents/lead-engineer.md` (15+ years in data systems; the project's eight
engineering principles baked in; read-only database access including the health and index
tools; writes only under `docs/proposals/`), now reviews every spec for data model, keys vs
reads, pipeline placement, failure isolation, a simpler alternative and the tests that must
exist, and works the engineering roadmap (`TODO-engineering.md`) on demand. The main session
remains the technical lead who builds and merges; the two advisors are separate voices.

## Added the same day: `technical-lead` (a builder, not an advisor)

The owner asked for the technical lead to be an agent too. An agent cannot talk to the owner
mid-task, so this one is scoped to what needs no conversation: given an **approved** spec, it
writes the plan, builds test-first on a branch following the fixed workflow, runs the result on
real data with an independent spot-check, writes the decision file and docs, and hands back a
branch "ready for independent review". It never merges, pushes, deletes data, restarts the
owner's site, or approves its own spec; with no approved spec it writes one and stops. The
main session keeps the conversation, spec approval, the independent review and the merge, so
the builder, the reviewer and the merger stay separate.

## Why

A proposer who cannot build has no reason to prefer easy ideas, and a brief that carries the
project's traps (survivorship, look-ahead, multiple testing, the t ≥ 3 bar) makes it a
second line of defence against a flattering study. Read-only access means it can estimate
sample sizes from real data but can't change anything.

## Revisit when

Its proposals turn out consistently unusable (too academic, too vague), or the owner widens
the data scope.
