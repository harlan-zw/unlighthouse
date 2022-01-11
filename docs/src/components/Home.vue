<template>
<div class="flex flex-col items-center">
  <div class="flex flex-row items-start justify-between my-10">
    <div class="flex flex-col items-left pt-10 pb-10 pr-20">
      <p class="leading-16 font-bold text-5xl font-normal mt-0">
        <span class="opacity-90">Delightfully navigate your sites</span><br>
      </p>
      <div class="leading-15 text-5xl mb-3 flex items-center justify-center font-bold" style="-webkit-text-fill-color: #0000;background-clip: text;-webkit-background-clip: text;-webkit-box-decoration-break: clone;background-image: linear-gradient(to bottom right,#047857 42%,#0d47ad 76%);">
        <span>Performance</span> <span class="px-3">·</span> <span>Accessibility</span> <span class="px-3">·</span><span> SEO</span>
      </div>
      <p class="text-xl opacity-90 font-normal">
        <span class="opacity-90">Powered by <img src="/lighthouse-logo.svg" height="60" class="h-60px inline mr-2"><a href="https://github.com/GoogleChrome/lighthouse" target="_blank" font="bold" class="text-inherit">Google Lighthouse️</a></span><br>
      </p>

      <div
          class="
          text-center
          flex
          flex-col
          sm:flex-row
          flex-wrap
          items-center
          gap-4
          mt-5
          children:my0"
      >

        <btn-basic
            href="/guide/"
            class="flex items-center bg-green-600 text-white hover:bg-green-700 transition children:hover:text-white"
        >
          <i-carbon-terminal class="inline-block text-2xl opacity-90 mr-2" />
          <p class="break-none m-0 text-xl">
            Get Started
          </p>
        </btn-basic>
        <btn-basic
            href="/guide/why"
            class="flex items-center bg-blue-500 text-white hover:bg-blue-700 transition children:hover:text-white"
        >
          <i-carbon-book class="inline-block text-2xl opacity-90 mr-2" />
          <div class="text-left">
            <p class="break-none m-0 text-xl">
              Learn More
            </p>
          </div>
        </btn-basic>
      </div>

      <div class="mt-5">
          <p class="mb-0">or try it now</p>
          <div class="language-bash inline-block">
            <pre>
<code><span class="opacity-50"> </span><span class="token function">npm install -G</span> <span class="token text-[#408c9e] font-500">unlighthouse</span><span class="opacity-50">
 </span><span class="token function">unlighthouse</span> <span class="token text-[#408c9e] font-500">--site https://harlanzw.com</span></code></pre>
          </div>
      </div>
    </div>
    <div w="900px" h="527px" class="relative shadow-xl rounded-xl overflow-hidden" style="box-shadow: 0 0 0 1px rgb(0 0 0 / 5%), 0 0 30px 1px rgb(0 0 0 / 15%);">
      <div style="background-image: url('/screenshot.png'); background-size: cover;" class="w-1171px h-527px absolute rounded-lg z-1">
      </div>
      <lighthouse-three-d class="mb-7 backdrop-blur-sm absolute top-15 left-70 z-2" />
    </div>
  </div>

  <h2 id="features" class="text-4xl mb-7">
    Features
  </h2>
  <FeaturesList class="mb-10" />

  <h2 id="meet-the-team" op50 font-normal pb-2>
    Meet the Team
  </h2>
  <div p-10>
    <Avatar
        name="Harlan Wilton"
        avatar="https://avatars.githubusercontent.com/u/5326365?v=4"
        github="harlan-zw"
        twitter="harlan_zw"
        :sponsors="true"
    >
      Self-employed Dev<br>Actively contributing to Open Source
    </Avatar>
  </div>
  <h3 id="the-team" op50 font-normal pt-5 pb-2>
    Contributors
  </h3>
  <p op80 text-lg max-w-150 text-center leading-7>
    <Contributors />
    <br>
    <a href="https://chat.unlighthouse.dev">Join the community</a> and get involved!
  </p>

  <p class="text-center opacity-75">
    <a href="https://www.netlify.com">
      <img src="/netlify.svg" alt="Deploys by Netlify">
    </a>
  </p>
  <div class="mb-30" />
</div>
</template>
