import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

// Shell drawer control shared down the tree. UiAppShell provides it; a
// descendant page header (saas `ProPageHeader`) injects it to render the
// hamburger inline with the page title below `lg` (shell `inlineMobileNav`).
// Null outside a shell: consumers hide their hamburger when it is absent,
// so a header rendered standalone keeps working.
export interface UiAppShellNav {
  openNav: () => void
}

const key: InjectionKey<UiAppShellNav> = Symbol('ui-app-shell-nav')

export function provideUiAppShellNav(nav: UiAppShellNav) {
  provide(key, nav)
}

export function useUiAppShellNav(): UiAppShellNav | null {
  return inject(key, null)
}
