<script setup>
const scanFeatures = [
  {
    icon: '⚡',
    title: 'Fast',
    content: '<p>Take advantage of your CPU with multi-threaded workers powered by <a href="https://github.com/thomasdondorf/puppeteer-cluster" target="_blank" rel="noopener">puppeteer-cluster</a> and use opportunistic throttling and categories for lightning quick scans.</p>'
  },
  {
    icon: '🐞',
    title: 'Advanced Crawling',
    content: '<p>Pre-packed with fast, configurable URL discovery using <a href="https://github.com/seantomburke/sitemapper" target="_blank" rel="noopener">sitemap.xml</a> or internal link parsing.</p>'
  },
  {
    icon: '🤓',
    title: 'Intelligent URL Sampling',
    content: ' <p>Scanning a website with thousands of pages? No problem.</p>\n' +
      '<p>Point Unlighthouse to the local project for the scan and any dynamic routes will be sampled based on your page files.</p>'
  },
]
const features = [

  {
    icon: '🌈',
    title: 'Modern UI',
    content: '<p>View your sites\' health as a whole with the Unlighthouse client built with Vite. Easily see, search and sort your pages, re-scan individual pages and more.</p>'
  },
  {
    icon: '🍬️',
    title: 'SEO Goodies',
    content: '<p>View all of your pages titles, share images, meta descriptions, see how many internal and external links you have.</p>'
  },
]

const features2 = [
  {
    icon: '🤖',
    title: 'CI Ready',
    content: ' <p>Set a budget for all each category, scan all pages, know if any of the pages breaks the budget. Easy.</p>' +
      '<p>Use the CI to upload your sites reports and access them all at any time, like <a href="https://inspect.unlighthouse.dev/">inspect.lighthouse.dev</a>.</p>'
  },
  {
    icon: '🛠',
    title: 'Hackable',
    content: '<p>Unlighthouse was built to modify, with isolate packages, robust API and a generous hook system. You can even modify the columns in the client!</p>'
  },
]
</script>
<template>
<div class="flex flex-col items-center">
  <div class="w-full px-20 xl:flex items-center justify-between my-10 pb-20">
    <div class="flex flex-col items-left xl:pr-25">
      <p class="lg:leading-22 font-bold text-2xl lg:text-6xl font-500 mt-0 mb-5 w-750px">
        Scan your <span class="border-b-5 border-blue-400">entire</span> website with
        <img src="/lighthouse-logo.svg" height="60" class="h-60px inline mr-2 mb-2"><a href="https://github.com/GoogleChrome/lighthouse" target="_blank" class="text-inherit">Google Lighthouse️</a>
        - in 2 minutes.<sup class="opacity-50 text-2xl ml-3">(on average)</sup>
      </p>
      <div class="text-xl mb-10">
        <div v-for="(f, i) in ['Open-source', 'Completely Free', 'Zero Setup']" :key="i" class="rounded-xl mr-5 inline-flex items-center border-1 border-green-500  bg-green-50 pl-3 pr-4 py-2">
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
          :class="'px-7 py-3 text-2xl font-bold hover:no-underline font-medium rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75'"
          class="flex items-center p-10 bg-gradient-to-t from-sky-500 to-blue-500 text-white  hover:(bg-green-700 scale-105) transform transition children:hover:text-white"
        >
          <p class="break-none m-0 ">
            Read the docs
          </p>
        </a>

      </div>

      <p class="mt-4 mb-3 text-2xl">or try it now</p>
      <div class="shadow-xl rounded">
        <div class="language-bash border-2 border-blue-900/10 w-full !m-0 rounded relative">
        <pre>
