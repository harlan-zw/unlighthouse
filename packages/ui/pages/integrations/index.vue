<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  category: 'scan' | 'storage' | 'data' | 'automation'
  enabled: boolean
  badge?: string
}

const integrations = ref<Integration[]>([
  {
    id: 'cloud-scans',
    name: 'Unlighthouse Cloud scans',
    description: 'Run scans on hosted runners instead of local Chrome. Higher throughput, reproducible environment.',
    icon: 'i-heroicons-cloud',
    category: 'scan',
    enabled: false,
    badge: 'Beta',
  },
  {
    id: 'storage',
    name: 'Storage backend',
    description: 'Choose where scan results and history are persisted. Local SQLite or cloud-managed.',
    icon: 'i-heroicons-circle-stack',
    category: 'storage',
    enabled: false,
  },
  {
    id: 'psi-crux',
    name: 'PageSpeed Insights / CrUX',
    description: 'Augment lab scores with real-user Core Web Vitals from Chrome users.',
    icon: 'i-heroicons-chart-bar',
    category: 'data',
    enabled: false,
  },
  {
    id: 'webhooks',
    name: 'Webhooks & scheduled scans',
    description: 'Run scans on a schedule and emit outbound webhooks on completion or regression.',
    icon: 'i-heroicons-clock',
    category: 'automation',
    enabled: false,
  },
])

const storageBackends = [
  { value: 'local', label: 'Local SQLite' },
  { value: 'cloud', label: 'Unlighthouse Cloud' },
  { value: 's3', label: 'S3-compatible' },
]
const storage = ref<'local' | 'cloud' | 's3'>('local')

const categoryLabels: Record<Integration['category'], string> = {
  scan: 'Scan engine',
  storage: 'Storage',
  data: 'Data sources',
  automation: 'Automation',
}

const grouped = computed(() => {
  const out: Record<string, Integration[]> = {}
  for (const i of integrations.value) {
    if (!out[i.category])
      out[i.category] = []
    out[i.category]!.push(i)
  }
  return out
})
</script>

<template>
  <div class="max-w-4xl">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-highlighted">
        Integrations
      </h1>
      <p class="text-sm text-muted mt-1">
        Connect cloud services, switch storage backends, and automate scans.
      </p>
    </header>

    <section v-for="(items, category) in grouped" :key="category" class="mb-8">
      <h2 class="text-[11px] font-semibold text-dimmed uppercase tracking-widest mb-3 px-1">
        {{ categoryLabels[category as Integration['category']] }}
      </h2>
      <div class="space-y-3">
        <div
          v-for="i in items"
          :key="i.id"
          class="rounded-xl ring-1 ring-default bg-elevated/40 p-4"
        >
          <div class="flex items-start gap-4">
            <div class="size-10 rounded-lg ring-1 ring-default bg-elevated flex items-center justify-center shrink-0">
              <UIcon :name="i.icon" class="size-5 text-highlighted" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-medium text-highlighted">
                  {{ i.name }}
                </h3>
                <UBadge v-if="i.badge" color="warning" variant="soft" size="xs">
                  {{ i.badge }}
                </UBadge>
              </div>
              <p class="text-sm text-muted mt-1">
                {{ i.description }}
              </p>

              <div v-if="i.id === 'storage' && i.enabled" class="mt-3">
                <USelect v-model="storage" :items="storageBackends" />
              </div>
            </div>
            <USwitch v-model="i.enabled" />
          </div>
        </div>
      </div>
    </section>

    <div class="text-xs text-dimmed text-center mt-8 pt-6 border-t border-default">
      These integrations are placeholders. Wiring lands in a future release.
    </div>
  </div>
</template>
