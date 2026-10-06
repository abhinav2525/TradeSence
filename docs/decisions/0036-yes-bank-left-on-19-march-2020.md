# 0036 — Yes Bank left the indices on 19 March 2020, not 27 March

**Date:** 2026-10-06 · **Status:** done

## Problem

Both hand-kept membership files dated Yes Bank's exit from the NIFTY 50 and Nifty Bank to
27 March 2020, the date in NSE Indices' February 2020 review. While rebuilding Nifty
Financial Services' history, a sweep of every 2020 announcement found a 16 March 2020
release: after the Yes Bank reconstruction scheme, NSE **brought the removal forward to
19 March 2020**, with Shree Cement (NIFTY 50) and Bandhan Bank (Nifty Bank) entering the
same day. Six trading days (19–26 March 2020) were therefore counted on the wrong members.
The same sweep showed NSE then **deferred the rest of the March 2020 review to 26 June 2020**
because of COVID, which matters for Nifty Financial Services (its first change is 26 June,
not 27 March) and is recorded in that index's file.

## Decision

Correct both files (YESBANK `removed_on` 2020-03-19; SHREECEM and BANDHANBNK `added_on`
2020-03-19; source `ind_prs16032020`) and reload them under the standing rule (decision 0034:
that index's rows only, one transaction, counts checked on every day). Breadth, Advance/Decline,
Crossings, the Screener and Report Card peers read membership at query time, so the pages
corrected themselves on reload; nothing else was recomputed.

## Checks

The validators pass (50 members on every day; 12 then 14 for Nifty Bank); the live tests
against NSE's lists pass; the database rows for the three stocks show the new dates.

## Lesson

Announced effective dates are not always the real ones. For any membership row, the source
should be the release that made the change effective, not the one that first announced it.
