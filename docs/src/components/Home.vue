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
          gap-6
          mt-5
          children:my0"
      >

        <btn-basic
            href="/guide/"
            class="flex items-center bg-green-600 text-white hover:bg-green-700 transition children:hover:text-white"
        >
          <i-carbon-terminal class="inline-block text-xl opacity-90 mr-2" />
          <p class="break-none m-0 text-xl">
            Get Started
          </p>
        </btn-basic>
        <btn-basic
            href="/guide/why"
            class="flex items-center bg-blue-500/90 text-white hover:bg-blue-700 transition children:hover:text-white"
        >
          <img src="/logo-light.svg" width="24" height="24" class="mr-2">
          <p class="break-none m-0 text-xl">
            Open Demo
          </p>
        </btn-basic>
      </div>

      <p class="mt-4 mb-3">or try it now</p>
      <div class="language-bash !mt-0 inline-block">
            <pre>
<code><span class="opacity-50"># Install Unlighthouse globally - can take a few minutes</span>
<span class="token function">npm install --global</span> <span class="token text-[#408c9e] font-500">unlighthouse</span><span class="opacity-50">
</span><span class="opacity-50"># Scan your website</span>
<span class="token function">unlighthouse</span> <span class="token text-[#408c9e] font-500">--host https://harlanzw.com</span></code></pre>
      </div>
    </div>
    <div w="900px" h="527px" class="relative shadow-xl rounded-xl overflow-hidden group" style="box-shadow: 0 0 0 1px rgb(0 0 0 / 5%), 0 0 30px 1px rgb(0 0 0 / 15%);">
      <div style="background-image: url('/screenshot.png');" class="w-1171px h-527px absolute rounded-lg z-1">
      </div>
      <lighthouse-three-d class="mb-7 backdrop-blur-sm absolute top-15 left-70 z-2" />
    </div>
  </div>

  <h2 id="features" class="text-4xl mb-7">
    Features
  </h2>
  <FeaturesList class="mb-10 w-600px" />

  <h2 id="meet-the-team" class="text-4xl mb-7">
    Meet the Team
  </h2>
  <div class="p-10 grid gap-10 grid-cols-2">
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
