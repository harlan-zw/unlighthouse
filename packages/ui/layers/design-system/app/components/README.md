# Design system components

Canonical UI primitives. Every component here must render with prop fixtures alone: no `useFetch`, no [Drizzle](https://orm.drizzle.team), no Caller, no auth/billing state. Domain data is passed in via props or slots, never resolved internally.

See [ADR-0029](../../../docs/adr/0029-component-placement-contract.md) for the placement contract that decides what lives here vs in `layers/saas/`, `apps/pro/`, or a feature layer.

## Taxonomy

Three subdirs by composition shape. Pick by what the component is for, not what it looks like.

### `container/`

Wraps other content and manages its surface, layout, or portal. Has at least one `<slot />`. Renaming "Card" without children is a leaf; renaming with children is a container.

Current: `Alert`, `Card`, `DateRangePicker`, `EmptyState`, `LoadingCard`, `LockedCard`, `PageHeader`, `SampleDataOverlay`, `SectionHeader`, `UiNoData`, `UiPopover`, `UiWidgetState`.

### `data/`

Renders structured data: tables, rows of metrics, structured cells. Takes a row/value/series and decides how to present it. Often slotted into a `container/`.

Current: `DataList`, `MetricCard`, `MetricLabel`, `MetricsRow`, `MetricToggle`, `SparklineLoader`, `UiSparkline`, `UiStat`, `UiStats`, `UiTable*` family, `UiDataTableSection`, `cells/`.

### `element/`

Leaf primitives. No nested slots beyond a single optional `<slot />`. Includes dots, badges, chips, icons, buttons, and single-purpose displays.

Current: `Chip`, `DotLabel`, `EjectMenu`, `Favicon`, `HealthDot`, `ProgressPercent`, `SeverityDot`, `StatusBadge`, `SyncDot`, `TogglePill`, `UiHelpLabel`, `UiButton`, `UiPillSelect`, `UiProgressCircle`, `UiSkeleton`, `UiTooltip`, `UiTooltipGrid`, `UiTrend`.

## Naming rules

- **No scope prefixes.** Not `Pro*`, not `Admin*`, not `Tool*`, not `Docs*`. The layer name is the scope. Promotion from `pro-saas` → here drops the prefix in the same PR ([ADR-0029](../../../docs/adr/0029-component-placement-contract.md)).
- **`Ui*` is grandfathered**, not preferred. New primitives don't add the prefix; existing `Ui*` files keep it until a rename batch is convenient.
- **PascalCase**, single basename word where possible (`Card`, not `CardSurface`; `Chip`, not `BadgeChip`).
- **Auto-import registers them under the bare name** (see `nuxt.config.ts` here: `pathPrefix: false`).

## Priority

The design-system layer registers its components dir with `priority: 10` (see `nuxt.config.ts`). This wins shadow conflicts against same-basename files in other layers (e.g. `apps/site/app/components/content/Alert.vue`, owned by the content team). When you add a new primitive, check `ripast components --dups` to confirm it doesn't introduce a new shadow that's load-bearing somewhere.
