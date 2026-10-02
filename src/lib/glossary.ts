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
  "trend-check", "relative-strength", "volatility", "drawdown", "liquidity", "stretches", "adjusted-prices", "right-now", "bad-days", "crash-episodes",
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
    calc: { plain: "Count the crossings since 2020, while each stock was in the index. \"Calm\" is at or below the 25th percentile of today's members, \"Busy\" at or above the 75th." },
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
    calc: { plain: "The stock's 6-month return (126 sessions), ranked against the other members' 6-month returns: the share of them it beat." },
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
  "right-now": {
    id: "right-now", term: "Right now (expected range)", topic: "Risk",
    short: "How jumpy the stock has been lately compared with its usual year, and the range a normal week moves in. Recent days count more than older ones.",
    read: "Green: as calm as usual or calmer. Amber: up to 1.5× jumpier. Red: more than 1.5× jumpier than its usual year.",
    what: "Calm and wild spells come in runs: after a few big days, more big days are likely. This light compares the stock's recent swings with its last year and turns them into a range for a normal week. The card also says how often, over the last 2 years, a real week stayed inside the range the method gave at the start of that week, so you can see whether it fits this stock.",
    calc: {
      plain: "Each day's move is squared and blended into a running average in which yesterday's estimate keeps 94% of the weight (J.P. Morgan's RiskMetrics, 1996). Its square root is today's typical daily move; times √5 gives a week.",
      exact: "σ²(today) = 0.94 × σ²(yesterday) + 0.06 × move²\nweek = σ × √5\nlight = σ ÷ std. dev. of the last 250 moves",
    },
    example: "A typical day of ±1.8% makes a normal week about ±1.8% × 2.24 ≈ ±4.0%: about ±₹400 on ₹10,000. If its usual year was ±1.2% a day, the ratio is 1.5×: amber.",
    mistakes: [
      "Reading the range as a limit. About 1 week in 3 should end outside it, and the worst weeks end far outside.",
      "Thinking calm means safe. Calm spells end, often suddenly.",
    ],
    related: ["volatility", "stretches"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  "bad-days": {
    id: "bad-days", term: "Bad days (down capture and beta)", topic: "Risk",
    short: "How much of the NIFTY 50's falls the stock takes on the market's down days. 120% means that when the NIFTY falls 1%, it usually falls 1.2%.",
    read: "Green: 100% or less. Amber: up to 120%. Red: more than 120%. Beta, shown small, is the same idea over all days.",
    what: "Some stocks drop harder than the market on bad days; others hold up better. Down capture looks only at the days the NIFTY 50 fell, up capture at the days it rose. Beta is the textbook measure over all days: how much the stock moves for each 1% the NIFTY moves.",
    calc: {
      plain: "Over the last 250 sessions: the stock's average move on the NIFTY's down days ÷ the NIFTY's average move on those days. Up capture does the same on up days.",
      exact: "down capture = mean(stock | NIFTY < 0) ÷ mean(NIFTY | NIFTY < 0) × 100\nbeta = Cov(stock, NIFTY) ÷ Var(NIFTY)",
    },
    example: "On the NIFTY's down days it fell 0.8% on average and the stock fell 1.0%: down capture 125%, red. If on up days the NIFTY rose 0.7% and the stock 0.63%, up capture is 90%.",
    mistakes: [
      "Assuming a low beta means the stock can't fall. It describes typical days, not crashes: see In crashes.",
      "Comparing captures measured over different periods.",
    ],
    related: ["crash-episodes", "volatility"],
    seeIt: { label: "Report card", href: "/stock" },
  },
  "crash-episodes": {
    id: "crash-episodes", term: "In crashes (market breaks)", topic: "Risk",
    short: "How far the stock fell in past market crashes, from its high before each one, against the NIFTY 50 in the same crash. A crash: under 20% of NIFTY 50 stocks above their 200-day average.",
    read: "Green: fell up to 1.2× as much as the NIFTY, crash for crash. Amber: up to 1.8×. Red: more. No light with fewer than 3 past crashes.",
    what: "When most of the index breaks down together, you find out which stocks hold up. For each past crash, the card measures the stock's fall from its high in the 3 months before to its low in the 3 months after, against the NIFTY's fall in the same crash, and checks where it was 6 months on. A crash still under way isn't counted until 3 months have passed.",
    calc: {
      plain: "A crash starts on a day 200-day breadth falls below 20%; weak days within 10 sessions are one crash (as in research 0001), and crashes whose 3-month windows overlap are merged. Fall = the low in the 63 sessions after the start ÷ the high in the 63 sessions before it, minus 1. The light is the median, across crashes, of the stock's fall ÷ the NIFTY's.",
      exact: "fall = min(level, start … start+63) ÷ max(level, start−63 … start) − 1\nlight = median over crashes of (stock fall ÷ NIFTY fall)",
    },
    example: "Three crashes: the stock fell 30%, 9% and 24%; the NIFTY fell 20%, 6% and 12%. Crash for crash that is 1.5×, 1.5× and 2.0×: the median is 1.5×, amber.",
    mistakes: [
      "Comparing it with the Worst fall light. That one is the deepest fall in the whole history; this one compares each market crash with the NIFTY's fall in the same crash.",
      "Treating a handful of crashes as proof. Since 2020 there have been only about 5; the card always says how many.",
      "Expecting the next crash to look like the last ones.",
    ],
    related: ["breadth", "drawdown"],
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

/** The popover's "Today:" text, or null when the page only has a placeholder. */
export function todayLine(today: string | undefined): string | null {
  const t = (today ?? "").trim();
  if (!t || t === "—" || t === "-" || /^Not (enough|available)/i.test(t)) return null;
  return t;
}
