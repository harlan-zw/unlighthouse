<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

const text = ref('')
const enabled = ref(true)
const selected = ref('one')

// Mini example — a realistic settings form validated by a Zod schema through
// Nuxt UI's <UForm :schema>. In a real page you'd plug a shared contract schema
// straight in. UForm reads the schema (Zod is a Standard Schema, so no adapter), and each
// <UFormField name="…"> binds to a schema key — per-field messages, aria-invalid,
// and validate-after-interaction are all handled by the component, canonically.
const SiteSettingsSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  // Accept a bare domain OR a full URL — don't force a protocol on the user.
  // Normalising to https:// is the server/contract's job, not the form's.
  url: z.string()
    .min(1, 'Site URL is required')
    .refine(v => /^(?:[a-z][\w+.-]*:\/\/)?[^\s./]+\.\S{2,}$/i.test(v.trim()), 'Enter a domain, e.g. example.com'),
  region: z.enum(['us', 'eu', 'ap']),
  crawlFreq: z.number().min(1).max(24),
  notes: z.string().max(500).optional(),
  weekly: z.boolean(),
})
type SiteSettings = z.output<typeof SiteSettingsSchema>

const regions = [
  { label: 'United States', value: 'us' },
  { label: 'Europe', value: 'eu' },
  { label: 'Asia Pacific', value: 'ap' },
]
const state = reactive<Partial<SiteSettings>>({
  name: 'Acme Inc',
  url: '',
  region: 'us',
  crawlFreq: 12,
  notes: '',
  weekly: true,
})
const saved = ref(false)
const settingsForm = useTemplateRef<{ clear: () => void }>('settingsForm')
function onSubmit(_event: FormSubmitEvent<SiteSettings>) {
  // _event.data is the parsed, type-safe payload — ready to POST to the contract's endpoint.
  // UForm only reaches here once validation passes, so error state is already clear.
  saved.value = true
}
function resetForm() {
  state.name = ''
  state.url = ''
  state.notes = ''
  saved.value = false
  // Clear UForm's validation state too — otherwise stale errors linger after a reset.
  settingsForm.value?.clear()
}
// Drop the "Saved" confirmation the moment the user edits again.
watch(state, () => {
  saved.value = false
})

// ── State playground — flip every prop-driven state live ───────────────────
const stDisabled = ref(false)
const stReadonly = ref(false)
const stError = ref(false)
const stLoading = ref(false)
const stRequired = ref(false)
const stIcon = ref(false)
const stSize = ref<'xs' | 'sm' | 'md' | 'lg' | 'xl'>('md')
const stVariant = ref<'outline' | 'subtle'>('outline')
const playInput = ref('Editable value')
const playNotes = ref('Editable value')
const playSelect = ref('one')
const playCheck = ref(true)
const sizeItems = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const variantItems = ['outline', 'subtle'] as const
const playError = computed(() => stError.value ? 'This field needs attention' : undefined)

// Input-type explorer — tab through every type; all share the toggles above.
const inputType = ref<'text' | 'email' | 'password' | 'number' | 'search' | 'url' | 'date' | 'textarea' | 'select' | 'checkbox' | 'switch'>('text')
const inputTypes = [
  { label: 'Text', value: 'text' },
  { label: 'Email', value: 'email' },
  { label: 'Password', value: 'password' },
  { label: 'Number', value: 'number' },
  { label: 'Search', value: 'search' },
  { label: 'URL', value: 'url' },
  { label: 'Date', value: 'date' },
  { label: 'Textarea', value: 'textarea' },
  { label: 'Select', value: 'select' },
  { label: 'Checkbox', value: 'checkbox' },
  { label: 'Switch', value: 'switch' },
]
const textLikeTypes = ['text', 'email', 'password', 'number', 'search', 'url', 'date']
const isTextLike = computed(() => textLikeTypes.includes(inputType.value))
const activeTypeLabel = computed(() => inputTypes.find(t => t.value === inputType.value)?.label ?? 'Input')
const placeholderByType: Record<string, string> = {
  text: 'Placeholder text',
  email: 'you@example.com',
  password: '••••••••',
  number: '0',
  search: 'Search…',
  url: 'example.com',
  date: '',
}
const playPlaceholder = computed(() => placeholderByType[inputType.value] ?? 'Placeholder')
</script>

