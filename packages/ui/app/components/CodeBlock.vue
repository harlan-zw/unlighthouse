<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const {
  code = '',
  inline = false,
  dense = false,
  wrap = true,
  maxHeight = '32rem',
} = defineProps<{
  code?: string | number | null
  inline?: boolean
  dense?: boolean
  wrap?: boolean
  maxHeight?: string
}>()

const text = computed(() => code == null ? '' : String(code))
</script>

<template>
  <code
    v-if="inline"
    v-bind="$attrs"
    class="code-inline break-all"
  ><slot>{{ text }}</slot></code>
  <pre
    v-else
    v-bind="$attrs"
    class="font-mono text-xs overflow-auto rounded bg-elevated text-muted"
    :class="[
      dense ? 'p-1' : 'p-3',
      wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
    ]"
    :style="{ maxHeight }"
  ><slot>{{ text }}</slot></pre>
</template>
