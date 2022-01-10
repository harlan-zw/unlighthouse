<template>
<div class="flex flex-col items-center">
  <div class="flex flex-row items-center justify-between my-10">
    <div class="flex flex-col items-left pt-10 pb-10 pr-20">
      <p class=" font-bold text-5xl text-left leading-16 font-normal ">
        <span class="opacity-95">Delightfully navigate your sites</span><br>
      </p>
      <div class="text-5xl font-bold" style="-webkit-text-fill-color: #0000;background-clip: text;-webkit-background-clip: text;-webkit-box-decoration-break: clone;background-image: linear-gradient(to bottom right,#047857 42%,#0d47ad 76%);">
        <span>Performance</span> · <span>Accessibility</span> ·<span> SEO</span>
      </div>
      <p class="text-2xl text-left leading-16 font-normal">
        <span class="opacity-80">With the power of <a href="https://github.com/GoogleChrome/lighthouse" target="_blank" font="bold">Lighthouse️</a></span><br>
      </p>

      <div class="flex items-center">
        <i-mdi-bash class="inline-block text-4xl opacity-60" />
        <code lang="bash" class="text-lg shadow rounded p-2 w-full ml-3 hover:bg-white transition">
          <pre>npm install -G unlighthouse</pre>
        </code>
      </div>
      <div>
        <p class="font-bold bg-blue-100 inline-block rounded-full px-3 py-1 leading-7 tracking-wide text-blue-700">
          <span>Now In Early Access</span>
        </p>
      </div>
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
            class="flex items-start bg-green-600 text-white hover:bg-green-700 w-300px transition children:hover:text-white"
        >
          <div  class="mr-2">
            <i-carbon-page-last class="inline-block text-3xl opacity-90" />
          </div>
          <div class="text-left">
            <p class="break-none m-0 text-xl">
              Get Started
            </p>
            <span class="opacity-85 text-sm">
              Install Unlighthouse and start improving your site.
            </span>
          </div>
        </btn-basic>
        <btn-basic
            href="/guide/why"
            class="flex items-start bg-blue-500 text-white hover:bg-blue-700 w-300px transition children:hover:text-white"
        >
          <div  class="mr-2">
            <i-carbon-page-last class="inline-block text-3xl opacity-90" />
          </div>
          <div class="text-left">
            <p class="break-none m-0 text-xl">
              Learn More
            </p>
            <span class="opacity-85 text-sm">
              Find out why Unlighthouse exists and how to make the most of it.
            </span>
          </div>
        </btn-basic>
      </div>
    </div>
    <div w="900px" h="527px" class="relative shadow-xl rounded-xl overflow-hidden">
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