<code><span class="token function">npx unlighthouse --site</span> <span class="token text-[#408c9e] font-500">&lsaquo;your-site&rsaquo;</span></code></pre>
        </div>
      </div>
      <p class="italic opacity-70 text-sm">Requires Node.js >= 14.x.</p>
    </div>
    <div w="890px" class="relative h-450px xl:h-650px xl:w-890px w-full shadow-xl rounded-xl group max-w-full h-auto bg-image-wrap xl:mt-0 mt-10" style="box-shadow: rgb(0 0 0 / 20%) 0px 0px 0px 1px, rgb(0 0 0 / 50%) 0px 0px 30px 1px;">
      <div style="background-image: url('/screenshot.png');" class="bg-image max-w-full  w-1822px h-450px xl:h-650px absolute rounded-xl z-1">
      </div>
      <div class="w-full h-full absolute z-2 bg-gradient-to-l from-teal-800/20 rounded-xl">
      </div>
    </div>
  </div>

  <div class="bg-gradient-to-r from-emerald-50 to-emerald-100 py-15 w-full">
    <div class="mx-auto w-1000px">
      <p class="text-center text-6xl">🌱</p>
      <div class="text-3xl opacity-95 border-0 leading-15 text-center">Organic growth slowed down?<br>Low conversions?</div>
      <h2 class="text-4xl mb-13 border-0 leading-17 mt-3 text-center">Maybe some of your pages have <span class="border-blue-400 border-b-4">performance</span>, <span class="border-blue-400 border-b-4">accessibility</span> or <span class="border-blue-400 border-b-4">SEO</span> issues</h2>
      <div class="text-3xl opacity-95 border-0 mb-5 leading-15">Keeping on top of these issues site-wide is hard.</div>
      <ul class="text-2xl mb-7 border-0 leading-16 ml-0 pl-0">
        <li class="flex items-center">
          <i-carbon-close-outline class="mr-2 text-red-500/75" />
          Can be pricey to run monitoring with a third-party.
        </li>
        <li class="flex items-center">
          <i-carbon-close-outline class="mr-2 text-red-500/75" />
          Scanning just your home page is misleading.
        </li>
        <li class="flex items-center">
          <i-carbon-close-outline class="mr-2 text-red-500/75" />
          Scanning an entire site manually can be slow and inaccurate.
        </li>
        <li class="flex items-center">
          <i-carbon-close-outline class="mr-2 text-red-500/75" />
          Slow feedback loop in fixing issues.
        </li>
        <li class="flex items-center">
          <i-carbon-close-outline class="mr-2 text-red-500/75" />
          Too much noise when you have hundreds of pages.
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-gradient-to-r from-blue-100/10 to-emerald-100/10 py-15 w-full">
    <div class="container mx-auto flex flex-col items-start">
      <h2 id="features" class="text-4xl mb-7 text-center ">
        Scan your site quickly.
      </h2>
      <FeaturesList class="mb-10" :features="scanFeatures" />
    </div>
  </div>

  <div class="bg-gradient-to-r from-yellow-100 to-emerald-100 py-15 w-full">
    <div class="container mx-auto flex flex-col items-start">
      <h2 id="features" class="text-4xl mb-7 text-center ">
        Visualise, sort and filter results + goodies
      </h2>
      <FeaturesList class="mb-10" :features="features" />
    </div>
  </div>


  <div class="bg-gradient-to-r from-rose-100 to-teal-100 py-15 w-full">
    <div class="container mx-auto flex flex-col items-start">
      <h2 id="features" class="text-4xl mb-7 text-center ">
        Developer first
      </h2>
      <FeaturesList class="mb-10" :features="features2" />
    </div>
  </div>

  <div class="bg-gradient-to-r from-orange-500/20 to-teal-100 py-20 w-full">
    <div class="mb-15 w-1/2 mx-auto">
      <h3 id="integrations" class="text-4xl mb-7 border-0 opacity-95  ">
        🧑‍💻 Close the feedback loop with integrations
      </h3>
      <p class="text-xl mb-5">Finding issues with your site is one thing, fixing them is another. Unlighthouse comes packed with local development plugins for most popular frameworks.</p>
      <p class="text-xl">See which file belongs to a URL, fix your issue, Unlighthouse will automatically re-audit the page!</p>
    </div>
    <div class="flex w-700px text-2xl font-bold mx-auto items-center justify-between">
      <a href="/integrations/vite" class="flex justify-center items-center flex-col">
        <i-logos-vitejs class="mb-4 text-8xl" /><span>Vite</span>
      </a>
      <a href="/integrations/nuxt" class="flex justify-center items-center flex-col"><i-logos-nuxt-icon class="mb-4 text-8xl"></i-logos-nuxt-icon><span>Nuxt</span></a>
      <a href="/integrations/webpack" class="flex justify-center items-center flex-col"><i-logos-webpack class="mb-4 text-8xl"></i-logos-webpack><span>webpack</span></a>
    </div>
  </div>

  <h2 id="meet-the-team" class="text-4xl mb-7">
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

  <h2 id="contributors" class="text-4xl mb-7">
    Contributors
  </h2>
  <Contributors />
  <p>These people have financially supported the development of this package. Thanks!</p>

  <p><a href="https://unlighthouse.dev/chat">Join the community</a> and get involved!</p>

  <p class="text-center opacity-75">
    <a href="https://www.netlify.com">
      <img src="/netlify.svg" alt="Deploys by Netlify">
    </a>
  </p>
  <div class="mb-30" />
</div>
</template>
<style>
@keyframes moveBackground {
  from {
    background-position-x: 0;
  }
  to {
    background-position-x: 100%;
  }
}
.bg-image {
  animation-name: moveBackground;
  animation-duration: 6s;
  animation-play-state: paused;
  animation-direction: alternate;
  animation-fill-mode: both;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
.bg-image-wrap:hover .bg-image {
  animation-play-state: running;
}
</style>
