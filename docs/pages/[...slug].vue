<script setup lang="ts">
import { findPageHeadline, mapContentNavigation } from '#imports'

const route = useRoute()

const { data: page } = await useAsyncData(`docs-${route.path}`, () => queryContent(route.path).findOne())
if (!page.value)
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const { data: surround } = await useAsyncData(`docs-${route.path}-surround`, () => queryContent()
  .only(['_path', 'title', 'navigation', 'description'])
  .where({ _extension: 'md', navigation: { $ne: false } })
  .findSurround(route.path.endsWith('/') ? route.path.slice(0, -1) : route.path))

useSeoMeta({
  title: () => page.value?.title || '',
  description: () => page.value?.description,
})

const navigation = inject('navigation')
const segment = computed(() => route.path.split('/')[1])
const children = computed(() => {
  if (!segment.value)
    return navigation.value

  // first segment
  switch (segment.value) {
    case 'guide':
      return navigation.value[0].children
    case 'integrations':
      return navigation.value[1].children
    case 'api':
      return navigation.value[2].children
  }
  return []
})

const headline = computed(() => findPageHeadline(page.value))
const communityLinks = computed(() => [
  {
    icon: 'i-ph-chat-centered-text-duotone',
    label: 'Discord Support',
    to: 'https://discord.gg/275MBUBvgP',
    target: '_blank',
  },
  {
    icon: 'i-ph-hand-heart-duotone',
    label: 'Become a Sponsor',
    to: 'https://github.com/sponsors/harlan-zw',
    target: '_blank',
  },
])

const repoLinks = computed(() => [
  {
    icon: 'i-ph-github-logo',
    label: 'Open an issue',
    to: `https://github.com/harlan-zw/unlighthouse/issues/new/choose`,
    target: '_blank',
  },
  {
    icon: 'i-ph-pen-duotone',
    label: 'Edit this page',
    to: `https://github.com/harlan-zw/unlighthouse/edit/main/docs/content/${page?.value?._file}`,
    target: '_blank',
  },
])

defineOgImageScreenshot()
</script>

<template>
  <div>
    <UMain class="relative">
      <UPage :ui="{ wrapper: 'xl:gap-10' }">
        <template #left>
          <UAside>
            <UNavigationTree v-if="children" :links="mapContentNavigation(children)" />
          </UAside>
        </template>
        <div>
          <UPage :ui="{ wrapper: 'xl:gap-18' }">
            <UPageHeader :title="page.title" :description="page.description" :links="page.links" :headline="headline" />

            <UPageBody prose class="pb-0">
              <ContentRenderer v-if="page.body" :value="page" />
              <hr v-if="surround?.length" class="my-8">
              <UDocsSurround :surround="surround" />
            </UPageBody>

            <template #right>
              <UDocsToc :links="page.body?.toc?.links || []">
                <template #bottom>
                  <div class="hidden !mt-6 lg:block space-y-6">
                    <Ads />
                    <UPageLinks title="Repo Links" :links="repoLinks" />
                    <UDivider dashed />
                    <UDivider v-if="page.body?.toc?.links?.length" dashed />
                    <UPageLinks title="Community" :links="communityLinks" />
                    <UDivider dashed />
                  </div>
                </template>
              </UDocsToc>
            </template>
          </UPage>
        </div>
      </UPage>
    </UMain>
  </div>
</template>
