# tradeSence: how to build with this design system

tradeSence is a NIFTY 50 market-breadth dashboard: a calm, dark fintech instrument where colour is spent only on measurements.

## Wrap everything in `ThemeRoot`

Every screen must sit inside `<ThemeRoot>`. It applies the dark palette (the default), the page background, the text colour and the Geist font. It also provides a stand-in router, so navigating components (`DatePicker`, `DateNav`, `MaTabs`, `SiteNav`) render, and it puts `dark` on `<html>` so popovers match. Without it, components render in the light palette on a white page, and the navigating ones throw.

```jsx
const { ThemeRoot, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Readout } = window.TradeSence;

<ThemeRoot>
  <main style={{ padding: 32, display: "grid", gap: 16 }}>…</main>
</ThemeRoot>
```

`<ThemeRoot theme="light">` gives the light palette.

## Styling idiom: Tailwind utilities over design tokens

Style with the token utility classes the stylesheet ships. Never use hex values. Only classes present in `_ds_bundle.css` exist (it is a fixed, pre-compiled set), so for layout glue use these, or inline `style`:

| Purpose | Classes |
|---|---|
| Surfaces | `bg-background` (page), `bg-card` + `border` + `shadow-card` + `rounded-lg` (panels), `bg-raised` (insets, switches) |
| Ink | `text-foreground`, `text-foreground-2` (secondary), `text-muted-foreground` (labels) |
| Meaning | `text-up` / `bg-up-soft` (above, improving), `text-down` / `bg-down-soft` (below, deteriorating), `text-brand` / `bg-brand-soft` (selection, the primary series) |
| Type scale | `text-display` (one headline figure per page), `text-metric` (tile values), `text-title`, `text-heading` (card titles), `text-eyebrow` + `uppercase` (section labels), `text-body-sm` body, `text-[12px]` captions |
| Numbers | `tabular-nums` in every table and figure |

Rules the components already follow:
- `up` and `down` only ever mark direction, and always with a sign, an arrow or a word. Never colour alone.
- Negative numbers use the true minus `−`.
- Dates are written "1 Oct 2026".
- Indian digit grouping: `1,24,580`.

## Where the truth lives

- **`guidelines/docs/design/system/README.md`**: the design rules (colour, type, layout, charts, motion, voice). Read it before composing a screen.
- **`_ds_bundle.css`**: every token, as `--background`, `--card`, `--up`, `--down`, `--brand`, `--chart-1` and `--chart-muted`, under `:root` (light) and `.dark`.
- **Each component's `.d.ts`** (its props) and **`.prompt.md`** (usage). Page-level pieces (`BreadthHero`, `WashoutCard`, `StockChecks`…) take data shaped like the app's own types. Copy the shapes in their `.d.ts`.

## Composing a screen

Lead with one figure, then explain it: how rare it is, which way it is moving, and what it is compared with. Build panels from `Card`, put stat tiles in `Readout`, mark state with `Badge` and `LightDot`, and label any metric with `Term`, which adds an ⓘ that explains it.

```jsx
<ThemeRoot>
  <div style={{ display: "grid", gap: 16, maxWidth: 720, padding: 24 }}>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Washed out</CardTitle>
          <CardDescription>Share above the 200-day SMA</CardDescription>
        </div>
        <Badge variant="down">Active</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-body-sm text-foreground-2">16% of NIFTY 50 stocks are above their 200-day SMA, under the 20% line.</p>
      </CardContent>
    </Card>
    <Readout tiles={[
      { label: "Percentile", term: "percentile", value: "3.0", badge: { text: "Rare low", tone: "down" }, fill: 0.03, fillTone: "down", sub: "Weaker than 97% of sessions since 2020" },
      { label: "Five-session change", term: "five-session-change", value: "−16", unit: "pts", direction: "down", sub: "Deteriorating since 24 Sep 2026" },
    ]} />
  </div>
</ThemeRoot>
```
