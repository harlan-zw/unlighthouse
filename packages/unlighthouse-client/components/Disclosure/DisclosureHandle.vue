<template>
<Disclosure v-slot="{ open }" default-open ref="disclosure">
  <DisclosureButton
      class="flex justify-between w-full px-2 py-1 my-2 text-sm font-medium text-left text-purple-900 bg-purple-100 dark:(bg-blue-900/10 text-blue-100) rounded-lg hover:bg-blue-900/50 focus:outline-none focus-visible:ring focus-visible:ring-purple-500 focus-visible:ring-opacity-75"
  >
    <slot name="label"></slot>
    <i-carbon-chevron-up
        :class="open ? 'transform rotate-180' : ''"
        class="w-4 h-4 text-blue-200"
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
    <DisclosurePanel class="px-2 text-sm text-gray-500">
      <slot />
    </DisclosurePanel>
  </transition>
</Disclosure>
</template>
