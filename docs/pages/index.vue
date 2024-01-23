<script setup lang="ts">
definePageMeta({
  breadcrumb: {
    icon: 'i-heroicons-solid-home',
    ariaLabel: 'Home',
  },
})

const code = ref('')
const cursor = ref(false)

const showLighthouse3d = ref(false)

onMounted(() => {
  // show the lighthouse 3d after 1 second if we have a laptop screen or higher
  if (window.innerWidth > 1024) {
    useTimeoutFn(() => {
      showLighthouse3d.value = true
    }, 1000)
  }

  const blink = useDebounceFn(() => {
    // cursor.value = !cursor.value
    write()
  }, 500)

  const codeToWrite = 'npx unlighthouse --site #your-site'
  const write = useDebounceFn(() => {
    // need to right trim the _ character from code.value
    if (code.value.endsWith('█'))
      code.value = code.value.slice(0, -1)

    if (code.value.length < codeToWrite.length)
      code.value += codeToWrite[code.value.length]

    // start blink
    blink()
    // conditionally show the blink
    if (cursor.value)
      code.value += '█'
  }, 70)

  watch(() => code.value.length, write, {
    immediate: true,
  })
})

defineOgImageComponent('NuxtSeo', {
  title: 'Unlighthouse',
  description: 'Like Google Lighthouse, but it scans every single page.',
  theme: '#a855f7',
})
</script>

<template>
  <div>
    <Gradient class="absolute w-full left-0 top-0 z-[-1]" />
    <section class="flex items-center my-[5rem]">
      <div class="lg:max-w-[45rem]">
        <h1 class="font-title text-gray-900 dark:text-gray-100 text-center text-4xl leading-25 font-extrabold tracking-tight sm:text-5xl lg:text-left lg:text-6xl" style="line-height: 1.3;">
          <span class="max-w-2xl">Like Google Lighthouse, but it scans every single page.</span>
        </h1>
        <p class="text-gray-700 dark:text-gray-300 mt-4 max-w-3xl text-center text-xl lg:text-left">
          Unlighthouse is a tool to scan your entire site with Google Lighthouse in 2 minutes (on average). Open source, fully configurable with minimal setup.
        </p>

        <div class="mt-3 flex flex-col items-center justify-center gap-4 sm:mt-10 sm:flex-row sm:gap-6 lg:justify-start">
          <UButton size="xl" color="purple" to="/guide/getting-started/unlighthouse-cli">
            Get started
          </UButton>
        </div>
      </div>
      <div class="items-center justify-center w-full hidden lg:flex">
        <client-only>
          <lazy-lighthouse-three-d v-if="showLighthouse3d" />
        </client-only>
      </div>
    </section>
    <section class="my-[5rem]">
      <h2 class="text-center font-semibold text-3xl mb-5">
        Step 1. Run the command
      </h2>
      <div class="max-w-[40rem] mx-auto">
        <p class="mb-7 text-gray-700 dark:text-gray-300 mt-4 max-w-3xl text-center text-xl lg:text-left">
          Run the command below in your terminal. It will scan your site and generate a report.
        </p>
        <div class="flex items-center space-x-10">
          <!--   we need to style this div like a nice terminal bash using tailwind   -->
          <div class="max-w-full overflow-x-auto flex flex-grow items-center  space-x-3 border-2 border-solid border-gray-600/50 dark:bg-[#121212] lg:p-5 p-2 text-gray-300 font-mono lg:text-lg rounded-t-lg shadow-xl relative">
            <div class="hidden lg:block">
              &gt;
            </div><OCodeBlock class="text-xl flex-grow" :lines="false" :code="code" lang="bash" />
          </div>
        </div>
      </div>
    </section>
    <section class="my-[5rem]">
      <h2 class="text-center font-semibold text-3xl mb-5">
        Step 2. View the report
      </h2>
      <iframe src="https://inspect.unlighthouse.dev/" class="w-full h-[700px] rounded-lg shadow-lg" />
    </section>
    <section class="py-5 sm:py-10 xl:py-20">
      <h2 class="mb-10 text-3xl font-bold font-title">
        Features
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <ShowcaseCard label="Speedy Scans" description="Take advantage of your CPU with threaded workers and use opportunistic throttling and categories for lightning quick scans.">
          <Icon name="noto:high-voltage" class="w-1/2 h-1/2" />
        </ShowcaseCard>
        <ShowcaseCard label="Zero-config Link Crawling" description="Fast, configurable URL discovery using robots.txt, sitemap.xml, internal link crawling and project file scanning.">
          <Icon name="noto:lady-beetle" class="w-1/2 h-1/2" />
        </ShowcaseCard>
        <ShowcaseCard label="No Time Wasted" description="Fewer URLs to scan with automatic sampling of dynamic routes. Hook up your local project files to make it even smarter.">
          <Icon name="noto:sushi" class="w-1/2 h-1/2" />
        </ShowcaseCard>
        <ShowcaseCard label="Modern UI" description="View your sites' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.">
          <Icon name="noto:rainbow" class="w-1/2 h-1/2" />
        </ShowcaseCard>
        <ShowcaseCard label="SEO Goodies" description="View all of your pages titles, share images, meta descriptions, see how many internal and external links you have.">
          <Icon name="noto:candy" class="w-1/2 h-1/2" />
        </ShowcaseCard>
        <ShowcaseCard label="Accessibility Summary" description="See how your sites accessibility stacks up, find high-leverage issues to fix easily and visually see colour contrast issues.">
          <Icon name="noto:check-mark-button" class="w-1/2 h-1/2" />
        </ShowcaseCard>
      </div>
    </section>
    <section>
      <h2 class="mb-10 text-3xl font-title font-bold">
        Sponsors
      </h2>

      This package is most possible by these amazing sponsors.

      <a href="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
        <img src="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg" width="800" height="545" style="margin: 0 auto;">
      </a>
    </section>
  </div>
</template>
