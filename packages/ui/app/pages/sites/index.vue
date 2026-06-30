<script setup lang="ts">
import { useSitesRegistry } from '~/features/sites/registry'

definePageMeta({ layout: 'root' })

const {
  isEmpty,
  sitesError,
  refresh,
  editing,
  formOpen,
  formUrl,
  formName,
  formGroup,
  saving,
  grouped,
  groupSuggestions,
  openAdd,
  openEdit,
  saveSite,
  deleteSite,
  scanSite,
} = useSitesRegistry()
</script>

<template>
  <div class="space-y-6">
    <PageHeader title="Sites" description="Manage your monitored websites." flush>
      <template #actions>
        <UModal v-model:open="formOpen" :title="editing ? 'Edit Site' : 'Add Site'" :ui="{ content: 'sm:max-w-md' }">
          <UButton color="primary" variant="solid" icon="i-lucide-plus" label="Add Site" @click="openAdd" />
          <template #body>
            <form id="site-form" class="space-y-4" @submit.prevent="saveSite">
              <UFormField label="URL">
                <UInput v-model="formUrl" placeholder="https://example.com" required class="w-full font-mono" />
              </UFormField>
              <p v-if="editing && formUrl !== editing.url" class="text-[11px] text-warning">
                Changing the URL creates a new site — the old one will remain.
              </p>
              <UFormField label="Display name" hint="optional">
                <UInput v-model="formName" :placeholder="editing?.name || 'example.com'" class="w-full" />
              </UFormField>
              <UFormField label="Group" hint="optional">
                <UInput v-model="formGroup" list="site-group-suggestions" placeholder="e.g. Production, Staging" class="w-full" />
                <datalist id="site-group-suggestions">
                  <option v-for="g in groupSuggestions" :key="g" :value="g" />
                </datalist>
              </UFormField>
            </form>
          </template>
          <template #footer>
            <UiButton purpose="cta" type="submit" form="site-form" :loading="saving" :disabled="saving || !formUrl.trim()">
              {{ editing ? 'Save' : 'Add' }}
            </UiButton>
          </template>
        </UModal>
      </template>
    </PageHeader>

    <QueryError v-if="sitesError" :error="sitesError" :on-retry="refresh" />

    <div v-else-if="isEmpty" class="flex flex-col items-center justify-center py-16 text-center">
      <Icon name="lucide:globe" class="size-12 text-muted/50 mb-4" />
      <p class="text-muted">
        No sites registered yet.
      </p>
      <p class="text-xs text-muted mt-1">
        Add a site to start monitoring.
      </p>
    </div>

    <section v-for="bucket in grouped" v-else :key="bucket.name || '__ungrouped'" class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 class="eyebrow">
          {{ bucket.name || 'Ungrouped' }}
        </h2>
        <UBadge color="neutral" variant="soft" size="xs" class="tabular-nums">
          {{ bucket.items.length }}
        </UBadge>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UiCard v-for="site in bucket.items" :key="site.id" size="sm">
          <div class="flex items-start justify-between mb-3">
            <NuxtLink :to="`/sites/${siteSlug(site.url)}`" class="min-w-0 flex-1 group flex items-center gap-2.5">
              <Favicon :domain="siteSlug(site.url)" :size="28" :alt="`${site.name} favicon`" class="mt-0.5" />
              <div class="min-w-0">
                <div class="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {{ site.name }}
                </div>
                <div class="text-xs text-muted font-mono truncate mt-0.5">
                  {{ site.url }}
                </div>
              </div>
            </NuxtLink>
          </div>
          <div class="text-xs text-muted mb-3">
            Added {{ new Date(site.createdAt).toLocaleDateString() }}
            <span v-if="site.group"> · {{ site.group }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UiButton purpose="secondary" size="sm" class="flex-1" icon="i-lucide-radar" @click="scanSite(site.url)">
              Scan
            </UiButton>
            <UiButton purpose="quiet" size="sm" icon="i-lucide-pencil" @click="openEdit(site)" />
            <UModal
              title="Remove site?"
              :description="`This removes ${site.name} from the registry. Scan history will be preserved.`"
            >
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" />
              <template #footer="{ close }">
                <UiButton purpose="quiet" @click="close">
                  Cancel
                </UiButton>
                <UiButton purpose="danger" @click="() => { deleteSite(site.id); close() }">
                  Remove
                </UiButton>
              </template>
            </UModal>
          </div>
        </UiCard>
      </div>
    </section>
  </div>
</template>
