import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge } from "tradesence";

export const Basic = () => (
  <div style={{ width: 420, padding: 16 }}>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Breadth over time</CardTitle>
          <CardDescription>1 Jan 2020 – 1 Oct 2026</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-[13px] leading-5 text-foreground-2">
          Under the halfway line, most of the index sits below its own long-term average.
        </p>
      </CardContent>
      <CardFooter>Shaded bands mark the extremes: under 20% and over 80%.</CardFooter>
    </Card>
  </div>
);

export const WithBadge = () => (
  <div style={{ width: 420, padding: 16 }}>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Washed out</CardTitle>
          <CardDescription>Share above the 200-day SMA</CardDescription>
        </div>
        <Badge variant="down">Active</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-[13px] leading-5 text-foreground-2">
          16% of NIFTY 50 stocks are above their 200-day SMA, under the 20% line.
        </p>
      </CardContent>
    </Card>
  </div>
);

export const StatCard = () => (
  <div style={{ width: 260, padding: 16 }}>
    <Card className="p-5">
      <p className="text-[12px] font-medium text-muted-foreground">Above the 200-day SMA</p>
      <p className="mt-2 text-display text-foreground">16<span className="text-heading text-muted-foreground">%</span></p>
      <p className="mt-1 text-[12px] text-foreground-2">8 of 50 constituents on 1 Oct 2026</p>
    </Card>
  </div>
);
