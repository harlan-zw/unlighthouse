<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

type Status = 'available' | 'connected' | 'coming-soon'
type Category = 'scan' | 'storage' | 'data' | 'automation'

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  category: Category
  status: Status
}

const integrations = ref<Integration[]>([
  {
    id: 'storage',
    name: 'Storage backend',
    description: 'Where scan results and history are persisted. Local SQLite or cloud-managed.',
    icon: 'i-heroicons-circle-stack',
    category: 'storage',
    status: 'connected',
  },
  {
    id: 'psi-crux',
    name: 'PageSpeed Insights / CrUX',
    description: 'Augment lab scores with real-user Core Web Vitals from Chrome users.',
    icon: 'i-heroicons-chart-bar',
    category: 'data',
    status: 'available',
  },
  {
    id: 'cloud-scans',
    name: 'Unlighthouse Cloud scans',
    description: 'Run scans on hosted runners instead of local Chrome. Higher throughput, reproducible environment.',
    icon: 'i-heroicons-cloud',
    category: 'scan',
    status: 'coming-soon',
  },
  {
    id: 'webhooks',
    name: 'Webhooks & scheduled scans',
    description: 'Run scans on a schedule and emit outbound webhooks on completion or regression.',
    icon: 'i-heroicons-bolt',
    category: 'automation',
    status: 'coming-soon',
  },
])

const filters = [
  { id: 'all', label: 'All' },
  { id: 'connected', label: 'Connected' },
  { id: 'available', label: 'Available' },
  { id: 'coming-soon', label: 'Coming soon' },
] as const

type FilterId = typeof filters[number]['id']
const activeFilter = ref<FilterId>('all')

const filtered = computed(() => {
  if (activeFilter.value === 'all')
    return integrations.value
  return integrations.value.filter(i => i.status === activeFilter.value)
})

const counts = computed(() => ({
  all: integrations.value.length,
  connected: integrations.value.filter(i => i.status === 'connected').length,
  available: integrations.value.filter(i => i.status === 'available').length,
  'coming-soon': integrations.value.filter(i => i.status === 'coming-soon').length,
}))

const expanded = ref<string | null>('storage')

function toggle(i: Integration) {
  if (i.status === 'coming-soon')
    return
  expanded.value = expanded.value === i.id ? null : i.id
}

const storageBackends = [
  { value: 'local', label: 'Local SQLite', hint: 'Default. Stored alongside the dev process.' },
  { value: 'cloud', label: 'Unlighthouse Cloud', hint: 'Managed, multi-device sync.' },
  { value: 's3', label: 'S3-compatible', hint: 'Bring your own bucket.' },
]
const storage = ref<'local' | 'cloud' | 's3'>('local')

const toast = useToast()
function notifyMe(i: Integration) {
  toast.add({
    title: 'We will let you know',
    description: `You will get an in-app notification when ${i.name} ships.`,
    color: 'primary',
    icon: 'i-heroicons-bell',
  })
}

const statusMeta: Record<Status, { label: string, color: 'success' | 'neutral' | 'warning', dot: string }> = {
  'connected': { label: 'Connected', color: 'success', dot: 'bg-success' },
  'available': { label: 'Available', color: 'neutral', dot: 'bg-muted' },
  'coming-soon': { label: 'Coming soon', color: 'warning', dot: 'bg-warning' },
}
</script>

