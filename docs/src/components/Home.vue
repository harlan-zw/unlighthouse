<script setup>
const scanFeatures = [
  {
    icon: '⚡',
    title: 'Fast',
    content: '<p>Take advantage of your CPU with threaded workers and use opportunistic throttling and categories for lightning quick scans.</p>',
  },
  {
    icon: '🐞',
    title: 'Automated URL Discovery',
    content: '<p>Fast, configurable URL discovery using sitemap.xml parsing, internal link crawling and project file scanning.</p>',
  },
  {
    icon: '🍣',
    title: 'Dynamic Route Sampling',
    content: ' <p>Fewer URLs to scan with automatic sampling of dynamic routes. Hook up your local project files to make it even smarter.</p>'
  },
]
const clientFeatures = [
  {
    icon: '🌈',
    title: 'Modern UI',
    content: '<p>View your sites\' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.</p>',
  },
  {
    icon: '🍬️',
    title: 'SEO Goodies',
    content: '<p>View all of your pages titles, share images, meta descriptions, see how many internal and external links you have.</p>',
  },
  {
    icon: '✅️',
    title: 'Accessibility Summary',
    content: '<p>See how your sites accessibility stacks up, find high-leverage issues to fix easily and visually see colour contrast issues.</p>',
  },
]

const devFeatures = [
  {
    icon: '🤖',
    title: 'CI Budget Testing',
    content: ' <p>Set a budget for all each category, scan all pages, know if any of the pages breaks the budget. Easy.</p>'
  },
  {
    icon: '🛠',
    title: 'Hackable',
    content: '<p>Unlighthouse was built to modify, with isolated packages, robust API and a generous hook system. You can even modify the columns in the client!</p>',
  },
  {
    icon: '🏠',
    title: 'Static Client Builds',
    content: '<p>Use the CI to upload your sites reports and access them all at any time.</p>',
  },
]
</script>
<template>
  <div class="flex flex-col items-center">
    <div class="w-full px-7 md:px-15 xl:flex items-center justify-between md:(my-10 pb-20) my-7 pb-10">
      <div class="flex flex-col items-left xl:pr-20">
        <h1 class="md:(leading-22 text-6xl w-750px text-left) leading-14 font-bold text-3xl font-500 mt-0 mb-5">
          Scan your <span class="border-b-5 border-blue-400">entire</span> website with
          <span class="whitespace-nowrap"><img src="/lighthouse-logo.svg" height="60" class="md:h-60px h-40px inline mr-2 mb-1 md:mb-2"><a href="https://github.com/GoogleChrome/lighthouse" target="_blank" class="text-inherit">Google Lighthouse️</a></span>
          - in 2 minutes.<sup class="opacity-50 text-2xl ml-3 whitespace-nowrap">(on average)</sup>
        </h1>
        <div class="mb-5">
          <div v-for="(f, i) in ['Open-source', 'Fully Configurable', 'Minimal Setup']" :key="i" class="md:(mr-5 pl-3 pr-4 p-1 text-lg mb-10) opacity-90 mb-5 text-sm rounded-xl mr-2 inline-flex items-center border-1 border-green-500  bg-green-50 pl-2 pr-3 py-1">
            <i-carbon-checkmark-outline class="mr-2 text-green-500" />
            {{ f }}
          </div>
        </div>
        <div
          class="
          text-center
          flex
          flex-col
          sm:flex-row
          flex-wrap
          items-center
          gap-6
          children:my0"
        >
          <a
            href="/guide/"
            :class="'md:(px-7 py-3 text-2xl) px-4 py-2 text-xl font-bold hover:no-underline font-medium rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75'"
            class="flex items-center p-10 bg-gradient-to-t from-sky-500 to-blue-500 text-white  hover:(bg-green-700 scale-105) transform transition children:hover:text-white"
          >
            <p class="break-none m-0 ">
              Read the docs
            </p>
          </a>
        </div>

        <p class="mt-4 mb-3 text-xl md:text-2xl">
          or try it now
        </p>
        <div class="shadow-xl rounded">
          <div class="language-bash border-2 border-blue-900/10 w-full !m-0 rounded relative">
            <pre>
