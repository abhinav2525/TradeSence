# Engineering review: Bank Nifty and Nifty Financial Services spec

**Spec:** `docs/superpowers/specs/2026-10-05-bank-finservice-indices-design.md` · **Reviewer:** lead-engineer · **Date:** 2026-10-05
**Verdict: go ahead, with the changes below.** The most important one: **one registry and one set of names per index.**

## 1. Does it fit the project's rules?
Mostly yes. Membership is a join, not a download (rule 1), and history is point-in-time. Two places break a rule quietly:
- **Two names for the same thing.** Breadth already has `u=bank` and `u=financial-services`, built from *today's* lists (decision 0030). The spec adds a second parameter, `index=bank|finservice`, and also says "the selector already exists". That leaves two URLs (`/?u=bank`, `/?index=bank`) giving two different Nifty Bank charts. The spec even uses both spellings ("financial-services" and "finservice").
- **"Report Card for every member" misses two queries.** `src/query/activity.ts` and `src/query/volume.ts` decide `has_card` from NIFTY 50 membership only. A stock that is only in Nifty Bank (FEDERALBNK, say) would get a card that no page links to.

## 2. Data model
- **`index_members`:** about 60–80 more rows (two indices, around 12 changes each since 2020). The key `(index_name, symbol, added_on)` handles a stock that sits in several indices. No migration.
- **`daily_indicators`:** measured today: 158,570 rows, 66 symbols, 43 MB. Fifteen of today's Bank/FinService members aren't NIFTY 50 stocks (35,378 price rows since 2016). With past members added, expect about 40–60k new rows and +15 MB once, then about 5k rows a year. Trivial. Rows are per symbol, so HDFCBANK is still stored once.
- **Delete-and-reload:** I support it as a standing rule, not a one-off exception. The CSV in git is the source of truth, the delete only touches rows with that `index_name`, it runs in one transaction, and both `loadNifty50History` and `ingestIndexLists` already work this way. The real risk is a slip, such as loading the Bank file under `NIFTY50` and wiping the NIFTY 50. Two cheap guards: (a) the file, the index name and the expected counts sit in **one registry entry**, so a caller can't mismatch them; (b) refuse a reload that has fewer rows than are stored, unless `--force` is passed (history only grows), the same idea as `MIN_KEEP` in `index-constituents.ts`.

## 3. Nightly
- **Compute the union once.** Calling `computeIndicators` three times would compute about 10 shared stocks two or three times and print each split warning several times. Have it take every symbol in `index_members` (one query change). Cost: about 5 s today → about 7 s.
- **Isolate it.** In `cli-nightly.ts` this step is the one big step *not* inside a try/catch. If it throws, the index lists, Unusual activity, the audit **and the backup** all skip. Wrap it like its neighbours. The step is growing, so this belongs in the same change.
- **Drift check with no new downloads.** The nightly already fetches `ind_niftybanklist.csv` and `ind_niftyfinancelist.csv` into `index_constituents`. Move the drift check to after that step and compare each file with those rows (only if `fetched_on` is today), instead of writing more fetchers like `fetchNifty50Symbols`.
- **Missed night:** everything here is recomputed in full or upserted, so the next run heals it. One gap: if someone edits a CSV but forgets to run the loader, the database stays stale with no warning. Add a nightly "file and `index_members` differ" warning. Keep the reload itself a manual command, so deletes stay human-started.
- **Audit:** it grows from 50 cards to about 84 (symbol, index) pairs, roughly 2,700 numbers compared. Time it before and after. It runs in its own process, so a slow audit cannot block the backup.

## 4. A simpler shape
The parts are mostly right. The simplification is to **ship in two steps:**
- **Step A:** registry, loader, union compute, then Breadth, A/D, Crossings, Screener and Activity. The queries already take `indexName`; this is mostly wiring the parameter through.
- **Step B:** Report Card and Signals. These change behaviour: the market line becomes the index's own close (today `INDEX = "Nifty 50"` is hard-coded in `signals.ts`, `stock-report.ts` and the audit), cards are chosen per (symbol, index), and the audit grows. Step B is also where the quant advisor's question about small samples applies.

## 5. Your three questions
- **One loader or one per file?** One generalised loader, driven by a registry in TypeScript:
  `{ key: "bank", members: "NIFTYBANK", prices: "Nifty Bank", list: "bank", label: "Nifty Bank", file, sizes }`.
  It also retires the gotcha of three different strings for one index (noted in `src/db/CLAUDE.md`). Copying the loader per file would mean three copies of the validation, one of which goes stale.
- **Where should the expected count per period live?** In that registry, as a dated schedule, e.g. `sizes: [{ from: "2020-01-01", n: 12 }, { from: "<date of NSE's change>", n: 14 }]`. Take the date from the press release; I haven't checked it. Changing the size is a rule change, so it should be a reviewed code change, not a CSV comment. `validateMembershipHistory` already checks every change day; it just looks up the size for that day instead of using a fixed 50.
- **Path segment or query parameter?** **Query parameter.** Every piece of page state today is one (`ma`, `date`, `u`, `set`, `view`), and `MaTabs`, `DateNav` and `Hotkeys` already carry extra parameters through their `extra` prop. A path segment would mean a duplicate route tree, changed bookmarks, and ambiguous URLs like `/stock/[index]/[symbol]`. Keep NIFTY 50 as the default, so every existing URL stays the same. **Use `u` with the existing keys `bank` and `financial-services`** (on Activity, `set` takes the same keys), checked by one shared pure function next to `cleanUniverse`, not copied into each page. Owner choice: should the cross-page hotkeys (`a`, `c`, `s`…) keep the index? `hotkeyTarget` drops it today. I recommend yes.

## 6. Tests that must exist
1. Loader: gap, overlap and a wrong count, each refused before *and* after a size change. The NIFTY 50 file produces exactly today's 66 rows.
2. Loading the Bank file leaves every NIFTY 50 row unchanged. A refused file leaves the stored rows intact.
3. Registry: each entry's `prices` name exists in `index_prices`, its `list` key is in `INDEX_LISTS`, and no key appears twice.
4. Live drift tests for both files, failing on a rebalance on purpose.
5. The shared validator: unknown or injected values fall back to `nifty50`. `hotkeyTarget` carries `u` on the arrows and on 1–3.
6. Each query gets a member that left mid-window, counted only before `removed_on`: A/D, crossings, screener, activity's `member` flag, Report Card peers.
7. Union compute: a shared symbol is computed once, and the NIFTY 50 rows' values are unchanged.
8. `has_card` is true for a stock that is only in Bank, on both /activity and /volume.
9. `/?u=bank` takes the point-in-time path; `/?u=private-bank` still uses today's list.
10. The audit covers every (symbol, index) card with 0 mismatches. Signals for Bank reads the "Nifty Bank" close.

**What I would do first:** write the registry, then generalise the loader against it (tests 1–3). Every later piece reads its names from it, and it is what makes the delete-and-reload safe.
