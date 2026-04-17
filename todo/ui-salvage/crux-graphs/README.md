# Crux web-vital chart components (salvage)

Deferred during the `chore/v1` → `v1` port. Original source: `packages/client/components/Crux/Graph/` on `chore/v1`.

## What's here

- `CruxGraphCls.vue`, `CruxGraphInp.vue`, `CruxGraphLcp.vue` — lightweight-charts visualisations for CrUX (Chrome UX Report) real-user web vitals (Cumulative Layout Shift, Interaction to Next Paint, Largest Contentful Paint).
- `_dark.ts`, `_formatting.ts` — extracted bits of `packages/client/logic/` that the graphs import (`isDark`, `useHumanMs`).

## To wire these up on `v1`

1. Install deps: `dayjs`, `lightweight-charts`.
2. Move the three `.vue` files to `packages/ui/components/Crux/Graph/`.
3. Replace the `_dark.ts` / `_formatting.ts` shims with equivalents on `v1` (check `packages/ui/composables/` and `packages/ui/utils/` first — `isDark` likely maps to `useDark` from VueUse, `useHumanMs` may already exist).
4. Fix the relative imports in the `.vue` files (originally `../../../logic` / `../../../logic/formatting`).
5. Hook into the existing web-vitals flow near `packages/ui/components/Cell/CellWebVitals.vue`.

## What was skipped

Nothing else from `packages/client/` was judged worth porting. The other 23 unique components on `chore/v1` are primitives (Btn, Chip, Badge, Pagination, Popover, etc.) already covered by `@nuxt/ui` on `v1`.
