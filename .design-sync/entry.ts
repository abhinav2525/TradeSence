/**
 * Design-system entry for Claude Design (/design-sync). The converter's
 * from-source mode re-exports with `export *`, which drops default exports,
 * and almost every component here is a default export - so this barrel names
 * them. Regenerate when a component is added or renamed (NOTES.md).
 */
import "./process-shim"; // must stay first: see process-shim.ts
export { default as AdHero } from "../src/components/AdHero";
export { default as AdLineChart } from "../src/components/AdLineChart";
export { default as AdRecentTable } from "../src/components/AdRecentTable";
export { default as AppShell } from "../src/components/AppShell";
export { default as BreadthArea } from "../src/components/BreadthArea";
export { default as BreadthHero } from "../src/components/BreadthHero";
export { default as CountUp } from "../src/components/CountUp";
export { default as CrashTable } from "../src/components/CrashTable";
export { default as CrossingsBars } from "../src/components/CrossingsBars";
export { default as CrossingsTable } from "../src/components/CrossingsTable";
export { default as DateNav } from "../src/components/DateNav";
export { default as DatePicker } from "../src/components/DatePicker";
export { default as DrawdownChart } from "../src/components/DrawdownChart";
export { default as EpisodeTable } from "../src/components/EpisodeTable";
export { default as ForwardReturns } from "../src/components/ForwardReturns";
export { default as Hotkeys } from "../src/components/Hotkeys";
export { default as LearnList } from "../src/components/LearnList";
export { default as LightDot } from "../src/components/LightDot";
export { default as MaTabs } from "../src/components/MaTabs";
export { default as McClellanBars } from "../src/components/McClellanBars";
export { default as MemberTable } from "../src/components/MemberTable";
export { default as PageHeader } from "../src/components/PageHeader";
export { default as Readout } from "../src/components/Readout";
export { default as ReturnBuckets } from "../src/components/ReturnBuckets";
export { default as RiskCalculator } from "../src/components/RiskCalculator";
export { default as ScreenerTable } from "../src/components/ScreenerTable";
export { default as SiteNav } from "../src/components/SiteNav";
export { default as SlidingPill } from "../src/components/SlidingPill";
export { default as StockChecks, LightSummary } from "../src/components/StockChecks";
export { default as StockEvents } from "../src/components/StockEvents";
export { default as StockList } from "../src/components/StockList";
export { default as StockPriceChart } from "../src/components/StockPriceChart";
export { default as Term } from "../src/components/Term";
export { default as ThemeToggle } from "../src/components/ThemeToggle";
export { default as DensityToggle } from "../src/components/DensityToggle";
export { default as VolumeTrack } from "../src/components/VolumeTrack";
export { default as WashoutCard } from "../src/components/WashoutCard";
export { default as WashoutNotice } from "../src/components/WashoutNotice";
export { default as WashoutSpark } from "../src/components/WashoutSpark";
export { Badge, badgeVariants } from "../src/components/ui/badge";
export { Button, buttonVariants } from "../src/components/ui/button";
export { Calendar, CalendarDayButton } from "../src/components/ui/calendar";
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "../src/components/ui/card";
export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle } from "../src/components/ui/chart";
export { Popover, PopoverTrigger, PopoverContent } from "../src/components/ui/popover";
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from "../src/components/ui/table";
export { ThemeRoot } from "./theme-root";
