<script setup lang="ts">
import { useSitesRegistry } from '~/features/sites/registry'

definePageMeta({ layout: 'root' })
usePageTitle('Sites')

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
    <UiPageHeader title="Sites" description="Manage your monitored websites." flush>
      <template #actions>
        <UModal v-model:open="formOpen" :title="editing ? 'Edit Site' : 'Add Site'" :ui="{ content: 'sm:max-w-md' }">
          <UiButton purpose="cta" icon="add" label="Add Site" @click="openAdd" />
          <template #body>
            <form id="site-form" class="space-y-4" @submit.prevent="saveSite">
              <UFormField label="URL">
                <UInput v-model="formUrl" placeholder="https://example.com" aria-label="Site URL" required class="w-full font-mono" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              </UFormField>
              <p v-if="editing && formUrl !== editing.url" class="text-[11px] text-warning">
                Changing the URL creates a new site — the old one will remain.
              </p>
              <UFormField label="Display name" hint="optional">
                <UInput v-model="formName" :placeholder="editing?.name || 'example.com'" aria-label="Display name" class="w-full" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
              </UFormField>
              <UFormField label="Group" hint="optional">
                <UInput v-model="formGroup" list="site-group-suggestions" placeholder="e.g. Production, Staging" aria-label="Group" class="w-full" :ui="{ base: 'min-h-11 lg:min-h-8' }" />
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
    </UiPageHeader>

    <QueryError v-if="sitesError" :error="sitesError" :on-retry="refresh" />

    <UiEmptyState
      v-else-if="isEmpty"
      icon="globe"
      title="No sites registered yet."
      description="Add a site to start monitoring."
    />

    <section v-for="bucket in grouped" v-else :key="bucket.name || '__ungrouped'" class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 class="eyebrow">
          {{ bucket.name || 'Ungrouped' }}
        </h2>
        <UiChip purpose="count" tabular>
          {{ bucket.items.length }}
        </UiChip>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UiCard v-for="site in bucket.items" :key="site.id" size="sm">
          <div class="flex items-start justify-between mb-3">
            <NuxtLink :to="`/sites/${siteSlug(site.url)}`" class="min-w-0 min-h-11 flex-1 group flex items-center gap-2.5">
              <UiFavicon :domain="siteSlug(site.url)" :size="28" :alt="`${site.name} favicon`" class="mt-0.5" />
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
            <UiButton purpose="secondary" size="sm" class="flex-1" icon="radar" @click="scanSite(site.url)">
              Scan
            </UiButton>
            <UiButton purpose="quiet" size="sm" icon="edit" aria-label="Edit site" @click="openEdit(site)" />
            <UModal
              title="Remove site?"
              :description="`This removes ${site.name} from the registry. Scan history will be preserved.`"
            >
              <UiButton purpose="quiet" size="sm" icon="delete" aria-label="Remove site" />
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
