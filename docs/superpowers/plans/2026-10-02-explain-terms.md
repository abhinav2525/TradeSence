# Explaining Terms in the UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every term on screen has an ⓘ popover (definition, how to read it, today's value, "Read more") and a `/learn/<term>` page (what it is, calculation, worked example, today in tradeSence, mistakes, related terms), all from one typed glossary.

**Architecture:** `src/lib/glossary.ts` is the single source of truth: typed entries keyed by a `TermId` union. A client `<Term>` component renders a label plus an ⓘ shadcn Popover. Learn pages are server components generated from the glossary; `src/query/glossary-live.ts` turns the app's existing queries into one live sentence per term. Pages pass their own live value to `<Term today=…>`.

**Tech Stack:** Bun, TypeScript, Next.js 16 (App Router; `params`/`searchParams` are Promises), shadcn Popover (Radix, already installed), Tailwind v4 tokens, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-02-explain-terms-design.md`

## Global Constraints

- TDD: failing test first, watch it fail, then implement.
- One source of truth: definitions live only in `src/lib/glossary.ts`; components never hard-code a definition.
- `TermId` is a string-literal union; `<Term id>` and `related` are type-checked.
- `short` ≤ 220 characters; every entry has `term`, `topic`, `short`, `read`, `what`, `calc.plain`, `example`, ≥ 1 `mistakes`, ≥ 1 `related`.
- Voice: plain, exact, sentence case, true minus "−", Indian grouping, dates "1 Oct 2026"; education, never a tip. Every Learn page ends with: "Explanations are educational. Nothing in tradeSence is advice to buy or sell."
- Accessibility: ⓘ is a `<button>` named "What is <term>?"; opens on click/Enter/Space; Esc closes; focus returns. Colour is never the only signal.
- No new dependencies. Tailwind v4 syntax only (`(--var)`, never `[--var]`).
- Live examples come from the existing queries; on no data they return `null` and the UI says "Not available for today."
- `/learn/[id]` with an unknown id → `notFound()`; the id is checked against the glossary before anything else.
- Every problem met gets a `docs/decisions/` entry.

## Review Focus

1. **A popover inside a clickable row or link** (e.g. a symbol link): the ⓘ must not trigger the row/link navigation. Pinned in Task 5 by never placing `<Term>` inside a `<Link>`, and the browser check in Task 5.
2. **Popovers near the screen edge or on a phone** must stay inside the viewport and be readable. Pinned in Task 2 (`collisionPadding`, max width) and the Task 5 browser check at 390 px wide.
3. **Live examples on an empty or partial database** (fresh install, no index closes yet) must never throw on a Learn page. Pinned in Task 3 (every id on an empty DB returns null).
4. **A term whose `today` value is a placeholder** ("—", "Not enough history") must not show a misleading "Today: —" line. Pinned in Task 2 (`todayLine` drops placeholders).
5. **Keyboard users** must be able to reach and dismiss every popover without a mouse, and the page hotkeys (b/a/c/s/r/t, ←/→) must not fire while a popover is open or the Learn filter has focus. Pinned in Task 4 (hotkeys ignore events inside `[data-radix-popper-content-wrapper]` and inputs) and the Task 5 browser check.

---

### Task 1: The glossary (`src/lib/glossary.ts`)

**Files:**
- Create: `src/lib/glossary.ts`
- Test: `tests/glossary.test.ts`

**Interfaces:**
- Produces:
  - `type Topic = "Basics" | "Moving averages" | "Breadth" | "Advance/Decline" | "Stocks" | "Risk"`
  - `const TOPICS: Topic[]` (display order)
  - `type TermId` (union of the 28 ids below)
  - `type GlossaryEntry = { id: TermId; term: string; topic: Topic; short: string; read: string; what: string; calc: { plain: string; exact?: string }; example: string; mistakes: string[]; related: TermId[]; seeIt?: { label: string; href: string } }`
  - `const GLOSSARY: Record<TermId, GlossaryEntry>`
  - `isTermId(v: string): v is TermId`
  - `termHref(id: TermId): string` → `/learn/<id>`

- [ ] **Step 1: Write the failing test** (`tests/glossary.test.ts`)

```ts
import { test, expect, describe } from "bun:test";
import { GLOSSARY, TOPICS, isTermId, termHref, type TermId } from "../src/lib/glossary";

const entries = Object.values(GLOSSARY);