<code><span class="token function">npx unlighthouse --site</span> <span class="token text-[#408c9e] font-500">&lsaquo;your-site&rsaquo;</span></code></pre>
          </div>
        </div>
        <p class="italic opacity-70 text-sm mb-0">
          Requires Node.js >= 14.x.
        </p>
      </div>
      <div class="w-960px mx-auto relative w-full group max-w-full h-auto xl:mt-0 mt-10">
        <video width="960" height="540" autoplay loop muted poster="/screenshot.png" class="max-w-full w-1822px rounded-xl z-1" style="box-shadow: rgb(0 0 0 / 20%) 0px 0px 0px 1px, rgb(0 0 0 / 50%) 0px 0px 30px 1px;">
          <source
            src="/demo.webm"
            type="video/webm"
          >
        </video>
        <a
          href="https://inspect.unlighthouse.dev/"
          target="_blank"
          :class="'px-7 py-3 text-xl font-bold hover:no-underline font-medium rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75'"
          class="absolute top-1/2 left-1/2 transform -translate-x-[50%] -translate-y-[50%] transition-all flex items-center p-10 bg-gradient-to-t from-sky-100 to-blue-100 text-blue-500  hover:(bg-green-700 scale-105) transform transition"
        >
          <p class="break-none m-0 ">
            Open Demo
          </p>
        </a>
      </div>
    </div>

    <div class="bg-gradient-to-r from-emerald-50 to-emerald-100 md:py-15 py-10 w-full">
      <div class="container px-7 md:px-15 mx-auto md:w-1000px">
        <p class="text-center text-6xl">
          🌱
        </p>
        <div class="md:(text-3xl leading-15 text-center) text-xl leading-10 opacity-95">
          Organic growth slowed down?<br>Low conversions?
        </div>
        <h2 class="md:(text-4xl mb-13 leading-17  text-center) text-2xl leading-10 mb-5 border-0  mt-3">
          Maybe some of your pages have <span class="border-blue-400 border-b-4">performance</span>, <span class="border-blue-400 border-b-4">accessibility</span> or <span class="border-blue-400 border-b-4">SEO</span> issues
        </h2>
        <div class="md:(text-2xl leading-12) text-xl opacity-95 mb-3 ">
          Keeping on top of these issues site-wide is hard.
        </div>
        <ul class="md:(text-xl leading-14) mb-7 border-0 ml-0 pl-0">
          <li class="flex items-center">
            <i-carbon-close-outline class="mr-2 w-30px text-red-500/75" />
            Can be pricey to run monitoring with a third-party.
          </li>
          <li class="flex items-center">
            <i-carbon-close-outline class="mr-2 w-30px text-red-500/75" />
            Scanning just your home page is misleading.
          </li>
          <li class="flex items-center">
            <i-carbon-close-outline class="mr-2 w-30px text-red-500/75" />
            Scanning an entire site manually can be slow and inaccurate.
          </li>
          <li class="flex items-center">
            <i-carbon-close-outline class="mr-2 w-30px text-red-500/75" />
            Slow feedback loop in fixing issues.
          </li>
          <li class="flex items-center">
            <i-carbon-close-outline class="mr-2 w-30px text-red-500/75" />
            Too much noise when you have hundreds of pages.
          </li>
        </ul>
      </div>
    </div>

    <div class="bg-gradient-to-r from-blue-100/10 to-emerald-100/10 md:py-15 py-10 w-full">
      <div class="container px-7 md:px-15 mx-auto flex flex-col items-start">
        <h2 id="scanFeatures" class="md:text-4xl text-3xl mb-10 text-center ">
          Scan your site quickly.
        </h2>
        <FeaturesList class="mb-10" :features="scanFeatures" />
      </div>
    </div>

    <div class="bg-gradient-to-r from-yellow-100 to-emerald-100 md:py-15 py-10 w-full">
      <div class="container px-7 md:px-15 mx-auto flex flex-col items-start">
        <h2 id="client" class="md:text-4xl text-3xl mb-10 ">
          Visualise your sites health
        </h2>
        <FeaturesList class="mb-10" :features="clientFeatures" />
      </div>
    </div>

    <div class="md:py-15 py-10 w-full">
      <div class="container px-7 md:px-15  mx-auto flex flex-col items-start">
        <h2 id="features" class="md:text-4xl mt-0 text-3xl mb-10 text-center ">
          Built for Developers
        </h2>
        <FeaturesList class="mb-10" :features="devFeatures" />
      </div>
    </div>

    <div class="bg-gradient-to-r from-orange-500/20 to-teal-100 md:py-15 py-10 w-full">
      <div class="md:mb-15 container px-7 md:px-15 mb-10 md:w-1000px mx-auto">
        <h2 id="integrations" class="md:text-4xl mt-0 text-3xl mb-10">
          Close the feedback loop with integrations
        </h2>
        <p class="md:text-xl mb-5 mt-0">
          Finding issues with your site is one thing, fixing them is another. Unlighthouse comes packed with local development plugins for most popular frameworks.
        </p>
        <p class="md:text-xl">
          See which file belongs to a URL, fix your issue, Unlighthouse will automatically re-audit the page!
        </p>
      </div>
      <div class="flex flex-col md:flex-row md:w-700px text-2xl font-bold mx-auto items-center justify-between">
        <a href="/integrations/vite" class="flex justify-center items-center md:flex-col mb-5">
          <i-logos-vitejs class="md:(mb-4 text-8xl mr-0) mr-2" /><span>Vite</span>
        </a>
        <a href="/integrations/nuxt" class="flex justify-center items-center md:flex-col mb-5">
          <i-logos-nuxt-icon class="md:(mb-4 text-8xl mr-0) mr-2" /><span>Nuxt</span>
        </a>
        <a href="/integrations/webpack" class="flex justify-center items-center md:flex-col mb-5">
          <i-logos-webpack class="md:(mb-4 text-8xl mr-0) mr-2" /><span>webpack</span>
        </a>
      </div>
    </div>

    <div class="md:py-15 py-10 w-full">
      <div class="container px-7 md:px-15  mx-auto flex flex-col  items-center">
        <h2 id="meet-the-team" class="md:text-4xl mt-0 text-3xl mb-10 text-center ">
          Meet the Team
        </h2>
        <div class="p-10 sm:grid gap-10 grid-cols-2">
          <Avatar
            name="Harlan Wilton"
            avatar="https://avatars.githubusercontent.com/u/5326365?v=4"
            github="harlan-zw"
            twitter="harlan_zw"
            :sponsors="true"
          >
            Self-employed Dev<br>Actively contributing to Open Source
          </Avatar>
          <div class="text-center">
            <h3>Want to appear here?</h3>
            <p>I'm looking for developers to join the team.<br> Get in touch with <a href="https://twitter.com/harlan_zw" target="_blank">me</a> :)</p>
          </div>
        </div>
      </div>
    </div>

    <div class="md:py-15 py-10 w-full">
      <div class="container px-7 md:px-15  mx-auto flex flex-col items-center">
        <h2 id="contributors" class="md:text-4xl mt-0 text-3xl mb-10 text-center ">
          Contributors
        </h2>
        <p class="text-center opacity-90">
          These people have financially supported the development of this package. Thanks!
        </p>
        <div class="px-7 md:px-15">
          <a href="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
            <img src="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
          </a>
        </div>
      </div>
      <p class="text-center">
        <a href="https://unlighthouse.dev/chat">Join the community</a> and get involved!
      </p>
    </div>

    <p class="text-center opacity-75">
      <a href="https://www.netlify.com">
        <img src="/netlify.svg" alt="Deploys by Netlify">
      </a>
    </p>
    <div class="mb-30" />
  </div>
</template>
