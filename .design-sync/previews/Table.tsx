import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption, Badge, Card } from "tradesence";

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

const members = [
  { symbol: "BHARTIARTL", close: "1,912.40", ma: "1,688.15", pct: 13.28 },
  { symbol: "BAJFINANCE", close: "1,004.85", ma: "912.30", pct: 10.14 },
  { symbol: "MARUTI", close: "12,640.00", ma: "11,820.55", pct: 6.93 },
  { symbol: "SBIN", close: "868.35", ma: "821.40", pct: 5.72 },
  { symbol: "LT", close: "3,702.90", ma: "3,551.05", pct: 4.28 },
  { symbol: "ICICIBANK", close: "1,392.10", ma: "1,341.75", pct: 3.75 },
  { symbol: "TITAN", close: "3,418.60", ma: "3,371.20", pct: 1.41 },
  { symbol: "RELIANCE", close: "1,374.20", ma: "1,362.85", pct: 0.83 },
];

const maxAbs = Math.max(...members.map((m) => Math.abs(m.pct)));

export const MemberRows = () => (
  <div style={{ width: 540, padding: 16 }}>
    <Card className="flex flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-up" />
          <h2 className="text-heading text-foreground">Above the 200-day SMA</h2>
        </div>
        <Badge variant="up">{members.length} stocks</Badge>
      </div>
      <Table containerClassName="max-h-[520px] overflow-y-auto" className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${head} pl-5`}>Symbol</TableHead>
            <TableHead className={`${head} text-right`}>Close</TableHead>
            <TableHead className={`${head} text-right`}>Average</TableHead>
            <TableHead className={`${head} pr-5 text-right`}>Distance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((r) => (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-2.5 pl-5 pr-3">
                <span className="text-[13px] font-semibold text-foreground">{r.symbol}</span>
                {r.pct <= 2 && (
                  <Badge variant="outline" className="ml-2 align-middle">near line</Badge>
                )}
              </TableCell>
              <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground">{r.close}</TableCell>
              <TableCell className="px-3 py-2.5 text-right text-[13px] text-muted-foreground">{r.ma}</TableCell>
              <TableCell className="py-2.5 pl-3 pr-5">
                <div className="flex items-center justify-end gap-2.5">
                  <span className="flex h-1.5 w-14 justify-end overflow-hidden rounded-full bg-chart-muted" aria-hidden="true">
                    <span className="h-full rounded-full bg-up" style={{ width: `${Math.max(4, (r.pct / maxAbs) * 100)}%` }} />
                  </span>
                  <span className="w-16 text-right text-[13px] font-medium text-up">+{r.pct.toFixed(2)}%</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  </div>
);

const sessions = [
  { date: "1 Oct", adv: 14, dec: 36, mc: -58.8 },
  { date: "30 Sep", adv: 19, dec: 31, mc: -52.4 },
  { date: "29 Sep", adv: 27, dec: 23, mc: -47.1 },
  { date: "26 Sep", adv: 11, dec: 39, mc: -49.6 },
  { date: "25 Sep", adv: 25, dec: 25, mc: -41.3 },
];
const signed = (n: number, d = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;

export const RecentSessions = () => (
  <div style={{ width: 480, padding: 16 }}>
    <Card className="overflow-hidden">
      <div className="border-b px-5 py-3.5">
        <h2 className="text-heading text-foreground">Recent sessions</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Latest first</p>
      </div>
      <Table className="tabular-nums">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${head} pl-5`}>Date</TableHead>
            <TableHead className={`${head} text-right`}>Adv</TableHead>
            <TableHead className={`${head} text-right`}>Dec</TableHead>
            <TableHead className={`${head} text-right`}>Net</TableHead>
            <TableHead className={`${head} pr-5 text-right`}>McClellan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((r) => {
            const net = r.adv - r.dec;
            return (
              <TableRow key={r.date} className="hover:bg-raised">
                <TableCell className="py-2.5 pl-5 pr-3 text-[13px] text-foreground">{r.date}</TableCell>
                <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground-2">{r.adv}</TableCell>
                <TableCell className="px-3 py-2.5 text-right text-[13px] text-foreground-2">{r.dec}</TableCell>
                <TableCell className={`px-3 py-2.5 text-right text-[13px] font-medium ${net > 0 ? "text-up" : net < 0 ? "text-down" : "text-muted-foreground"}`}>
                  {signed(net)}
                </TableCell>
                <TableCell className="py-2.5 pl-3 pr-5 text-right text-[13px] text-foreground">{signed(r.mc, 1)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  </div>
);

export const Plain = () => (
  <div style={{ width: 420, padding: 16 }}>
    <Table>
      <TableCaption>NIFTY 50 closes on 1 Oct 2026</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Close</TableHead>
          <TableHead className="text-right">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">INFY</TableCell>
          <TableCell className="text-right tabular-nums">1,452.30</TableCell>
          <TableCell className="text-right tabular-nums text-down">−2.14%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">TCS</TableCell>
          <TableCell className="text-right tabular-nums">2,968.75</TableCell>
          <TableCell className="text-right tabular-nums text-down">−1.08%</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">ITC</TableCell>
          <TableCell className="text-right tabular-nums">402.15</TableCell>
          <TableCell className="text-right tabular-nums text-up">+0.62%</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);
