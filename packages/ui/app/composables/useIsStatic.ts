// True when the dashboard is served from an embedded static snapshot
// (`--build-static`) rather than a live host. Use it to hide write controls and
// live polling. The static client rejects write commands at runtime regardless
// (see `createStaticClient`); this is the UX layer so the buttons never show.
// This is an immutable runtime capability check, not reactive state.
// eslint-disable-next-line harlanzw/vue-no-faux-composables
export function useIsStatic(): boolean {
  if (import.meta.server)
    return false
  return !!(window as unknown as { __unlighthouse_static?: boolean }).__unlighthouse_static
}
