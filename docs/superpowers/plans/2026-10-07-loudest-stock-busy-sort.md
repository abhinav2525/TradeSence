# Plan: loudest stock (Money flow) and "Unusually busy" (Top volume)

**Spec:** `docs/superpowers/specs/2026-10-07-loudest-stock-and-busy-sort-design.md` (approved 7 Oct 2026; the
"Main session's changes after both reviews" list and the lead engineer's required items override the body).
**Branch:** `feat/loudest-stock-busy-sort`. Backup taken first: `~/Backups/tradesence/tradesence-2026-10-07-181026.dump`.

## Global Constraints (from the spec and CLAUDE.md)

- One normal rule for both pages: `normalDaily(h, from, to)` exported from `money-flow.ts`; `windowStat` calls it;
  `compute-volume-leaders.ts` calls it (not `volume-leaders.ts`, which `money-flow.ts` imports).
- Normal window for Top volume period p = `days[p]` … `days[p+62]` (newest first), exactly as `flowWindows`.
  `computeVolumeLeaders` reads 126 + 63 = 189 sessions.
- × normal = turnover ÷ (normal_daily × period), never the stored `sessions`.
- Busy floor `BUSY_FLOOR_RS = 5e7` (≥ is ranked). Filters apply before the floor; left-out count from the same rows.
- "Unusually busy" offered on 1/5/21 only; 3- and 6-month tabs keep the column, headed "× normal (3 months before)".
- `weeklySectorFlows` unchanged. `sectorFlows` keeps its sort; the toggle re-sorts with a separate pure `sortSectors`.
- Params: `loud` on only for exactly `"hide"`; `rank` exactly `"shares"` / `"busy"`, else `"value"`.
- No `sql.raw`; tokens only; `<Term>` never inside a link; float comparisons strict as the spec defines (`>` normal).
- `volume_leaders` stays a replace-in-one-transaction derived table; no manual edits; migration via `db:generate`.

## Tasks

1. **Money flow maths** (`tests/money-flow.test.ts` first): `normalDaily` export; `SectorFlow` gains `busier`,
   `counted`, `loudest`, `ratioWithoutLoudest`; `sortSectors(sectors, hide)`; `marketBusier(rows)`; `cleanLoud`.
2. **Top volume normal** (`tests/volume-leaders.test.ts` first): schema column + migration; compute with 189
   sessions; renamed-stock normal covers the old ticker; 126-session normal filled with 189+ sessions; 39 traded
   sessions → null; shared-fixture test that Top volume normal = Money flow normal for 1/5/21.
3. **Top volume query** (`tests/volume-query.test.ts` first): `normalDaily`, `busyRatio`, `rank: "busy"` with floor
   boundary (exactly ₹5 crore ranked, one rupee under not), filters before floor, `leftOut`; `cleanRank`.
4. **Pages**: Money flow toggle + FlowBars text + whole-market line + caveat; Top volume third segment, × normal
   column, Shares line, left-out line, 1-day note, short-session note.
5. **Glossary**: `busier-count`, `loudest-stock`, `times-normal`.
6. **Real data**: migrate, `bun run volume-leaders`, re-check worked examples, normal parity query.
7. **Screens**: :3100, wide/phone, light/dark.
8. **Docs**: decision 0040 + README row, pipelines.md, README function reference, folder CLAUDE.md, TODO.md,
   TODO-research.md.

## Review Focus

- The two normals are one function and the same session windows (parity check numbers in the ledger).
- The 189-session lookup: 63/126 normals actually filled.
- Floor boundary and that filters apply before the floor; left-out count matches.
- The toggle never changes `weeklySectorFlows` or the default sort.
- Copy honesty: "always lowers" is not strictly true (see ledger ruling).
