<template>
<Disclosure v-slot="{ open }" default-open>
  <DisclosureButton
      class="flex justify-between w-full px-4 py-2 text-sm font-medium text-left text-purple-900 bg-purple-100 dark:(bg-blue-900/10 text-blue-100) rounded-lg hover:bg-blue-900/50 focus:outline-none focus-visible:ring focus-visible:ring-purple-500 focus-visible:ring-opacity-75"
  >
    <slot name="label"></slot>
    <i-carbon-chevron-up
        :class="open ? 'transform rotate-180' : ''"
        class="w-5 h-5 text-blue-200"
    />
  </DisclosureButton>
  <DisclosurePanel class="px-4 pt-4 pb-2 text-sm text-gray-500">
    <slot />
  </DisclosurePanel>
</Disclosure>
</template>