describe("the glossary", () => {
  test("every entry is complete", () => {
    for (const e of entries) {
      for (const f of [e.term, e.short, e.read, e.what, e.calc.plain, e.example]) {
        expect(typeof f === "string" && f.trim().length > 0).toBe(true);
      }
      expect(e.mistakes.length).toBeGreaterThanOrEqual(1);
      expect(e.related.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("keys match ids, and every related term exists and isn't itself", () => {
    for (const [k, e] of Object.entries(GLOSSARY)) {
      expect(e.id).toBe(k as TermId);
      for (const r of e.related) {
        expect(isTermId(r)).toBe(true);
        expect(r).not.toBe(e.id);
      }
    }
  });

  test("the popover definition fits (≤ 220 characters)", () => {
    for (const e of entries) expect(e.short.length).toBeLessThanOrEqual(220);
  });

  test("every topic has terms, and every term has a known topic", () => {
    for (const t of TOPICS) expect(entries.some((e) => e.topic === t)).toBe(true);
    for (const e of entries) expect(TOPICS).toContain(e.topic);
  });

  test("covers the terms on screen", () => {
    for (const id of ["sma", "ema", "breadth", "net-advances", "mcclellan", "summation-index", "ad-line", "rana", "drawdown", "volume-ratio"]) {
      expect(isTermId(id)).toBe(true);
    }
  });

  test("text uses a true minus, never a hyphen before a digit", () => {
    for (const e of entries) {
      const text = [e.short, e.read, e.what, e.calc.plain, e.example, ...e.mistakes].join(" ");
      expect(/(^|[\s(])-\d/.test(text)).toBe(false);
    }
  });

  test("isTermId and termHref", () => {
    expect(isTermId("mcclellan")).toBe(true);
    expect(isTermId("nope")).toBe(false);
    expect(isTermId("__proto__")).toBe(false);
    expect(termHref("net-advances")).toBe("/learn/net-advances");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test tests/glossary.test.ts` → FAIL, "Cannot find module '../src/lib/glossary'".

- [ ] **Step 3: Implement** (`src/lib/glossary.ts`, exactly this content)

```ts
/**
 * Every term tradeSence shows, explained once. The ⓘ popovers (<Term>) and the
 * Learn pages (/learn) are generated from this file, so wording can't drift
 * between pages. A new metric needs an entry here before it ships (CLAUDE.md).
 * Decision: docs/decisions/0012-explaining-terms.md.
 */

export type Topic = "Basics" | "Moving averages" | "Breadth" | "Advance/Decline" | "Stocks" | "Risk";
export const TOPICS: Topic[] = ["Basics", "Moving averages", "Breadth", "Advance/Decline", "Stocks", "Risk"];

const IDS = [
  "nifty50", "session", "membership",
  "sma", "ema", "ma-50-200",
  "breadth", "percentile", "five-session-change",
  "advancers-decliners", "net-advances", "rana", "mcclellan", "summation-index", "ad-line", "advancing-share-10d", "breadth-thrust",
  "crossing", "whipsaw", "volume-ratio", "near-the-line",
  "trend-check", "relative-strength", "volatility", "drawdown", "liquidity", "stretches", "adjusted-prices",
] as const;

export type TermId = (typeof IDS)[number];

export type GlossaryEntry = {
  id: TermId;
  term: string;
  topic: Topic;
  short: string;
  read: string;
  what: string;
  calc: { plain: string; exact?: string };
  example: string;
  mistakes: string[];
  related: TermId[];
  seeIt?: { label: string; href: string };
};

const ID_SET: ReadonlySet<string> = new Set(IDS);
export const isTermId = (v: string): v is TermId => ID_SET.has(v);
export const termHref = (id: TermId) => `/learn/${id}`;

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  nifty50: {
    id: "nifty50", term: "NIFTY 50", topic: "Basics",
    short: "India's benchmark index: 50 of the largest, most traded companies on the NSE, weighted by the value of their freely traded shares.",
    read: "When people say \"the market\", they usually mean this index.",
    what: "The NIFTY 50 is maintained by NSE Indices. It is reviewed twice a year (effective end of March and end of September), when weaker companies can be replaced by stronger ones. tradeSence uses the index's real membership on each day since 2020, so companies count only while they were members.",
    calc: { plain: "Each company counts in proportion to its free-float market value: its share price times the shares available to the public. Bigger companies move the index more." },
    example: "If a company is 9% of the index, a 1% rise in that company alone lifts the NIFTY 50 by about 0.09%.",
    mistakes: ["Assuming the index's direction tells you what most stocks did. A few heavyweights can move it while most stocks go the other way. That's what breadth and advance/decline measure."],
    related: ["breadth", "membership", "advancers-decliners"],
    seeIt: { label: "Breadth", href: "/" },
  },
  session: {
    id: "session", term: "Trading session", topic: "Basics",
    short: "One trading day on the NSE. Weekends and exchange holidays aren't sessions, but NSE occasionally trades on a weekend, such as Union Budget day or Diwali Muhurat trading.",
    read: "\"20 sessions\" means 20 trading days, about four weeks.",
    what: "Everything in tradeSence is counted in sessions, not calendar days. If you pick a date that wasn't a session, the app shows the session before it and says so.",
    calc: { plain: "A day is a session when NSE published an end-of-day file for it." },
    example: "A 50-day average uses the last 50 sessions, which span about 10 calendar weeks.",
    mistakes: ["Counting calendar days. 250 sessions is about one year, not 250 days."],
    related: ["sma", "ma-50-200"],
    seeIt: { label: "Breadth", href: "/" },
  },
  membership: {
    id: "membership", term: "Index membership", topic: "Basics",
    short: "Which companies were in the NIFTY 50 on a given day. The index changes a few times a year, so tradeSence uses the real list for every day since 2020, not today's list.",
    read: "A company counts towards breadth only on the days it was actually in the index.",
    what: "Using today's members for every past day would quietly leave out the companies that collapsed and were removed, so history would look better than it was. This is called survivorship bias. tradeSence avoids it by recording who joined and left, and when.",
    calc: { plain: "Built from NSE Indices' press releases: each addition and removal with its effective date, checked to give exactly 50 members on every day." },
    example: "YES BANK left the NIFTY 50 on 27 Mar 2020. Its collapse counts in breadth before that date, and not after.",
    mistakes: ["Judging history with today's members. It leaves out the losers, so the past looks rosier than it was."],
    related: ["nifty50", "breadth"],
    seeIt: { label: "Report card list", href: "/stock" },
  },
  sma: {
    id: "sma", term: "SMA (simple moving average)", topic: "Moving averages",
    short: "The average closing price over the last N sessions, with every day counting equally. It smooths out daily noise to show the trend.",
    read: "Price above its SMA suggests an uptrend over that period; below suggests a downtrend.",
    what: "A moving average \"moves\" because each new session adds the newest close and drops the oldest. A short one (50 days) follows price closely; a long one (200 days) changes slowly and shows the bigger trend.",
    calc: { plain: "Add up the last N closing prices and divide by N.", exact: "SMA(N) = (P[t] + P[t−1] + … + P[t−N+1]) ÷ N" },
    example: "Closes of ₹100, ₹102, ₹101, ₹104 and ₹103 give a 5-day SMA of ₹102. Today's ₹103 is above it.",
    mistakes: [
      "Treating a single cross as a signal. Prices hover around their average often; that's why tradeSence shows how often each stock crosses.",
      "Forgetting splits. A 1:5 split cuts the raw price by 80%; tradeSence adjusts for it so the average isn't fooled.",
    ],
    related: ["ema", "ma-50-200", "crossing", "adjusted-prices"],
    seeIt: { label: "Report card price chart", href: "/stock/RELIANCE" },
  },
  ema: {
    id: "ema", term: "EMA (exponential moving average)", topic: "Moving averages",
    short: "A moving average that gives recent prices more weight than old ones, so it reacts faster to change than an SMA of the same length.",
    read: "Read it like an SMA: price above it suggests an uptrend. It turns sooner after a big move.",
    what: "An EMA never fully forgets an old price; it fades it a little every session. That makes it smoother than a short SMA and quicker than a long one.",
    calc: {
      plain: "Each session, move the previous EMA a fixed share of the way towards today's close. For a 200-day EMA that share is 2 ÷ 201, about 1%.",
      exact: "EMA[t] = EMA[t−1] + k × (P[t] − EMA[t−1]),  k = 2 ÷ (N + 1), started from the first N-day SMA",
    },
    example: "With a 200-day EMA at ₹400 and a close of ₹420, the new EMA is about ₹400.20: ₹400 plus 1% of the ₹20 gap.",
    mistakes: ["Assuming old prices drop out. They fade by about 1% a day but never fully disappear, which is why an unadjusted split would distort an EMA for over a year."],
    related: ["sma", "ma-50-200", "adjusted-prices"],
    seeIt: { label: "Breadth on the 200-day EMA", href: "/?ma=ema200" },
  },
  "ma-50-200": {
    id: "ma-50-200", term: "50- and 200-day averages", topic: "Moving averages",
    short: "The two most watched averages: the 50-day shows the medium-term trend (about 10 weeks), the 200-day the long-term trend (about a year).",
    read: "Above both: an established uptrend. Below both: a downtrend. In between: the trend is changing.",
    what: "tradeSence offers three: the 200-day SMA, the 200-day EMA and the 50-day SMA. Switch between them with the tabs or the 1, 2 and 3 keys.",
    calc: { plain: "SMAs over 50 and 200 sessions, and an EMA over 200 sessions." },
    example: "A stock at ₹110 with a 50-day average of ₹105 and a 200-day of ₹95 is above both.",
    mistakes: ["Thinking 200 is magic. It's a convention many traders watch, which is partly why it matters; it isn't a law."],
    related: ["sma", "ema", "trend-check"],
    seeIt: { label: "Breadth", href: "/" },
  },
  breadth: {
    id: "breadth", term: "Breadth (% above the average)", topic: "Breadth",
    short: "The share of NIFTY 50 stocks closing above their own moving average. It shows how many companies are in uptrends, not just where the index is.",
    read: "Under 20%: very weak, most stocks falling. Over 80%: very strong. 50% is the halfway line.",
    what: "The index can rise on a few heavyweights while most stocks fall. Breadth counts every member equally, so it shows whether a move is broad or narrow.",
    calc: { plain: "Count the members whose close is above their average, divide by the members that have an average, and multiply by 100.", exact: "breadth = members with close > average ÷ members with an average × 100" },
    example: "If 8 of 50 stocks are above their 200-day SMA, breadth is 16%.",
    mistakes: [
      "Reading very weak breadth as \"buy now\". In tradeSence's history it was followed by a higher index 6 months later, but the first month could still fall further (−14% in March 2020).",
      "Ignoring which average. 50-day breadth swings much faster than 200-day breadth.",
    ],
    related: ["percentile", "five-session-change", "ma-50-200", "nifty50"],
    seeIt: { label: "Breadth", href: "/" },
  },
  percentile: {
    id: "percentile", term: "Percentile", topic: "Breadth",
    short: "Where today's reading ranks among every session since 2020: the 3rd percentile means only 3% of sessions were this low or lower.",
    read: "Below 10: a rare low. Above 90: a rare high. Around 50: ordinary.",
    what: "A number like \"30% of stocks above their average\" means little on its own. The percentile says how unusual it is against the app's whole history.",
    calc: { plain: "Count the sessions with a reading at or below today's, divide by all sessions, and multiply by 100." },
    example: "If 167 of 1,670 sessions closed at or below today's breadth, today is at the 10th percentile.",
    mistakes: ["Treating rare as a prediction. A rare low says how unusual today is, not what happens next."],
    related: ["breadth"],
    seeIt: { label: "Breadth", href: "/" },
  },
  "five-session-change": {
    id: "five-session-change", term: "Five-session change", topic: "Breadth",
    short: "How much breadth moved over the last five sessions, in percentage points. It shows the direction, so the number isn't read in isolation.",
    read: "Positive: improving. Negative: deteriorating.",
    what: "Two days with the same breadth can mean opposite things: one on the way up, one on the way down. The change over a week tells them apart.",
    calc: { plain: "Today's breadth minus breadth five sessions ago." },
    example: "Breadth of 16% today and 32% five sessions ago is a change of −16 pts.",
    mistakes: ["Confusing points with percent. Going from 20% to 30% is +10 points, not +50%."],
    related: ["breadth"],
    seeIt: { label: "Breadth", href: "/" },
  },
  "advancers-decliners": {
    id: "advancers-decliners", term: "Advancers and decliners", topic: "Advance/Decline",
    short: "Advancers are stocks that closed higher than the previous session; decliners closed lower. Counted across the NIFTY 50 members each day.",
    read: "More advancers than decliners means the rise was broad; the reverse means most stocks fell.",
    what: "This is the simplest daily measure of participation: not how far the index moved, but how many stocks moved with it.",
    calc: { plain: "Each member's move from its previous close, adjusted for splits and renames, so a split day isn't a fake fall." },
    example: "13 rose, 37 fell and 0 were unchanged: 13 advancers and 37 decliners.",
    mistakes: ["Using the raw previous close on a split day. A 1:5 split looks like an 80% fall unless prices are adjusted; tradeSence adjusts them."],
    related: ["net-advances", "nifty50", "adjusted-prices"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  "net-advances": {
    id: "net-advances", term: "Net advances", topic: "Advance/Decline",
    short: "Advancers minus decliners for the day. −24 means 24 more NIFTY 50 stocks fell than rose.",
    read: "Positive: a broad up day. Negative: a broad down day. Several negative days in a row: selling is widespread.",
    what: "Net advances turns the two counts into one number with a sign, so a run of days is easy to scan.",
    calc: { plain: "Advancers − decliners." },
    example: "30 rose and 20 fell: net advances is +10.",
    mistakes: ["Comparing it across groups of different sizes. +10 means much more out of 50 stocks than out of 500; RANA fixes that."],
    related: ["advancers-decliners", "rana", "ad-line"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  rana: {
    id: "rana", term: "RANA (ratio-adjusted net advances)", topic: "Advance/Decline",
    short: "Net advances divided by the stocks that moved, ×1,000. It keeps the scale steady whatever the number of stocks or unchanged closes.",
    read: "+1,000: every moving stock rose. −1,000: every one fell. 0: an even split.",
    what: "RANA is the input to the McClellan oscillator. Ratio-adjusting stops a day with many unchanged stocks from looking calmer or wilder than it was.",
    calc: { plain: "(Advancers − decliners) ÷ (advancers + decliners) × 1,000. A day when nothing moved is 0.", exact: "RANA = (A − D) ÷ (A + D) × 1000" },
    example: "30 rose and 20 fell: (30 − 20) ÷ 50 × 1,000 = +200.",
    mistakes: ["Reading it as a percentage. +200 means 60% of the moving stocks rose, not 20%."],
    related: ["net-advances", "mcclellan"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  mcclellan: {
    id: "mcclellan", term: "McClellan oscillator", topic: "Advance/Decline",
    short: "A momentum gauge for breadth: a fast average of RANA minus a slow one. Above zero, buying pressure is building; below zero, selling is.",
    read: "Crossing back above zero after a deep negative stretch is often an early sign that selling is fading.",
    what: "Created by Sherman and Marian McClellan in 1969. It compares recent participation with a longer baseline, so it turns before slower measures do.",
    calc: { plain: "The 19-session EMA of RANA minus the 39-session EMA of RANA.", exact: "McClellan = EMA19(RANA) − EMA39(RANA)" },
    example: "If RANA's 19-day average is −80 and its 39-day average is −20, the oscillator is −60: selling has got heavier recently.",
    mistakes: [
      "Treating every zero cross as a signal. It crosses often; deep readings (like −138 in March 2020) and longer stretches matter more.",
      "Expecting a value straight away. It needs 39 sessions of history first.",
    ],
    related: ["rana", "summation-index"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  "summation-index": {
    id: "summation-index", term: "Summation index", topic: "Advance/Decline",
    short: "The running total of the McClellan oscillator. It shows the longer trend of breadth momentum: rising means breadth has been improving for weeks.",
    read: "Compare it with 20 sessions ago: rising, falling or flat.",
    what: "Where McClellan swings day to day, the summation index changes direction slowly, more like a long-term breadth trend line.",
    calc: { plain: "Add each session's McClellan value to the previous total.", exact: "Summation[t] = Summation[t−1] + McClellan[t]" },
    example: "A summation index of −1,560 that was −705 twenty sessions ago is falling: weakness has been building.",
    mistakes: ["Reading its level on its own. The direction over weeks matters more than the number."],
    related: ["mcclellan", "ad-line"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  "ad-line": {
    id: "ad-line", term: "A/D line (advance/decline line)", topic: "Advance/Decline",
    short: "The running total of net advances. Its level is arbitrary; its slope shows whether participation is broadening or narrowing over time.",
    read: "A falling A/D line while the index rises means fewer stocks are carrying the rally: a divergence worth watching.",
    what: "The A/D line is the classic way to see participation over months. It starts from zero at the left edge of whatever range you choose.",
    calc: { plain: "Add each session's net advances to the previous total." },
    example: "Net advances of +10, −30 and 0 give a line of +10, −20, −20.",
    mistakes: ["Comparing its level across ranges. The line restarts at zero for each range, so only its shape matters."],
    related: ["net-advances", "nifty50"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  "advancing-share-10d": {
    id: "advancing-share-10d", term: "10-day advancing share", topic: "Advance/Decline",
    short: "The share of moving stocks that rose, averaged over about 10 sessions. It's the input to the breadth-thrust signal.",
    read: "Around 50%: balanced. Under 40%: a weak stretch. Above 61.5% soon after: a possible thrust.",
    what: "It smooths the day-to-day advancing share so one wild day doesn't dominate.",
    calc: { plain: "Each day, advancers ÷ (advancers + decliners) × 100; then a 10-session EMA of that." },
    example: "13 rose and 37 fell: 26% that day. After a run of such days the 10-day share might sit near 36%.",
    mistakes: ["Confusing it with breadth. Breadth asks \"above the average?\"; this asks \"did it rise today?\"."],
    related: ["breadth-thrust", "advancers-decliners", "ema"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  "breadth-thrust": {
    id: "breadth-thrust", term: "Breadth thrust (Zweig)", topic: "Advance/Decline",
    short: "A rare signal when the 10-day advancing share jumps from under 40% to over 61.5% within 10 sessions: a sudden, broad wave of buying.",
    read: "Historically linked with strong recoveries on US markets. tradeSence hasn't tested it on the NIFTY 50 yet, so treat it as context.",
    what: "Described by Martin Zweig for the NYSE, with thousands of stocks. With only 50 stocks it may fire more easily, which is why it's on the list to study before it becomes a signal.",
    calc: { plain: "The 10-day advancing share goes from below 40% to above 61.5% within 10 sessions." },
    example: "35% on day 1 and 63% on day 8 is a thrust. 35% on day 1 and 63% on day 12 is not: too slow.",
    mistakes: ["Expecting it often. It's rare by design; frequent firing on 50 stocks would mean the thresholds need re-testing."],
    related: ["advancing-share-10d"],
    seeIt: { label: "Advance/Decline", href: "/advance-decline" },
  },
  crossing: {
    id: "crossing", term: "Crossing", topic: "Stocks",
    short: "A stock crossing its moving average: yesterday's close was on one side, today's is on the other, either up through the average or down through it.",
    read: "A cross on heavy volume, after a long time on the other side, carries more weight than one on a quiet day.",
    what: "Crossings are where trends start and end, but most are noise. The Screener shows each cross with its volume and how long the stock had been on the other side.",
    calc: { plain: "Yesterday's close at or below its average and today's above it (or the reverse). Both days must have an average, with no gap in the data between them." },
    example: "Close ₹98 against an average of ₹100 yesterday, and ₹103 against ₹100 today: a cross above.",
    mistakes: ["Trusting every cross. Many reverse within days; check the volume and how often the stock usually crosses."],
    related: ["whipsaw", "volume-ratio", "near-the-line", "sma"],
    seeIt: { label: "Screener", href: "/screener" },
  },
  whipsaw: {
    id: "whipsaw", term: "Whipsaw (past crossings)", topic: "Stocks",
    short: "How often a stock has crossed back and forth over its average. Frequent crossers are noisy; a cross from a calm stock means more.",
    read: "Calm crosser: few past crossings. Busy: many. Typical: in between, compared with the other members.",
    what: "Some stocks trend cleanly; others flip-flop around their average. Knowing which is which tells you how much to trust a fresh cross.",
    calc: { plain: "Count the crossings since 2020. \"Calm\" is at or below the 25th percentile of today's members, \"Busy\" at or above the 75th." },
    example: "A stock with 29 crossings when most members have 40 to 60 is a calm crosser.",
    mistakes: ["Reading \"Busy\" as strong. It means the price keeps flip-flopping around its average."],
    related: ["crossing"],
    seeIt: { label: "Crossings", href: "/crossings" },
  },
  "volume-ratio": {
    id: "volume-ratio", term: "Volume vs 20-day", topic: "Stocks",
    short: "The day's traded volume divided by the stock's average over the previous 20 sessions. 2.0× means twice its usual volume.",
    read: "A move on 2× or more volume has more conviction behind it; under 1×, fewer people took part.",
    what: "Volume shows how many shares changed hands. A price move with unusually heavy volume suggests many buyers or sellers acted, not just a few.",
    calc: { plain: "Today's volume ÷ the average of the 20 sessions before it (today excluded), adjusted for splits and bonuses." },
    example: "1,491,300 shares today against an average of 211,652 is 7.0×.",
    mistakes: ["Forgetting splits. After a 1:5 split there are 5× as many shares, so raw volume jumps with nothing happening; tradeSence adjusts for it."],
    related: ["crossing", "adjusted-prices"],
    seeIt: { label: "Screener", href: "/screener" },
  },
  "near-the-line": {
    id: "near-the-line", term: "Near the line", topic: "Stocks",
    short: "Stocks closing within 1% of their moving average, on either side. A small move could push them across.",
    read: "Compare with 5 sessions ago: a gap that's shrinking means the stock is closing in on the line.",
    what: "These are tomorrow's possible crossings. The Screener lists them in two groups: just below (could cross up) and just above (could cross down).",
    calc: { plain: "The distance from the average, |close ÷ average − 1|, is 1% or less." },
    example: "A close of ₹99.40 with an average of ₹100 is −0.6%: near the line, just below.",
    mistakes: ["Assuming it will cross. Many stocks bounce off their average instead."],
    related: ["crossing"],
    seeIt: { label: "Screener, near the line", href: "/screener?view=near" },
  },
  "trend-check": {
    id: "trend-check", term: "Trend (Report Card)", topic: "Risk",
    short: "Whether the stock closes above its 50- and 200-day averages. Above both is green, above one is amber, below both is red.",
    read: "Green: an established uptrend. Red: a downtrend. Amber: the trend is changing.",
    what: "The first check on the Report Card, with how many sessions the stock has stayed on its side of the 200-day average.",
    calc: { plain: "The close compared with the 50-day SMA and the 200-day SMA." },
    example: "A close of ₹418 with a 50-day average of ₹405 and a 200-day of ₹400 is above both: green.",
    mistakes: ["Treating green as \"buy\". It describes the past trend, and trends end."],
    related: ["ma-50-200", "sma"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  "relative-strength": {
    id: "relative-strength", term: "Relative strength", topic: "Risk",
    short: "How a stock's return compares with the NIFTY 50 and with the other members. The Report Card ranks its 6-month return against the members on that day.",
    read: "Top third: green. Bottom third: red. Strong stocks often stay strong for a while, but not always.",
    what: "Strength relative to the market is one of the most studied patterns in investing: winners have tended to keep winning for some months. It's a tendency, not a rule.",
    calc: { plain: "The stock's 6-month return (126 sessions), ranked as a percentile among the members' 6-month returns." },
    example: "A 6-month return of +18% when the NIFTY 50 rose 0.4% may rank around the 90th percentile.",
    mistakes: ["Picking the weakest stock because it \"looks cheap\". Falling stocks often keep falling."],
    related: ["trend-check", "nifty50"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  volatility: {
    id: "volatility", term: "Bumpiness (volatility)", topic: "Risk",
    short: "How much the stock moves on a typical day, compared with the NIFTY 50. 2.0× means it swings about twice as much as the index.",
    read: "Up to 1.2×: green. Up to 1.8×: amber. More: red. Bumpier stocks have bigger bad days.",
    what: "Volatility measures how widely daily moves vary. Measuring it against the index makes it comparable from calm years to wild ones.",
    calc: { plain: "The standard deviation of daily moves over the last 250 sessions, divided by the NIFTY 50's over the same sessions." },
    example: "A stock moving ±1.7% on a typical day when the NIFTY 50 moves ±0.8% is about 2.1× as bumpy.",
    mistakes: ["Thinking low volatility means safe. A calm stock can still fall hard in a crash."],
    related: ["drawdown", "stretches"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  drawdown: {
    id: "drawdown", term: "Worst fall (drawdown)", topic: "Risk",
    short: "The biggest drop from a previous high to a later low, and how long it took to get back. It shows how bad holding through a crash could have felt.",
    read: "Compared with the NIFTY 50's worst over the same years: up to 1.2× is green, up to 1.8× amber, more is red.",
    what: "The chart \"How far below its high\" shows this every day: 0% at a new high, and the depth of every fall and recovery.",
    calc: {
      plain: "Track the highest close so far; each day, measure how far below it the price is. The worst of those is the drawdown. Recovery is the first day back at that high.",
      exact: "drawdown[t] = P[t] ÷ max(P[0] … P[t]) − 1",
    },
    example: "A peak of ₹120 falling to ₹60 is a −50% drawdown. It recovers when the price is back at ₹120.",
    mistakes: ["Thinking a 50% fall needs a 50% rise to recover. It needs +100%: ₹60 has to double to get back to ₹120."],
    related: ["volatility", "stretches", "adjusted-prices"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  liquidity: {
    id: "liquidity", term: "Liquidity (turnover)", topic: "Risk",
    short: "How much money changes hands in the stock on a typical day. Plenty of trading means you can buy and sell easily at a fair price.",
    read: "₹100 crore or more a day: green. ₹10 to 100 crore: amber. Less: red.",
    what: "Turnover is the rupee value traded. In thinly traded stocks, the price you get can be noticeably worse than the last price shown.",
    calc: { plain: "The median daily turnover (₹ traded) over the last 20 sessions." },
    example: "About ₹476 crore a day changes hands in KOTAKBANK: easy to get in and out.",
    mistakes: ["Ignoring it for small stocks. Thinly traded shares can move a lot on a single large order."],
    related: ["volume-ratio"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  stretches: {
    id: "stretches", term: "Overlapping stretches (1 in 10)", topic: "Risk",
    short: "The risk calculator looks at every month-long (or week, 3-month, year) stretch in the history, one starting each session. \"1 in 10\" is the 10th percentile.",
    read: "It's a range from the past, not a forecast. Losses can be larger than anything in the history.",
    what: "Instead of one number, the calculator shows what a typical bad stretch, the worst stretch, and the share of losing stretches looked like, in rupees for your amount.",
    calc: { plain: "For each session, the return over the next N sessions; then the 10th percentile, the median, the worst and the share that were negative." },
    example: "With 2,461 month-long stretches, the 246th worst return is the \"1 in 10\".",
    mistakes: ["Counting the stretches as independent. Neighbouring stretches overlap almost entirely, so there's less evidence than the count suggests."],
    related: ["drawdown", "volatility"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  "adjusted-prices": {
    id: "adjusted-prices", term: "Adjusted prices", topic: "Risk",
    short: "Prices corrected for splits, bonuses and demergers, so a 1:5 split doesn't look like an 80% crash. Renamed companies keep their full history.",
    read: "Every average, move, drawdown and volume figure in tradeSence uses adjusted prices; the closing price shown is the real one.",
    what: "NSE publishes raw prices. After a 1:5 split each share is worth a fifth as much, but nobody lost money. Adjusting earlier prices makes before and after comparable.",
    calc: { plain: "Earlier prices are divided by the event's factor: 5 for a 1:5 split, 1.5 for a 1:2 bonus. Demergers use the price drop on the ex-date. Raw NSE prices are never changed." },
    example: "KOTAKBANK split 1:5 on 14 Jan 2026: ₹2,132.60 before is ₹426.52 adjusted, in line with ₹421 after.",
    mistakes: ["Comparing raw prices across a split. Before and after aren't in the same units until adjusted."],
    related: ["sma", "ema", "drawdown"],
    seeIt: { label: "KOTAKBANK's report card", href: "/stock/KOTAKBANK" },
  },
};
```

- [ ] **Step 4: Run the test**

Run: `bun test tests/glossary.test.ts` → all PASS. `bunx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/glossary.ts tests/glossary.test.ts
git commit -m "Add the glossary: every term on screen, explained once"
```

---

### Task 2: The `<Term>` popover

**Files:**
- Create: `src/components/Term.tsx` (client)
- Modify: `src/lib/glossary.ts` (add `todayLine`)
- Test: `tests/glossary.test.ts`

**Interfaces:**
- Consumes: `GLOSSARY`, `TermId`, `termHref` (Task 1); `Popover`, `PopoverTrigger`, `PopoverContent` (`src/components/ui/popover.tsx`).
- Produces:
  - `todayLine(today: string | undefined): string | null`: trims; returns null for empty, "—", "-", or anything starting "Not enough" / "Not available".
  - `<Term id: TermId; today?: string; children?: ReactNode; className?: string>`: renders `children ?? GLOSSARY[id].term` followed by the ⓘ button.

- [ ] **Step 1: Failing test** (append to `tests/glossary.test.ts`)

```ts
import { todayLine } from "../src/lib/glossary";
test("todayLine drops placeholders so the popover never says 'Today: —'", () => {
  expect(todayLine("−24: 13 rose, 37 fell")).toBe("−24: 13 rose, 37 fell");
  for (const p of [undefined, "", "  ", "—", "-", "Not enough history", "Not available for today"]) {
    expect(todayLine(p)).toBeNull();
  }
});
```

Run: `bun test tests/glossary.test.ts` → FAIL ("Export named 'todayLine' not found").

- [ ] **Step 2: Implement `todayLine`** (append to `src/lib/glossary.ts`)

```ts
/** The popover's "Today:" text, or null when the page only has a placeholder. */
export function todayLine(today: string | undefined): string | null {
  const t = (today ?? "").trim();
  if (!t || t === "—" || t === "-" || /^Not (enough|available)/i.test(t)) return null;
  return t;
}
```

Run the test → PASS.

- [ ] **Step 3: Write `src/components/Term.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GLOSSARY, termHref, todayLine, type TermId } from "@/lib/glossary";
import { cn } from "@/lib/utils";

type Props = { id: TermId; today?: string; children?: React.ReactNode; className?: string };

/**
 * A label with an ⓘ that explains it in place. Never put this inside a <Link>
 * or a clickable row: the ⓘ is a button of its own.
 */
export default function Term({ id, today, children, className }: Props) {
  const e = GLOSSARY[id];
  const now = todayLine(today);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span>{children ?? e.term}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`What is ${e.term}?`}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-brand focus-visible:text-brand"
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={16} className="w-[min(18rem,calc(100vw-2rem))] p-4 text-left">
          <p className="text-heading text-foreground">{e.term}</p>
          <p className="mt-1.5 text-[13px] font-normal normal-case leading-5 tracking-normal text-foreground-2">{e.short}</p>
          <p className="mt-2 text-[12px] font-normal normal-case leading-4 tracking-normal text-foreground-2">
            <span className="font-medium text-foreground">How to read it: </span>
            {e.read}
          </p>
          {now && (
            <p className="mt-2 text-[12px] font-normal normal-case leading-4 tracking-normal tabular-nums text-foreground-2">
              <span className="font-medium text-foreground">Today: </span>
              {now}
            </p>
          )}
          <Link href={termHref(id)} className="mt-3 inline-block text-[12px] font-medium normal-case tracking-normal text-brand hover:underline">
            Read more →
          </Link>
        </PopoverContent>
      </Popover>
    </span>
  );
}
```

(The `normal-case tracking-normal font-normal` resets matter: `<Term>` is used inside eyebrows and table heads, which are uppercase and tracked.)

- [ ] **Step 4: Verify**

`bunx tsc --noEmit` clean; `bun test tests/glossary.test.ts` PASS. (Rendering is checked in the browser in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/components/Term.tsx src/lib/glossary.ts tests/glossary.test.ts
git commit -m "Add the <Term> info popover"
```

---

### Task 3: Live examples (`src/query/glossary-live.ts`)

**Files:**
- Create: `src/query/glossary-live.ts`
- Test: `tests/glossary-live.test.ts`

**Interfaces:**
- Consumes: `breadthSeries`, `resolveSession` (`src/query/breadth.ts`); `advanceDeclineSeries` (`src/query/advance-decline.ts`); `screenerOn` (`src/query/screener.ts`); `crossingStats` (`src/query/crossings.ts`); `stockReport` (`src/query/stock-report.ts`); `readMembershipHistory`, `membersOn` (`src/ingest/nifty50-history.ts`); `formatDate`, `signed`, `formatPrice`, `formatInt` (`src/lib/format.ts`); `TermId`.
- Produces: `liveExample(id: TermId): Promise<string | null>`. It never throws: every branch is wrapped, and any error or missing data returns null.

Showcase stock for stock-level terms: `KOTAKBANK` (constant `SHOWCASE`).

- [ ] **Step 1: Failing test** (`tests/glossary-live.test.ts`)

```ts
import { test, expect, describe, beforeEach } from "bun:test";
import { db, schema } from "../src/db";
import { liveExample } from "../src/query/glossary-live";
import { GLOSSARY, type TermId } from "../src/lib/glossary";

async function empty() {
  for (const t of [schema.dailyIndicators, schema.indexMembers, schema.indexPrices, schema.corporateActions, schema.symbolChanges]) await db.delete(t);
}

describe("liveExample", () => {
  beforeEach(empty);

  test("on an empty database every term returns null (never throws)", async () => {
    for (const id of Object.keys(GLOSSARY) as TermId[]) {
      if (id === "membership") continue; // from the committed CSV, not the database
      expect(await liveExample(id)).toBeNull();
    }
  });

  test("net advances and SMA read today's numbers", async () => {
    await db.insert(schema.indexMembers).values([
      { indexName: "NIFTY50", symbol: "KOTAKBANK", addedOn: "2020-01-01", removedOn: null },
      { indexName: "NIFTY50", symbol: "DOWNCO", addedOn: "2020-01-01", removedOn: null },
    ]);
    await db.insert(schema.dailyIndicators).values([
      { tradeDate: "2026-10-01", symbol: "KOTAKBANK", close: 418.35, sma50: 405, sma200: 400.05, ema200: 400.26, changePct: 0.3, volRatio: 1, turnover: 1e9 },
      { tradeDate: "2026-10-01", symbol: "DOWNCO", close: 90, sma50: 100, sma200: 100, ema200: 100, changePct: -1, volRatio: 1, turnover: 1e9 },
    ]);
    expect(await liveExample("net-advances")).toBe("On 1 Oct 2026: 0 (1 rose, 1 fell).");
    expect(await liveExample("sma")).toBe("KOTAKBANK closed at ₹418.35 on 1 Oct 2026; its 200-day SMA was ₹400.05.");
  });

  test("membership comes from the committed history file", async () => {
    expect(await liveExample("membership")).toMatch(/^50 members today; the latest change was on \d+ \w{3} \d{4}\.$/);
  });
});
```

Run: `bun test tests/glossary-live.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement** (`src/query/glossary-live.ts`)

```ts
/**
 * One live sentence per glossary term, from the same queries the pages use, so
 * a Learn page's "Today in tradeSence" can't disagree with the page itself.
 * Returns null (never throws) when there's nothing to show yet.
 */
import { breadthSeries, resolveSession } from "./breadth";
import { advanceDeclineSeries } from "./advance-decline";
import { screenerOn } from "./screener";
import { crossingStats } from "./crossings";
import { stockReport } from "./stock-report";
import { membersOn, readMembershipHistory } from "../ingest/nifty50-history";
import { formatDate, formatInt, formatPrice, signed } from "../lib/format";
import type { TermId } from "../lib/glossary";

const SHOWCASE = "KOTAKBANK";
const pct = (v: number, d = 1) => `${signed(v, d)}%`;

async function build(id: TermId): Promise<string | null> {
  switch (id) {
    case "membership": {
      const rows = readMembershipHistory();
      const today = new Date().toISOString().slice(0, 10);
      const last = rows.flatMap((r) => [r.addedOn, r.removedOn ?? ""]).filter((d) => d && d <= today).sort().at(-1);
      return last ? `${membersOn(rows, today).length} members today; the latest change was on ${formatDate(last)}.` : null;
    }
    case "session": {
      const d = await resolveSession("sma200");
      return d ? `The latest session loaded is ${formatDate(d)}.` : null;
    }
    case "breadth": case "percentile": case "five-session-change": case "nifty50": {
      const s = await breadthSeries("sma200");
      const p = s.at(-1);
      if (!p) return null;
      if (id === "breadth" || id === "nifty50") return `On ${formatDate(p.date)}, ${p.above} of ${p.total} NIFTY 50 stocks (${p.pctAbove.toFixed(0)}%) closed above their 200-day SMA.`;
      if (id === "percentile") {
        const pc = (s.filter((x) => x.pctAbove <= p.pctAbove).length / s.length) * 100;
        return `On ${formatDate(p.date)}, 200-day breadth of ${p.pctAbove.toFixed(0)}% was at the ${pc.toFixed(0)}th percentile of ${formatInt(s.length)} sessions.`;
      }
      const prior = s.at(-6);
      return prior ? `200-day breadth moved ${signed(p.pctAbove - prior.pctAbove)} pts in the five sessions to ${formatDate(p.date)}.` : null;
    }
    case "advancers-decliners": case "net-advances": case "rana": case "mcclellan": case "summation-index":
    case "ad-line": case "advancing-share-10d": case "breadth-thrust": {
      const p = (await advanceDeclineSeries()).at(-1);
      if (!p) return null;
      const on = `On ${formatDate(p.date)}`;
      switch (id) {
        case "advancers-decliners": return `${on}: ${p.advancing} advancers, ${p.declining} decliners, ${p.unchanged} unchanged.`;
        case "net-advances": return `${on}: ${signed(p.net)} (${p.advancing} rose, ${p.declining} fell).`;
        case "rana": return `${on}: RANA was ${signed(p.rana)}.`;
        case "mcclellan": return p.mcclellan === null ? null : `${on}: the McClellan oscillator was ${signed(p.mcclellan, 1)}, ${p.mcclellan >= 0 ? "above" : "below"} zero.`;
        case "summation-index": return p.summation === null ? null : `${on}: the summation index was ${signed(p.summation)}.`;
        case "ad-line": return `${on}: net advances were ${signed(p.net)}; the A/D line adds these up across the range you choose.`;
        default: return p.adv10 === null ? null : `${on}: the 10-day advancing share was ${p.adv10.toFixed(1)}%${p.adv10 < 40 ? ", under 40%: a thrust would need it above 61.5% within 10 sessions" : ""}.`;
      }
    }
    case "crossing": case "volume-ratio": case "near-the-line": {
      const d = await resolveSession("sma200");
      if (!d) return null;
      const { rows } = await screenerOn("sma200", d);
      if (rows.length === 0) return null;
      if (id === "crossing") {
        const up = rows.filter((r) => r.cross === "above").length;
        const down = rows.filter((r) => r.cross === "below").length;
        return `On ${formatDate(d)}, ${up} stocks crossed above their 200-day SMA and ${down} crossed below.`;
      }
      if (id === "near-the-line") {
        const n = rows.filter((r) => r.pctFromMa !== null && Math.abs(r.pctFromMa) <= 1).length;
        return `On ${formatDate(d)}, ${n} stocks closed within 1% of their 200-day SMA.`;
      }
      const top = rows.filter((r) => r.volRatio !== null).sort((a, b) => b.volRatio! - a.volRatio!)[0];
      return top ? `On ${formatDate(d)}, ${top.symbol} traded the heaviest volume against its normal: ${top.volRatio!.toFixed(1)}×.` : null;
    }
    case "whipsaw": {
      const s = await crossingStats("sma200");
      if (s.length === 0) return null;
      const sorted = [...s].sort((a, b) => a.crossings - b.crossings);
      return `Since 2020, ${sorted[0]!.symbol} crossed its 200-day SMA the fewest times (${sorted[0]!.crossings}) and ${sorted.at(-1)!.symbol} the most (${sorted.at(-1)!.crossings}).`;
    }
    case "sma": case "ema": case "ma-50-200": case "trend-check": case "relative-strength":
    case "volatility": case "drawdown": case "liquidity": case "stretches": case "adjusted-prices": {
      const res = await stockReport(SHOWCASE);
      if (res.kind !== "ok") return null;
      const r = res.report;
      const on = formatDate(r.date);
      switch (id) {
        case "sma": return r.trend.sma200 === null ? null : `${SHOWCASE} closed at ₹${formatPrice(r.close)} on ${on}; its 200-day SMA was ₹${formatPrice(r.trend.sma200)}.`;
        case "ema": return null; // the report doesn't carry the EMA; the page shows it on Breadth
        case "ma-50-200": case "trend-check":
          return r.trend.sma50 === null || r.trend.sma200 === null ? null
            : `${SHOWCASE} on ${on}: close ₹${formatPrice(r.close)}, 50-day ₹${formatPrice(r.trend.sma50)}, 200-day ₹${formatPrice(r.trend.sma200)}.`;
        case "relative-strength": return r.strength.percentile === null || r.strength.ret6m === null ? null
          : `${SHOWCASE}'s 6-month return to ${on} was ${pct(r.strength.ret6m)}, stronger than ${r.strength.percentile.toFixed(0)}% of the members.`;
        case "volatility": return r.bumpiness.ratio === null || r.bumpiness.dailyVol === null ? null
          : `${SHOWCASE} moves about ±${r.bumpiness.dailyVol.toFixed(1)}% on a typical day: ${r.bumpiness.ratio.toFixed(1)}× the NIFTY 50.`;
        case "drawdown": return !r.worstFall.stock || r.worstFall.stock.depthPct === 0 ? null
          : `${SHOWCASE}'s worst fall since ${formatDate(r.firstDate)} was ${signed(r.worstFall.stock.depthPct, 0)}% (${formatDate(r.worstFall.stock.peakDate)} to ${formatDate(r.worstFall.stock.troughDate)}).`;
        case "liquidity": return r.liquidity.medianCrore === null ? null
          : `About ₹${formatInt(Math.round(r.liquidity.medianCrore))} crore of ${SHOWCASE} changes hands on a typical day.`;
        case "stretches": { const m = r.horizons["1m"].stock; return m ? `${SHOWCASE} has ${formatInt(m.windows)} month-long stretches since ${formatDate(r.firstDate)}; 1 in 10 lost more than ${Math.abs(m.p10).toFixed(1)}%.` : null; }
        default: { const e = r.events.find((x) => x.kind !== "rename"); return e ? `${SHOWCASE}: ${e.text.replace(/\s+/g, " ")} (${formatDate(e.date)}).` : null; }
      }
    }
  }
}

export async function liveExample(id: TermId): Promise<string | null> {
  try {
    return await build(id);
  } catch {
    return null;
  }
}
```

Note for the implementer: `ema` returns null by design (the report has no EMA). That's honest ("Not available for today") rather than wrong. If you add `ema200` to `StockReport.trend` while here, record a ruling.

- [ ] **Step 3: Run the tests**

`bun test tests/glossary-live.test.ts` → PASS. If the empty-DB test fails for a term, the fix is in `build` (return null), never in the test.

- [ ] **Step 4: Commit**

```bash
git add src/query/glossary-live.ts tests/glossary-live.test.ts
git commit -m "Add live 'today' examples for every glossary term"
```

---

### Task 4: The Learn pages, sidebar entry, `l` key

**Files:**
- Create: `src/app/learn/page.tsx`, `src/app/learn/[id]/page.tsx`, `src/components/LearnList.tsx` (client filter)
- Modify: `src/components/SiteNav.tsx` (`Section` adds `"learn"`; new group `{ label: "Help", links: [{ key: "learn", href: "/learn", label: "Learn", short: "Learn", hint: "l", icon: BookOpen }] }`; shortcuts line `b a c s r l`), `src/components/hotkey-target.ts` (`learn: "/learn"` in `BASE`; `l` → `/learn`), `src/components/Hotkeys.tsx` (ignore keys whose target is inside `[data-radix-popper-content-wrapper]`)
- Test: `tests/hotkeys.test.ts`

**Interfaces:**
- Consumes: `GLOSSARY`, `TOPICS`, `isTermId`, `termHref` (Task 1); `liveExample` (Task 3); `AppShell`, `PageHeader`, `Card`, `Hotkeys`.

- [ ] **Step 1: Failing test** (append to `tests/hotkeys.test.ts`)

```ts
test("l opens Learn from anywhere", () => {
  expect(hotkeyTarget("l", { page: "breadth", ma: "sma200" })).toBe("/learn");
});
```

Run → FAIL (returns null). Implement in `hotkey-target.ts`: add `learn: "/learn"` to `BASE` and `if (key === "l") return "/learn";`. Run → PASS. In `Hotkeys.tsx`'s `onKey`, after the input check add:

```ts
      if (el?.closest?.("[data-radix-popper-content-wrapper]")) return; // a popover or date picker is open
```

- [ ] **Step 2: `/learn` page** (server): `AppShell current="learn"`, `Hotkeys page="learn"`, PageHeader eyebrow "tradeSence · Help", title "Learn", description "Every term in the app, in plain language: what it means, how it's calculated, and how to read it, with today's numbers.", then `<LearnList entries={Object.values(GLOSSARY).map(({ id, term, topic, short }) => ({ id, term, topic, short }))} topics={TOPICS} />`.

`LearnList` (client): a filter input (same style and `autoFocus` as `StockList`) that matches `term` or `short`, case-insensitive; then one `Card` per topic with matches, each item a `Link` to `termHref(id)` showing `term` (heading) and `short` (12px, foreground-2). Empty filter result → "No term matches “{q}”."

- [ ] **Step 3: `/learn/[id]` page** (server):

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
// AppShell, PageHeader, Card, Hotkeys imports
import { GLOSSARY, isTermId, termHref } from "@/lib/glossary";
import { liveExample } from "@/query/glossary-live";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTermId(id)) notFound();
  const e = GLOSSARY[id];
  const live = await liveExample(id);
  // Render, in order, each section as a Card with an h2 (text-heading):
  //  "What it is" → e.what
  //  "How it's calculated" → e.calc.plain, then e.calc.exact in <pre className="mt-3 overflow-x-auto rounded-md bg-raised px-3 py-2 font-mono text-[12px]"> if present
  //  "How to read it" → e.read
  //  "Worked example" → e.example
  //  "Today in tradeSence" → live ?? "Not available for today.", then e.seeIt as a Link "See it: {label} →"
  //  "Common mistakes" → <ul> of e.mistakes
  //  "Related terms" → Links to termHref(r) with GLOSSARY[r].term
  // PageHeader: eyebrow `Learn · ${e.topic}`, title e.term, description e.short; a "← All terms" link to /learn above.
  // Footer line on every page: "Explanations are educational. Nothing in tradeSence is advice to buy or sell."
}
```

Use a two-column layout from lg (`grid gap-4 lg:grid-cols-2`) for the six section cards after "What it is" (full width).

- [ ] **Step 4: Sidebar** as listed in Files (lucide `BookOpen`).

- [ ] **Step 5: Verify**

```bash
bunx tsc --noEmit && bun test
bun run dev -- -p 3001 &   # wait until it answers
for u in /learn /learn/mcclellan /learn/net-advances /learn/nope /learn/__proto__; do printf "%-24s %s\n" $u "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001$u)"; done
```

Expected: 200, 200, 200, 404, 404.

- [ ] **Step 6: Commit**

```bash
git add src/app/learn src/components/LearnList.tsx src/components/SiteNav.tsx src/components/hotkey-target.ts src/components/Hotkeys.tsx tests/hotkeys.test.ts
git commit -m "Add the Learn pages, the Help sidebar group and the l key"
```

---

### Task 5: Put `<Term>` on every page

**Files (modify):**
- `src/components/Readout.tsx`: `Tile` gains `term?: TermId`; when set, the label renders as `<Term id={t.term} today={`${t.value}${t.unit ? ` ${t.unit}` : ""}`}>{t.label}</Term>`.
- `src/app/page.tsx` (Breadth tiles): Percentile → `percentile`, Five-session change → `five-session-change`, Average since 2020 → `breadth`, One-year range → `breadth`.
- `src/components/BreadthHero.tsx`: eyebrow "Above the {maLabel}" → `<Term id="breadth" today={`${pct.toFixed(0)}%`}>`; "Where today sits" → `<Term id="percentile" today={`${percentile.toFixed(1)}`}>`.
- `src/components/BreadthArea.tsx`: title → `<Term id="breadth">Breadth over time</Term>`.
- `src/components/MemberTable.tsx`: title keeps text; add `<Term id="ma-50-200" />`-style ⓘ after `{maLabel}` (outside any Link).
- `src/app/advance-decline/page.tsx` tiles: McClellan → `mcclellan`, Summation index → `summation-index`, 10-day advancing share → `advancing-share-10d`, Advancing sessions → `advancers-decliners`.
- `src/components/AdHero.tsx`: "Net advances" → `<Term id="net-advances" today={`${signed(net)} (${advancing} rose, ${declining} fell)`}>`; "Last N sessions" heading → `advancers-decliners`.
- `src/components/AdLineChart.tsx`: title → `ad-line`. `src/components/McClellanBars.tsx`: title → `mcclellan`.
- `src/app/screener/page.tsx` tiles: Crossed above/below → `crossing`, Within 1% → `near-the-line`, Median volume → `volume-ratio`; the "Near the line" heading → `near-the-line`.
- `src/components/ScreenerTable.tsx` and the screener NearCard: column heads "Volume vs 20d" and "Past crossings" get `title={GLOSSARY["volume-ratio"].short}` / `title={GLOSSARY.whipsaw.short}` (hover hint only, no ⓘ in table heads).
- `src/app/crossings/page.tsx` tiles: all four → `whipsaw`.
- `src/components/StockChecks.tsx`: card labels → Trend `trend-check`, Strength `relative-strength`, Bumpiness `volatility`, Worst fall `drawdown`, Liquidity `liquidity` (today = the card's figure); `LightSummary` labels stay plain (the cards carry the ⓘ).
- `src/components/RiskCalculator.tsx`: title → `<Term id="stretches">What could a bad stretch cost?</Term>`.
- `src/components/StockPriceChart.tsx`: title → `<Term id="adjusted-prices">Price and its 200-day average</Term>`. `src/components/DrawdownChart.tsx`: title → `drawdown`.

Rule while editing: a `<Term>` is never placed inside a `<Link>` or a `<button>`.

- [ ] **Step 1:** Make the edits above. `bunx tsc --noEmit` must stay clean; `bun test` all pass.
- [ ] **Step 2: Browser check** (headless Chrome via the scratchpad CDP script used before), at 1440 px and at 390 px wide:
  - On `/advance-decline`, focus the ⓘ next to "Net advances" (Tab), press Enter → popover visible with "Net advances", "How to read it", "Today: −24 (13 rose, 37 fell)" (or today's value) and "Read more →". Press Esc → closed, focus back on the ⓘ.
  - Press `b` while the popover is open → **no** navigation.
  - Click "Read more →" → `/learn/net-advances`, with "Today in tradeSence" filled.
  - At 390 px, open the ⓘ on the rightmost tile: the popover's bounding box stays inside the viewport.
  - `/learn` filter "mcc" shows only the McClellan oscillator.
  - Save a screenshot of an open popover and of `/learn/mcclellan`, and look at both.
- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "Explain every term in place: ⓘ popovers across all pages"
```

---

### Task 6: Document

**Files:**
- Create: `docs/decisions/0012-explaining-terms.md`
- Modify: `docs/decisions/README.md`, `CLAUDE.md`, `README.md`, `TODO.md`, `docs/pipelines.md` (pages list)

- [ ] **Step 1:** 0012 in the decision-log format (Problem, Options A/B/C, Decision, Why, Checks, Revisit when), including everything met while building.
- [ ] **Step 2:** CLAUDE.md, in "Design decisions that are load-bearing": **"Every term is explained once, in `src/lib/glossary.ts`.** A new metric, tile or card title needs a glossary entry and a `<Term>` before it ships; `tests/glossary.test.ts` checks completeness. Never put `<Term>` inside a `<Link>` or button."
- [ ] **Step 3:** README function reference for `glossary.ts`, `Term`, `liveExample`; pages list adds `/learn`; TODO: the feature done, and diagrams (SMA vs EMA, drawdown) as a follow-up.
- [ ] **Step 4:** `bunx tsc --noEmit && bun test`, then commit:

```bash
git add docs CLAUDE.md README.md TODO.md
git commit -m "Document explaining terms in the UI (decision 0012)"
```
