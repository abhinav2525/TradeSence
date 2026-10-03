import { VolumeTrack, Card, Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "tradesence";

export const Ratios = () => (
  <div style={{ width: 300, padding: 16 }}>
    <div className="flex flex-col gap-3 text-[13px] tabular-nums text-foreground">
      {([
        ["Quiet session", 0.6],
        ["About normal", 1.1],
        ["Past the 2× line", 2.3],
        ["Off the scale", 5.1],
      ] as const).map(([label, r]) => (
        <div key={label} className="flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">{label}</span>
          <VolumeTrack ratio={r} />
        </div>
      ))}
    </div>
  </div>
);

export const NoVolume = () => (
  <div style={{ width: 300, padding: 16 }}>
    <div className="flex items-center justify-between text-[13px] tabular-nums text-foreground">
      <span className="text-[12px] text-muted-foreground">Fewer than 20 sessions of volume</span>
      <VolumeTrack ratio={null as unknown as number} />
    </div>
  </div>
);

const head = "h-9 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
const rows = [
  { symbol: "TATAMOTORS", gap: "+0.84", gap5: "−1.92", vol: 3.2 },
  { symbol: "HINDALCO", gap: "+0.41", gap5: "−0.77", vol: 1.8 },
  { symbol: "BAJFINANCE", gap: "+1.36", gap5: "−0.35", vol: 1.1 },
];

export const InScreenerTable = () => (
  <div style={{ width: 520, padding: 16 }}>
    <Card className="overflow-hidden">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={head + " pl-5"}>Symbol</TableHead>
            <TableHead className={head + " text-right"}>Gap now</TableHead>
            <TableHead className={head + " text-right"}>5 sessions ago</TableHead>
            <TableHead className={head + " pr-5 text-right"}>Volume vs 20d</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.symbol} className="hover:bg-raised">
              <TableCell className="py-2.5 pl-5 pr-3 text-[13px] font-semibold text-foreground">{r.symbol}</TableCell>
              <TableCell className="px-3 py-2.5 text-right text-[13px] font-medium text-up">{r.gap}%</TableCell>
              <TableCell className="px-3 py-2.5 text-right text-[13px] text-muted-foreground">{r.gap5}%</TableCell>
              <TableCell className="py-2.5 pl-3 pr-5 text-right text-[13px] text-foreground">
                <VolumeTrack ratio={r.vol} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  </div>
);
