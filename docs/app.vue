<script setup lang="ts">
const { data: navigation } = await useAsyncData('navigation', () => fetchContentNavigation())

provide('navigation', navigation)
</script>

<template>
  <div>
    <Header />

    <UContainer>
      <NuxtPage />
    </UContainer>

    <ClientOnly>
      <DocsSearch />
    </ClientOnly>

    <footer class="text-sm border-t border-gray-100 dark:border-gray-800 mt-10 text-gray-700 dark:text-gray-200 flex justify-center items-center py-5">
      <div class="mx-auto px-4 sm:px-6 lg:px-8 w-full max-w-7xl items-center flex justify-between">
        <a href="https://www.netlify.com" class="ml-10" data-v-b929e136=""><img class="dark:hidden block" src="https://www.netlify.com/v3/img/components/netlify-light.svg" alt="Deploys by Netlify" data-v-b929e136=""><img class="dark:block hidden" src="https://www.netlify.com/v3/img/components/netlify-dark.svg" alt="Deploys by Netlify" data-v-b929e136=""></a>
        <div class="flex items-center">
          Created and maintained by
          <UButton to="https://harlanzw.com" variant="ghost" :padded="false" class="ml-2">
            <UAvatar src="https://avatars.githubusercontent.com/u/5326365?v=4" size="xs" class="w-5 h-5" /> Harlan Wilton
          </UButton>
        </div>
      </div>
    </footer>

    <NuxtLoadingIndicator />
  </div>
</template>
