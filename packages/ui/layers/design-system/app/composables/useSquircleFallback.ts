import { onMounted, ref } from 'vue'

/**
 * Squircle fallback gate. Native CSS `corner-shape: squircle` (Chrome 139+)
 * renders the squircle at SSR with a native border and zero hydration morph
 * (see the `@supports` rule in global.css), so it needs no JS. Only where
 * `corner-shape` is unsupported (Safari/Firefox) do consumers fall back to a
 * generated `clip-path` + SVG-border overlay.
 *
 * `enabled` stays `false` on the server and through hydration (SSR can't
 * feature-detect), then flips to `true` after mount on non-supporting
 * browsers — so the fallback is a post-hydration enhancement, never a
 * hydration mismatch.
 */
export function useSquircleFallback() {
  const enabled = ref(false)
  onMounted(() => {
    enabled.value = !(typeof CSS !== 'undefined' && CSS.supports?.('corner-shape', 'squircle'))
  })
  return { enabled }
}
