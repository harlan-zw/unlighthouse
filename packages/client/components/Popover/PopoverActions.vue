<script lang="ts" setup>
defineProps<{
  position: 'left' | 'bottom'
}>()
</script>

<template>
  <Popover v-slot="{ open, close }" class="relative flex items-center justify-end">
    <PopoverButton
      :class="open ? 'bg-teal-100 ring-2' : ''"
      :title="open ? 'Close Actions' : 'Open Actions'"
      :aria-expanded="open"
      aria-haspopup="menu"
      aria-label="Open actions menu"
      class="interactive-base justify-center text-white group bg-surface dark:hover:bg-teal-700/70 hover:text-white hover:bg-blue-100 btn-focus cursor-pointer"
    >
      <UIcon
        name="i-mdi-dots-horizontal"
        :class="open ? 'rotate-270 scale-125' : ''"
        class="w-5 h-5 text-teal-800 dark:text-teal-300 transform transition duration-500 ease-in-out group-hover:text-teal-800/80"
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
        :class="position !== 'bottom' ? ['-translate-x-[95%]', 'left-1/2'] : ['right-0', 'top-2/3']"
        class="absolute z-10 px-2 mt-3 transform"
      >
        <div
          class="overflow-hidden rounded-lg shadow-lg ring-1 ring-black/5"
        >
          <div class="relative p-2 bg-teal-50/90 dark:bg-teal-900/99 dark:text-gray-100 text-gray-800">
            <slot :open="open" :close="close" />
          </div>
        </div>
      </PopoverPanel>
    </transition>
  </Popover>
</template>
