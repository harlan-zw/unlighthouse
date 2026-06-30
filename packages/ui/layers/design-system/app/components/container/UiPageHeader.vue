<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'

// Page header: breadcrumb + title + description + trailing actions slot.
// Extracted after six sibling pages converged on the same shape
// (overview, queries list, pages list, countries, indexing, sitemaps).

interface Crumb {
  label: string
  to?: string
}

// `description` is intentionally accepted-but-unrendered: page headers no longer
// show a subtitle. Kept in the type so existing callers don't break.
const { crumbs = [], title, icon, flush = false, border = true, forked = false } = defineProps<{
  crumbs?: Crumb[]
  title: string
  icon?: UiIcon
  description?: string
  /** Skip pro-container (max-width + horizontal padding). Use in non-pro shells where padding is owned by the layout. */
  flush?: boolean
  /** Bottom hairline. Turn off for headers with a sub-nav tab strip beneath (the tabs own the separator). */
  border?: boolean
  /** Three-zone "forked" layout: `#leading` left, title centered, `#actions` right.
   *  The title centers against the full header width (each side zone is `1fr`). */
  forked?: boolean
}>()
</script>

<template>
  <header :class="[flush ? '' : 'pro-container', border ? 'border-b border-default' : '']">
    <!-- Forked layout: leading | centered title | actions, on one row. -->
    <!-- Below lg the leading switcher moves up beside the hamburger (shell
         #mobileNav bar), so the header is just title + actions on one row. At lg+
         it's the 3-zone centered grid with the switcher back in the leading slot. -->
    <div v-if="forked" class="flex items-center justify-between gap-3 pt-2 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-4 lg:pt-3">
      <div class="hidden min-w-0 items-center gap-3 lg:flex lg:justify-self-start">
        <slot name="leading" />
      </div>
      <h1 class="flex min-w-0 items-center gap-2 text-title text-default text-left lg:justify-self-center lg:text-center">
        <slot name="icon">
          <UiIcon v-if="icon" :name="icon" class="size-4 text-dimmed shrink-0" aria-hidden="true" />
        </slot>
        <span class="truncate">{{ title }}</span>
      </h1>
      <div class="flex items-center gap-3 shrink-0 lg:justify-self-end">
        <slot name="actions" />
      </div>
    </div>

    <!-- Default layout: title (+ crumbs) left, actions right. -->
    <div v-else class="flex items-start gap-4 pt-3 sm:pt-5">
      <div class="flex flex-row items-start justify-between min-w-0 w-full gap-3">
        <div class="min-w-0">
          <!-- Optional eyebrow above the title (e.g. the per-site switcher).
               Renders nothing when the slot is empty, so no spurious gap. -->
          <slot name="eyebrow" />
          <nav v-if="crumbs.length" aria-label="Breadcrumb" class="flex items-center gap-2 text-xs text-dimmed mb-1">
            <template v-for="(crumb, i) in crumbs" :key="crumb.to ?? crumb.label">
              <NuxtLink v-if="crumb.to" :to="crumb.to" class="hover:text-default">
                {{ crumb.label }}
              </NuxtLink>
              <span
                v-else
                class="text-muted truncate max-w-[300px]"
                :aria-current="i === crumbs.length - 1 ? 'page' : undefined"
              >
                {{ crumb.label }}
              </span>
              <UiIcon
                v-if="i < crumbs.length - 1"
                name="chevron-right"
                class="size-3"
                aria-hidden="true"
              />
            </template>
          </nav>
          <h1 class="text-title text-default flex items-center gap-2 min-w-0">
            <slot name="icon">
              <UiIcon v-if="icon" :name="icon" class="size-4 text-dimmed shrink-0" aria-hidden="true" />
            </slot>
            <span class="truncate">{{ title }}</span>
          </h1>
        </div>
        <div class="flex items-center justify-end gap-3 flex-wrap shrink-0">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>
