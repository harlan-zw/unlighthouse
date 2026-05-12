<script setup lang="ts">
import { useSites } from '~/composables/sites'

definePageMeta({ layout: 'dashboard' })

const { sites, groups, sitesByGroup } = useSites()

const ungrouped = computed(() => sitesByGroup.value.get(null) || [])
const groupedList = computed(() =>
  groups.value
    .map(g => ({ ...g, sites: sitesByGroup.value.get(g.id) || [] }))
    .filter(g => g.sites.length),
)
</script>

<template>
  <div>
    <!-- Empty state: integrated onboarding -->
    <div v-if="!sites.length" class="max-w-2xl mx-auto py-20 text-center">
      <div class="size-14 rounded-2xl ring-1 ring-default bg-elevated/60 mx-auto mb-6 flex items-center justify-center">
        <UIcon name="i-heroicons-light-bulb" class="size-7 text-highlighted" />
      </div>
      <h1 class="text-2xl font-semibold mb-2">
        Track your first site
      </h1>
      <p class="text-muted mb-8">
        Add a site to start running Lighthouse audits. You can group sites, track history, and connect cloud services from here.
      </p>
      <div class="flex justify-center gap-3">
        <UButton to="/sites/add" icon="i-heroicons-plus" size="lg" color="primary">
          Add a site
        </UButton>
        <UButton to="/integrations" variant="outline" color="neutral" icon="i-heroicons-puzzle-piece" size="lg">
          Integrations
        </UButton>
      </div>
    </div>

    <div v-else>
      <header class="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold text-highlighted">
            Sites
          </h1>
          <p class="text-sm text-muted mt-1">
            {{ sites.length }} site{{ sites.length === 1 ? '' : 's' }} tracked
          </p>
        </div>
        <UButton to="/sites/add" icon="i-heroicons-plus" color="primary">
          Add site
        </UButton>
      </header>

      <section v-for="group in groupedList" :key="group.id" class="mb-8">
        <h2 class="text-[11px] font-semibold text-dimmed uppercase tracking-widest mb-3 px-1">
          {{ group.name }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SiteCard v-for="site in group.sites" :key="site.id" :site="site" />
        </div>
      </section>

      <section v-if="ungrouped.length" class="mb-8">
        <h2 class="text-[11px] font-semibold text-dimmed uppercase tracking-widest mb-3 px-1">
          Ungrouped
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SiteCard v-for="site in ungrouped" :key="site.id" :site="site" />
        </div>
      </section>
    </div>
  </div>
</template>