<template>
  <div class="max-w-5xl">
    <header class="mb-8">
      <h1 class="text-2xl font-semibold text-highlighted">
        Integrations
      </h1>
      <p class="text-sm text-muted mt-1.5 max-w-2xl">
        Connect cloud services, switch storage backends, and automate scans. New integrations land regularly.
      </p>
    </header>

    <div class="flex items-center gap-1.5 mb-6 p-1 rounded-lg ring-1 ring-default bg-elevated/40 w-fit">
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        class="text-sm px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
        :class="activeFilter === f.id
          ? 'bg-default text-highlighted shadow-sm ring-1 ring-default'
          : 'text-muted hover:text-default'"
        @click="activeFilter = f.id"
      >
        {{ f.label }}
        <span
          class="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums"
          :class="activeFilter === f.id ? 'bg-elevated text-muted' : 'bg-elevated/80 text-dimmed'"
        >
          {{ counts[f.id] }}
        </span>
      </button>
    </div>

    <div class="grid sm:grid-cols-2 gap-3">
      <div
        v-for="i in filtered"
        :key="i.id"
        class="rounded-xl ring-1 ring-default bg-elevated/40 hover:bg-elevated/70 transition-colors overflow-hidden flex flex-col"
        :class="{ 'opacity-75': i.status === 'coming-soon' }"
      >
        <div class="p-5 flex-1">
          <div class="flex items-start gap-3 mb-3">
            <div class="size-10 rounded-lg ring-1 ring-default bg-default flex items-center justify-center shrink-0">
              <UIcon :name="i.icon" class="size-5 text-muted" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-highlighted leading-tight">
                {{ i.name }}
              </h3>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="size-1.5 rounded-full" :class="statusMeta[i.status].dot" />
                <span class="text-[11px] text-muted">{{ statusMeta[i.status].label }}</span>
              </div>
            </div>
          </div>

          <p class="text-sm text-muted leading-relaxed">
            {{ i.description }}
          </p>
        </div>

        <div class="px-5 py-3 border-t border-default flex items-center justify-end gap-2 bg-default/30">
          <template v-if="i.status === 'coming-soon'">
            <UButton size="xs" variant="soft" color="neutral" icon="i-heroicons-bell" @click="notifyMe(i)">
              Notify me
            </UButton>
          </template>
          <template v-else-if="i.status === 'connected'">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              :icon="expanded === i.id ? 'i-heroicons-chevron-up' : 'i-heroicons-cog-6-tooth'"
              @click="toggle(i)"
            >
              {{ expanded === i.id ? 'Close' : 'Configure' }}
            </UButton>
          </template>
          <template v-else>
            <UButton size="xs" variant="solid" color="primary" icon="i-heroicons-plus" @click="toggle(i)">
              Connect
            </UButton>
          </template>
        </div>

        <div v-if="expanded === i.id && i.id === 'storage'" class="px-5 py-4 border-t border-default bg-default/60 space-y-3">
          <div class="text-[11px] font-semibold text-dimmed uppercase tracking-widest">
            Backend
          </div>
          <div class="space-y-2">
            <label
              v-for="b in storageBackends"
              :key="b.value"
              class="flex items-start gap-3 p-3 rounded-lg ring-1 cursor-pointer transition-colors"
              :class="storage === b.value
                ? 'ring-primary bg-primary/5'
                : 'ring-default hover:bg-elevated/50'"
            >
              <input
                v-model="storage"
                type="radio"
                :value="b.value"
                class="mt-0.5 accent-primary"
              >
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-highlighted">
                  {{ b.label }}
                </div>
                <div class="text-xs text-muted mt-0.5">
                  {{ b.hint }}
                </div>
              </div>
            </label>
          </div>
        </div>

        <div v-else-if="expanded === i.id && i.id === 'psi-crux'" class="px-5 py-4 border-t border-default bg-default/60 space-y-3">
          <UFormField label="API key" hint="Stored locally. Never leaves your machine.">
            <UInput type="password" placeholder="AIza..." />
          </UFormField>
          <div class="flex justify-end">
            <UButton size="xs" color="primary">
              Save & connect
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!filtered.length" class="text-center py-12 text-sm text-dimmed">
      No integrations in this filter.
    </div>

    <div class="text-xs text-dimmed mt-10 pt-6 border-t border-default flex items-center gap-2">
      <UIcon name="i-heroicons-information-circle" class="size-4" />
      Have an integration request? Open an issue on GitHub.
    </div>
  </div>
</template>
