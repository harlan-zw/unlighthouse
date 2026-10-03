import type { InjectionKey } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { inject } from 'vue'

/**
 * Controls for UiAppShell's mobile nav drawer, provided by the shell to slot
 * content rendered inside it. Absent a provider this no-ops, so a consumer
 * stays renderable outside the shell (sandbox pages, tests).
 */
export interface UiNavDrawer {
  /**
   * Keep the drawer open across the navigation to `target`. Arms exactly one
   * route change: landing on `target` keeps the drawer open, any other route
   * change closes it as usual. For in-drawer pane switches (the sidebar mode
   * tabs) — not for links, which navigate and close.
   */
  keepOpenFor: (target: RouteLocationRaw) => void
}

export const uiNavDrawerKey: InjectionKey<UiNavDrawer> = Symbol('ui-nav-drawer')

const noop: UiNavDrawer = { keepOpenFor: () => {} }

export function useNavDrawer(): UiNavDrawer {
  return inject(uiNavDrawerKey, noop)
}

/**
 * Pure core of the drawer's close-on-navigation rule. The shell consults the
 * decider on EVERY route change (its watcher keys on fullPath) so the arm is
 * consumed the first time the route moves, whatever moves it. The drawer then
 * closes only when the route path changed and the change was not the exact
 * navigation an in-drawer pane switch armed.
 */
export function navDrawerCloseDecider() {
  let armedFullPath: string | null = null
  return {
    arm(fullPath: string) {
      armedFullPath = fullPath
    },
    /** Returns whether the drawer should close for this route change. */
    shouldCloseOnRouteChange(fullPath: string): boolean {
      const keep = armedFullPath === fullPath
      armedFullPath = null
      return !keep
    },
  }
}