<template>
  <div class="space-y-10">
    <KitHeader eyebrow="Components" title="Forms" />

    <KitSection title="Inputs" code="<UInput>">
      <div class="grid md:grid-cols-2 gap-4 max-w-2xl">
        <UFormField label="Label" description="Description text">
          <UInput v-model="text" placeholder="Placeholder" />
        </UFormField>
        <UFormField label="With icon">
          <UInput v-model="text" icon="i-carbon-search" placeholder="Search…" />
        </UFormField>
        <UFormField label="Textarea">
          <UTextarea v-model="text" placeholder="Multi-line input" />
        </UFormField>
        <UFormField label="Select">
          <USelect v-model="selected" :items="['one', 'two', 'three']" />
        </UFormField>
      </div>
    </KitSection>

    <KitSection title="Toggles">
      <KitRow label="switch">
        <USwitch v-model="enabled" />
      </KitRow>
      <KitRow label="checkbox">
        <UCheckbox v-model="enabled" label="Accept" />
      </KitRow>
    </KitSection>

    <KitSection title="States" code="interactive playground">
      <div class="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <!-- Controls -->
        <div class="surface-inset rounded-lg p-4 flex flex-col gap-3 h-fit" role="group" aria-labelledby="state-controls-label">
          <span id="state-controls-label" class="text-label text-dimmed">Toggle state</span>
          <UCheckbox v-model="stDisabled" label="Disabled" />
          <UCheckbox v-model="stReadonly" label="Readonly" />
          <UCheckbox v-model="stError" label="Error" />
          <UCheckbox v-model="stLoading" label="Loading" />
          <UCheckbox v-model="stRequired" label="Required" />
          <UCheckbox v-model="stIcon" label="Leading icon" />
          <div class="h-px bg-[var(--ui-border)] my-1" />
          <UFormField label="Size">
            <USelect v-model="stSize" :items="[...sizeItems]" size="sm" />
          </UFormField>
          <UFormField label="Variant">
            <USelect v-model="stVariant" :items="[...variantItems]" size="sm" />
          </UFormField>
        </div>

        <!-- Live preview — tab through every input type; all share the toggles -->
        <div class="flex flex-col gap-4 min-w-0">
          <UTabs
            v-model="inputType"
            :items="inputTypes"
            variant="pill"
            size="xs"
            :content="false"
          />

          <div class="max-w-md pt-1">
            <UFormField
              v-if="isTextLike"
              :label="activeTypeLabel"
              name="play"
              :required="stRequired"
              :error="playError"
            >
              <UInput
                v-model="playInput"
                :type="inputType"
                :size="stSize"
                :variant="stVariant"
                :disabled="stDisabled"
                :readonly="stReadonly"
                :loading="stLoading"
                :required="stRequired"
                :icon="stIcon ? 'i-carbon-search' : undefined"
                :placeholder="playPlaceholder"
              />
            </UFormField>

            <UFormField
              v-else-if="inputType === 'textarea'"
              label="Textarea"
              name="play"
              :required="stRequired"
              :error="playError"
            >
              <UTextarea
                v-model="playNotes"
                :size="stSize"
                :variant="stVariant"
                :disabled="stDisabled"
                :readonly="stReadonly"
                :required="stRequired"
                placeholder="Multi-line input"
              />
            </UFormField>

            <UFormField
              v-else-if="inputType === 'select'"
              label="Select"
              name="play"
              :required="stRequired"
              :error="playError"
            >
              <USelect
                v-model="playSelect"
                :items="['one', 'two', 'three']"
                :size="stSize"
                :variant="stVariant"
                :disabled="stDisabled"
                :loading="stLoading"
                :required="stRequired"
                :icon="stIcon ? 'i-carbon-search' : undefined"
              />
            </UFormField>

            <UFormField
              v-else-if="inputType === 'checkbox'"
              label="Checkbox"
              name="play"
              :required="stRequired"
              :error="playError"
            >
              <UCheckbox v-model="playCheck" label="Accept terms" :disabled="stDisabled" :required="stRequired" />
            </UFormField>

            <UFormField
              v-else
              label="Switch"
              name="play"
              :required="stRequired"
              :error="playError"
            >
              <USwitch v-model="playCheck" label="Enable feature" :disabled="stDisabled" :loading="stLoading" />
            </UFormField>
          </div>

          <p class="text-xs text-dimmed">
            Tab through input types — each reflects the toggles on the left. Hover, focus and autofill are
            interaction states: focus the field (or autofill the mini form below) to see them.
          </p>
        </div>
      </div>

      <!-- Reference matrix — every state at once -->
      <div class="mt-10">
        <span class="text-label text-dimmed">Reference · every state at once</span>
        <div class="grid gap-x-8 gap-y-5 mt-4 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
          <div class="flex flex-col gap-1.5">
            <span id="st-default" class="text-micro text-dimmed">Default</span>
            <UInput model-value="" placeholder="Placeholder" aria-labelledby="st-default" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-filled" class="text-micro text-dimmed">Filled</span>
            <UInput model-value="acme-production" aria-labelledby="st-filled" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-icon" class="text-micro text-dimmed">Leading icon</span>
            <UInput model-value="" icon="i-carbon-search" placeholder="Search…" aria-labelledby="st-icon" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-loading" class="text-micro text-dimmed">Loading</span>
            <UInput model-value="Fetching…" loading aria-labelledby="st-loading" aria-busy="true" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-disabled" class="text-micro text-dimmed">Disabled</span>
            <UInput model-value="Can't edit" disabled aria-labelledby="st-disabled" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-readonly" class="text-micro text-dimmed">Readonly</span>
            <UInput model-value="Read only" readonly aria-labelledby="st-readonly" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-error" class="text-micro text-dimmed">Error</span>
            <UInput model-value="bad value" color="error" highlight aria-labelledby="st-error" aria-invalid="true" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-success" class="text-micro text-dimmed">Success</span>
            <UInput model-value="all good" color="success" highlight aria-labelledby="st-success" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span id="st-subtle" class="text-micro text-dimmed">Subtle variant</span>
            <UInput model-value="" variant="subtle" placeholder="Subtle" aria-labelledby="st-subtle" />
          </div>
        </div>
      </div>
    </KitSection>

    <KitSection title="Mini example · Settings form" code="UForm + Zod contract">
      <UForm
        ref="settingsForm"
        :schema="SiteSettingsSchema"
        :state="state"
        class="mini-form max-w-md"
        @submit="onSubmit"
      >
        <UiCard
          variant="default"
          title="Site settings"
          description="Validated by a Zod schema via <UForm :schema> — per-field errors, aria-invalid and validate-after-interaction handled for free."
        >
          <div class="flex flex-col gap-5">
            <UFormField label="Site name" name="name" required description="Shown across the dashboard.">
              <UInput v-model="state.name" autocomplete="organization" placeholder="Acme Inc" />
            </UFormField>

            <UFormField label="Site URL" name="url" required>
              <!-- type="text" (not "url") so the browser doesn't reject a bare
                   domain for a missing protocol — the Zod refine accepts both. -->
              <UInput
                v-model="state.url"
                type="text"
                inputmode="url"
                autocomplete="url"
                placeholder="example.com"
              />
            </UFormField>

            <UFormField label="Region" name="region">
              <USelect v-model="state.region" :items="regions" />
            </UFormField>

            <UFormField
              label="Crawl frequency"
              name="crawlFreq"
              :description="`Every ${state.crawlFreq}h — native range, brand-tinted via accent-color`"
            >
              <input
                v-model.number="state.crawlFreq"
                type="range"
                min="1"
                max="24"
                class="w-full"
                aria-label="Crawl frequency"
                :aria-valuetext="`Every ${state.crawlFreq} hours`"
              >
            </UFormField>

            <UFormField label="Notes" name="notes" description="Grows with your input (field-sizing: content).">
              <UTextarea v-model="state.notes" placeholder="Anything the team should know…" />
            </UFormField>

            <UCheckbox v-model="state.weekly" label="Email me a weekly report" />

            <div class="flex items-center gap-2 pt-1">
              <UiButton type="submit" purpose="cta">
                Save changes
              </UiButton>
              <UiButton purpose="quiet" @click="resetForm">
                Reset
              </UiButton>
              <span v-if="saved" class="inline-flex items-center gap-1 text-xs text-success">
                <UIcon name="i-lucide-check" class="size-3" /> Saved
              </span>
            </div>
          </div>
        </UiCard>
      </UForm>
    </KitSection>
  </div>
</template>
