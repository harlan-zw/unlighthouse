<script lang="ts" setup>
import type { UnlighthouseColumn, UnlighthouseRouteReport } from 'unlighthouse'
import { get } from 'lodash-es'

const props = defineProps<{
  report: UnlighthouseRouteReport
  column: UnlighthouseColumn
}>()

const value = computed(() => {
  return props.column.key ? get(props.report, props.column.key) : undefined
})
</script>

<template>
  <div
    :class="[`col-span-${column.cols || '2'}`, ...(column.classes ? column.classes : [])]"
    class="flex items-center"
  >
    <slot />
    <AuditResult v-if="(value as any)?.scoreDisplayMode === 'error'" :value="{ score: 0, displayValue: (value as any).errorMessage }" />
    <AuditResult v-else-if="(value as any)?.scoreDisplayMode === 'notApplicable'" :value="{ score: null, displayValue: 'n/a' }" />
    <component :is="column.component" v-else-if="column.component" :report="report" :column="column" :value="value" />
    <template v-else-if="!!value">
      <Tooltip v-if="(value as any).details?.items?.length > 0">
        <div v-if="typeof value === 'number'" class="text-base font-mono">
          {{ value }}
        </div>
        <div v-else-if="typeof value === 'string'" class="text-xs opacity-80 font-mono">
          {{ value }}
        </div>
        <AuditResult v-else-if="typeof (value as any).displayValue !== 'undefined'" :value="value as any" />
        <AuditResultItemsLength v-else-if="!!(value as any).details?.items" :value="value as any" />
        <AuditResult v-else-if="typeof (value as any).score !== 'undefined'" :value="{ score: (value as any).score }" />
        <template #tooltip>
          <div v-for="(item, key) in (value as any).details.items" :key="key" class="mb-2 flex text-xs ">
            <div v-if="item.node?.nodeLabel" class="mb-2">
              <div class="break-all mb-1">
                {{ item.node?.nodeLabel }}
              </div>
              <div class="break-all opacity-80">
                {{ item.node.snippet }}
              </div>
            </div>
            <div v-else-if="item.description && item.sourceLocation" class="mb-2">
              <div class="break-all mb-1">
                {{ item.description }}
              </div>
              <div class="break-all opacity-80">
                {{ item.sourceLocation.url }}
              </div>
            </div>
            <div v-for="(v, k) in item" v-else :key="k">
              <span class="mb-1">{{ k }}:</span> <span class="opacity-80 break-all">{{ v }}</span>
            </div>
          </div>
        </template>
      </Tooltip>
      <template v-else>
        <div v-if="typeof value === 'number'" class="text-base font-mono">
          {{ value }}
        </div>
        <div v-else-if="typeof value === 'string'" class="text-xs opacity-80 font-mono">
          {{ value }}
        </div>
        <AuditResult v-else-if="typeof (value as any).displayValue !== 'undefined'" :value="value as any" />
        <AuditResultItemsLength v-else-if="!!(value as any).details?.items" :value="value as any" />
        <AuditResult v-else-if="typeof (value as any).score !== 'undefined'" :value="{ score: (value as any).score }" />
      </template>
    </template>
  </div>
</template>
