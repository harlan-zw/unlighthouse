<template>
  <div class="nui-support-nuxt">
    <div>
      <p class="pt-2 m-0 font-bold sm:text-sm text-gray-900 dark:text-white">
        Unlighthouse needs you!
      </p>
      <p class="pb-2 m-0 leading-normal text-gray-600 dark:text-white sm:text-xs">
        By allowing unlighthouse.dev on your Ad-Blocker, you support our work and help us financially.
      </p>
    </div>
  </div>
</template>

<style lang="postcss">
.nui-support-nuxt {
  @apply py-2 px-4 rounded-md bg-gray-100 dark:bg-white dark:bg-opacity-10 flex flex-row w-full items-center mt-4;
}

@screen sm {
  .nui-support-nuxt {
    @apply flex-col w-40 mt-0;
  }
}
</style>
