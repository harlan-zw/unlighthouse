<script lang="ts" setup>
const props = defineProps<{
  position: 'left'|'bottom'
}>()
</script>
<template>
<Popover v-slot="{ open, close }" class="relative flex items-center justify-end">
  <PopoverButton
      :class="open ? 'bg-teal-100 ring-2' : ''"
      :title="open ? 'Close Actions' : 'Open Actions'"
      class="inline-flex items-center px-2 py-1 text-sm font-medium text-white rounded-md group bg-blue-50 dark:(bg-teal-700/30 hover:bg-teal-700/70) hover:(text-opacity-100 bg-blue-100) transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
  >
    <i-mdi-dots-horizontal
        :class="open ? 'rotate-270 scale-125' : ''"
        class="w-5 h-5 text-teal-800 dark:(text-teal-300) transform transition duration-500 ease-in-out group-hover:text-opacity-80"
        aria-hidden="true"
    />
  </PopoverButton>

  <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-1 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-1 opacity-0"
  >
    <PopoverPanel
        :class="position !== 'bottom' ? ['-translate-x-[110%]', 'left-1/2'] : ['right-0', 'top-2/3']"
        class="absolute z-10 px-4 mt-3 transform sm:px-0"
    >
      <div
          class="overflow-hidden rounded-lg shadow-lg ring-1 ring-black ring-opacity-5"
      >
        <div class="relative p-2 bg-teal-50/90 dark:(bg-teal-900/99 text-gray-100) text-gray-800">
          <slot :open="open" :close="close" />
        </div>
      </div>
    </PopoverPanel>
  </transition>
</Popover>
</template>
