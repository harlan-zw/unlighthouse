<script setup lang="ts">
import type { LighthouseAudit } from '@unlighthouse/core'

defineProps<{
  audit: LighthouseAudit
  items?: any[]
  showTooltip?: boolean
}>()
</script>

<template>
  <div>
    <tooltip v-if="showTooltip && items?.length">
      <template #tooltip>
        <div class="text-xs">
          <div class="font-bold mb-2">
            {{ audit.title }}
          </div>
          <div v-if="audit.description" class="mb-2 opacity-80">
            {{ audit.description }}
          </div>
          <div v-if="items?.length" class="space-y-1">
            <div v-for="(item, key) in items.slice(0, 5)" :key="key" class="text-xs">
              <div class="font-medium">
                {{ item.url || item.node?.selector || item.source }}
              </div>
              <div v-if="item.transferSize" class="opacity-70">
                Size: {{ item.transferSize }}
              </div>
            </div>
            <div v-if="items.length > 5" class="text-xs opacity-60 mt-2">
              ... and {{ items.length - 5 }} more
            </div>
          </div>
        </div>
      </template>
      <audit-result :value="{ score: audit.score, displayValue: audit.displayValue }" />
    </tooltip>
    <audit-result v-else :value="{ score: audit.score, displayValue: audit.displayValue }" />
  </div>
</template>
