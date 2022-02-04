<template>
<div class="flex flex-col items-center">
  <div class="xl:flex max-w-full items-center justify-between my-10">
    <div class="flex flex-col items-left xl:pr-25">
      <p class="lg:leading-16 font-bold text-3xl lg:text-3xl font-normal mt-0">
        <span class="opacity-90">Delightfully scan your entire website with <br><img src="/lighthouse-logo.svg" height="60" class="h-60px inline mr-2"><a href="https://github.com/GoogleChrome/lighthouse" target="_blank" font="bold" class="text-inherit">Google Lighthouse️</a>. Navigate your</span><br>
      </p>
      <div class="leading-15 text-5xl mb-3 flex lg:flex-row flex-col lg:items-center font-bold" style="-webkit-text-fill-color: #0000;background-clip: text;-webkit-background-clip: text;-webkit-box-decoration-break: clone;background-image: linear-gradient(to bottom right,#047857 42%,#0d47ad 76%);">
        <span>Performance</span> <span class="px-3 hidden lg:block">·</span> <span>Accessibility</span> <span class="px-3 hidden lg:block">·</span><span> SEO</span>
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
          mt-5
          children:my0"
      >

        <btn-basic
            href="/guide/"
            class="flex items-center bg-green-600 text-white hover:(bg-green-700 scale-105) transform transition children:hover:text-white"
        >
          <i-carbon-terminal class="inline-block text-xl opacity-90 mr-2" />
          <p class="break-none m-0 text-xl">
            Get Started
          </p>
        </btn-basic>

      </div>

      <p class="mt-4 mb-3">or try it now</p>
      <div class="language-bash !m-0 inline-block relative">
        <div class="absolute p-2 bg-yellow-500/50 text-blue-50 rounded font-bold text-sm">
          Sponsors Only
        </div>
        <pre>
<code class="filter blur-sm select-none"><span class="opacity-50"># Install Unlighthouse globally - can take a few minutes</span>
<span class="token function">npm install --global</span> <span class="token text-[#408c9e] font-500">nice hacking skills :)</span><span class="opacity-50">
</span><span class="opacity-50"># Scan your website</span>
<span class="token function">unlighthouse-cli</span> <span class="token text-[#408c9e] font-500">--key value</span></code></pre>
      </div>
    </div>
    <div w="890px" class="relative h-450px xl:h-650px xl:w-890px w-full shadow-xl rounded-xl group max-w-full h-auto bg-image-wrap xl:mt-0 mt-10" style="box-shadow: rgb(0 0 0 / 20%) 0px 0px 0px 1px, rgb(0 0 0 / 50%) 0px 0px 30px 1px;">
      <div style="background-image: url('/screenshot.png');" class="bg-image max-w-full  w-1822px h-450px xl:h-650px absolute rounded-xl z-1">
      </div>
      <div class="w-full h-full absolute z-2 bg-gradient-to-l from-teal-800/20 rounded-xl">
      </div>
      <div class="absolute z-4 w-full flex items-center justify-center h-full">
        <div>
          <btn-basic
              target="_blank"
              href="https://inspect.unlighthouse.dev"
              class=" flex items-center bg-blue-500/95 transform group-hover:scale-120 text-white hover:bg-blue-700 transition children:hover:text-white"
          >
            <img src="/logo-light.svg" width="24" height="24" class="mr-2">
            <p class="break-none m-0 text-xl">
              Open Static Demo
            </p>
          </btn-basic>
        </div>
      </div>
    </div>
  </div>

  <div class="flex justify-center text-center">
    <sponsor-banner class="lg:w-600px mb-5" />
  </div>
  <div class="flex flex-col items-center">
    <h2 id="features" class="text-4xl mb-7 text-center">
      Features
    </h2>
    <FeaturesList class="mb-10 lg:w-600px" />
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
