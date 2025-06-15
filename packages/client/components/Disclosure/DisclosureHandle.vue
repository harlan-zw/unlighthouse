<template>
  <Disclosure v-slot="{ open }" default-open>
    <DisclosureButton
      class="flex items-center transition justify-between w-full px-2 py-1 my-1 text-sm font-medium text-left border-2 border-blue-900/30 text-blue-900/70 hover:text-blue-700 hover:bg-blue-200 dark:border-none dark:bg-blue-900/30 dark:text-blue-100 dark:hover:bg-blue-900/50 dark:hover:text-blue-50 rounded-lg focus:outline-none focus-visible:ring focus-visible:ring-blue-500/75"
    >
      <slot name="label" />
      <i-carbon-chevron-up
        :class="open ? 'transform rotate-180' : ''"
        class="w-5 h-5 color-current transition"
      />
    </DisclosureButton>
    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-out"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <DisclosurePanel class="bg-teal-50 dark:bg-transparent">
        <slot />
      </DisclosurePanel>
    </transition>
  </Disclosure>
</template>
