<script lang="ts" setup>
const props = defineProps<{
  to?: string
  label: string
  description: string
  icon?: string
}>()

const NuxtLink = resolveComponent('NuxtLink')
const linkAttrs = computed(() => {
  const attrs: Record<string, string> = {}
  if (props.to)
    attrs.to = props.to
  return attrs
})
</script>

<template>
<div class="showcase-card relative h-full">
  <Component :is="to ? NuxtLink : 'div'" v-bind="linkAttrs" class="h-full">
    <div class="group relative border hover:border-yellow-400 transition rounded-xl overflow-hidden h-full">
      <div
        class="h-48 relative flex items-center justify-center bg-no-repeat bg-cover border-b-2 border-gray-100/30 dark:border-gray-900/10"
        style="background-image: url('/grid.png')"
      >
        <div
          class="blur-overlay w-full h-full absolute pointer-events-none"
        />
        <div class="z-10 text-yellow-200 group-hover:text-[1.25rem] w-full h-full flex items-center justify-center group-hover:text-yellow-500 transition-all relative transform  group-hover:drop-shadow-xl group-hover:scale-110">
          <slot />
        </div>
        <slot name="teleport" />
      </div>

      <div class="p-4">
        <h3 class="font-semibold mb-1">
          {{ label }}
        </h3>
        <p class="text-sm mt-1 text-gray-500">
          {{ description }}
        </p>
      </div>
    </div>
  </Component>
</div>
</template>
