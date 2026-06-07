<script setup lang="ts">
import type { UiIcon } from '../../shared/ui-icons'

// Page header: breadcrumb + title + description + trailing actions slot.
// Extracted after six sibling pages converged on the same shape
// (overview, queries list, pages list, countries, indexing, sitemaps).

interface Crumb {
  label: string
  to?: string
}

const { crumbs = [], title, icon, description, flush = false } = defineProps<{
  crumbs?: Crumb[]
  title: string
  icon?: UiIcon
  description?: string
  /** Skip pro-container (max-width + horizontal padding). Use in non-pro shells where padding is owned by the layout. */
  flush?: boolean
}>()
</script>

<template>
  <header class="border-b border-default pb-3" :class="flush ? '' : 'pro-container'">
    <div class="flex items-start gap-4 pt-5">
      <div class="flex flex-col sm:flex-row justify-between min-w-0 w-full gap-3 sm:gap-0">
        <div class="min-w-0">
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
                name="i-lucide-chevron-right"
                class="size-3"
                aria-hidden="true"
              />
            </template>
          </nav>
          <h1 class="text-title text-default flex items-center gap-2 min-w-0">
            <slot name="icon">
              <UiIcon v-if="icon" :name="icon" class="size-4 text-dimmed shrink-0" />
            </slot>
            <span class="truncate">{{ title }}</span>
          </h1>
          <p v-if="description" class="text-description mt-0.5">
            {{ description }}
          </p>
        </div>
        <div class="flex items-center gap-3 flex-wrap shrink-0">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>
